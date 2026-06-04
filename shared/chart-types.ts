// Chart-feature IPC payloads. v0.2.4 branded screenshot: the renderer captures
// + composites the chart into PNG bytes; the MAIN process performs the file I/O
// (save dialog → writeFile) per ARCHITECTURE.md. Mirrors attachment-types.ts
// (binary input) + settings-types.ts ExportResult (canceled/path save result).

export interface SaveScreenshotInput {
  /** PNG bytes. Renderer fills this via canvas.toBlob() → Blob.arrayBuffer()
   *  → Uint8Array. Crosses IPC faithfully as a Uint8Array, same as attachment
   *  payloads — no base64 round-trip. */
  bytes: Uint8Array
  /** Suggested file name for the save dialog's defaultPath (e.g.
   *  "AAPL-2026-06-04-chart.png"). Main uses it only as the starting name; the
   *  user picks the final location. */
  suggestedName: string
}

export interface SaveScreenshotResult {
  /** True when the user dismissed the save dialog — mirrors ExportResult. */
  canceled: boolean
  /** Absolute path the PNG was written to. Present only when canceled is false. */
  path?: string
}
