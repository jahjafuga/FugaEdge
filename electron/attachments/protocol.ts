import { protocol } from 'electron'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { getTradeAttachmentDir } from './dir'

// Custom Electron protocol that serves files from the attachments directory.
// URL shape: electron://attachments/<tradeId>/<filename>
//
// Implementation reads the file straight off disk into a Buffer and returns
// a Response with an explicit Content-Type. This avoids the previous
// `net.fetch(file://...)` roundtrip which silently failed on some Windows
// builds. The handler also short-circuits common failure modes with crisp
// HTTP-style errors so 4xx/5xx is observable from the renderer DevTools.

const SCHEME = 'electron'
const HOST = 'attachments'

// Map common image extensions to their MIME type. The whitelist matches the
// add-attachments service so we never serve content we didn't accept on the
// way in.
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

// Must run BEFORE app is ready. Imported from a module that loads at main
// startup; calling registerSchemesAsPrivileged after app.ready is a no-op.
export function registerAttachmentProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
      },
    },
  ])
}

// Called inside whenReady — wires the actual handler.
export function registerAttachmentProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // For `electron://attachments/12/uuid.png`:
      //   url.hostname → "attachments"
      //   url.pathname → "/12/uuid.png"
      if (url.hostname !== HOST) {
        console.warn(`[FE attach] rejected wrong host: ${url.hostname}`)
        return new Response('not found', { status: 404 })
      }
      const path = url.pathname.replace(/^\/+/, '')
      const slash = path.indexOf('/')
      if (slash < 1 || slash === path.length - 1) {
        console.warn(`[FE attach] rejected bad path: ${path}`)
        return new Response('bad request', { status: 400 })
      }
      const tradeIdStr = path.slice(0, slash)
      const filenameRaw = decodeURIComponent(path.slice(slash + 1))

      // Defense against path traversal — filename must be a single segment.
      if (
        !filenameRaw ||
        filenameRaw.includes('/') ||
        filenameRaw.includes('\\') ||
        filenameRaw.includes('..')
      ) {
        console.warn(`[FE attach] rejected bad filename: ${filenameRaw}`)
        return new Response('forbidden', { status: 403 })
      }

      const tradeId = Number(tradeIdStr)
      if (!Number.isFinite(tradeId) || tradeId < 0) {
        console.warn(`[FE attach] rejected bad trade id: ${tradeIdStr}`)
        return new Response('bad request', { status: 400 })
      }

      const ext = extname(filenameRaw).toLowerCase()
      const mime = MIME_BY_EXT[ext]
      if (!mime) {
        console.warn(`[FE attach] rejected unsupported ext: ${ext}`)
        return new Response('unsupported media type', { status: 415 })
      }

      const fsPath = join(getTradeAttachmentDir(tradeId), filenameRaw)
      if (!existsSync(fsPath)) {
        console.warn(`[FE attach] not found: ${fsPath}`)
        return new Response('not found', { status: 404 })
      }

      const data = readFileSync(fsPath)
      const stat = statSync(fsPath)

      // Convert Node Buffer to a regular Uint8Array so the Response body is a
      // plain BufferSource — avoids subclassing surprises in Chromium fetch.
      const body = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(stat.size),
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(`[FE attach] handler error: ${message}`)
      return new Response(`error: ${message}`, { status: 500 })
    }
  })
}
