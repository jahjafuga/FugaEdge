import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  CommitInput,
  CommitResult,
  DaySummaryFeeRow,
  FileInfo,
  PreviewInputFile,
  PreviewResult,
  PreviewSummary,
  RoundTrip,
} from '@shared/import-types'
import { detectFormat } from './detect-format'
import { parseExecutionsCsv } from './parse-executions'
import { parseTradeHistoryCsv } from './parse-tradehistory'
import { parseTradesWindowCsv } from './parse-trades-window'
import { parseDailySummaryCsv } from './parse-daily-summary'
import { parseWebullMobileCsv } from './parse-webull-mobile'
import { parseWebullDesktopXlsx } from './parse-webull-desktop'
import { buildRoundTrips } from '@/core/import/build-round-trips'
import { parseFilenameDate } from './parse-filename'
import { annotateFeeStatus, annotateTripStatus, commit } from './repo'
import { refreshIntraday } from '../market/intraday'
import { bumpDataVersion } from '../lib/cache'
import { resolveCountriesForImportedSymbols } from './resolve-countries'
import { enrichFloatForImportedSymbols } from './enrich-float'
import { enrichAggregatesForImportedSymbols } from './enrich-aggregates'

export function registerImportIpc(): void {
  ipcMain.handle(
    IPC.IMPORT_PREVIEW,
    async (_e, files: PreviewInputFile[]): Promise<PreviewResult> => {
      const fileInfos: FileInfo[] = []
      const allExecutions = []
      const allFees: DaySummaryFeeRow[] = []
      const warnings: string[] = []
      let skippedExecutions = 0
      let skippedFeeRows = 0
      let needsDate = false
      let executionFilesPresent = false
      let feeFilesPresent = false
      // Per-file "requires date" rollup — used to upgrade the per-row trace
      // into a top-level warning that tells the user what to do.
      const filesNeedingDate: string[] = []

      for (const f of files) {
        // XLSX is routed by file extension BEFORE detect-format. XLSX has
        // no text first-row to sniff; the renderer reads .xlsx files as
        // bytes (Uint8Array via file.arrayBuffer()) and sends them on
        // PreviewInputFile.bytes. Currently the only XLSX format we
        // support is Webull Desktop.
        if (f.filename.toLowerCase().endsWith('.xlsx')) {
          if (!f.bytes) {
            fileInfos.push({
              filename: f.filename,
              format: 'unknown',
              filenameDateParsed: false,
              inferredDate: '',
              rowCount: 0,
            })
            warnings.push(
              `${f.filename}: XLSX file received but bytes field missing — likely a renderer/IPC mismatch`,
            )
            continue
          }
          try {
            executionFilesPresent = true
            const parsed = await parseWebullDesktopXlsx(f.bytes, f.filename)
            skippedExecutions += parsed.skipped
            warnings.push(...parsed.warnings.map((w) => `${f.filename}: ${w}`))
            allExecutions.push(...parsed.executions)
            fileInfos.push({
              filename: f.filename,
              format: 'xlsx',
              filenameDateParsed: false,
              inferredDate: '',
              rowCount: parsed.executions.length,
            })
            for (const t of parsed.trace) {
              if (t.outcome === 'skipped') {
                console.info(
                  `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                    (t.symbol ? ` symbol=${t.symbol}` : ''),
                )
              }
            }
          } catch (e) {
            // Structural failures (wrong sheet name, missing required
            // column, non-XLSX byte payload) surface here as thrown
            // errors from parseWebullDesktopXlsx. Convert to a warning
            // + mark the file unknown so the rest of the batch still
            // imports cleanly instead of the whole preview failing.
            const message = e instanceof Error ? e.message : String(e)
            fileInfos.push({
              filename: f.filename,
              format: 'unknown',
              filenameDateParsed: false,
              inferredDate: '',
              rowCount: 0,
            })
            warnings.push(`${f.filename}: XLSX parse failed: ${message}`)
          }
          continue
        }

        // CSV path needs text. Renderer should always populate it for
        // non-XLSX files; a missing value here means a renderer bug.
        if (typeof f.text !== 'string') {
          fileInfos.push({
            filename: f.filename,
            format: 'unknown',
            filenameDateParsed: false,
            inferredDate: '',
            rowCount: 0,
          })
          warnings.push(
            `${f.filename}: file received but text field missing — likely a renderer issue`,
          )
          continue
        }

        const fmt = detectFormat(f.text)

        if (fmt === 'executions') {
          executionFilesPresent = true
          const parsed = parseExecutionsCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          warnings.push(...parsed.warnings.map((w) => `${f.filename}: ${w}`))
          allExecutions.push(...parsed.executions)
          fileInfos.push({
            filename: f.filename,
            format: 'executions',
            filenameDateParsed: false,
            inferredDate: '',
            rowCount: parsed.executions.length,
          })
          if (parsed.requiresDate) {
            filesNeedingDate.push(f.filename)
          }

          for (const t of parsed.trace) {
            if (t.outcome === 'skipped') {
              console.info(
                `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                  (t.symbol ? ` symbol=${t.symbol}` : ''),
              )
            }
          }
        } else if (fmt === 'tradehistory') {
          executionFilesPresent = true
          const parsed = parseTradeHistoryCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          warnings.push(...parsed.warnings.map((w) => `${f.filename}: ${w}`))
          allExecutions.push(...parsed.executions)
          fileInfos.push({
            filename: f.filename,
            format: 'tradehistory',
            filenameDateParsed: false,
            inferredDate: '',
            rowCount: parsed.executions.length,
          })
          for (const t of parsed.trace) {
            if (t.outcome === 'skipped') {
              console.info(
                `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                  (t.symbol ? ` symbol=${t.symbol}` : ''),
              )
            }
          }
        } else if (fmt === 'trades_window') {
          executionFilesPresent = true
          const parsed = parseTradesWindowCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          warnings.push(...parsed.warnings.map((w) => `${f.filename}: ${w}`))
          allExecutions.push(...parsed.executions)
          fileInfos.push({
            filename: f.filename,
            format: 'trades_window',
            filenameDateParsed: false,
            inferredDate: '',
            rowCount: parsed.executions.length,
          })
          if (parsed.requiresDate) filesNeedingDate.push(f.filename)
          for (const t of parsed.trace) {
            if (t.outcome === 'skipped') {
              console.info(
                `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                  (t.symbol ? ` symbol=${t.symbol}` : ''),
              )
            }
          }
        } else if (fmt === 'webull_mobile') {
          executionFilesPresent = true
          const parsed = parseWebullMobileCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          warnings.push(...parsed.warnings.map((w) => `${f.filename}: ${w}`))
          allExecutions.push(...parsed.executions)
          fileInfos.push({
            filename: f.filename,
            format: 'webull_mobile',
            filenameDateParsed: false,
            inferredDate: '',
            rowCount: parsed.executions.length,
          })
          for (const t of parsed.trace) {
            if (t.outcome === 'skipped') {
              console.info(
                `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                  (t.symbol ? ` symbol=${t.symbol}` : ''),
              )
            }
          }
        } else if (fmt === 'daily-summary') {
          feeFilesPresent = true
          const parsed = parseDailySummaryCsv(f.text)
          skippedFeeRows += parsed.skipped
          warnings.push(...parsed.warnings.map((w) => `${f.filename}: ${w}`))
          console.info(
            `[FJ import] ${f.filename} daily-summary headers=[${parsed.headers.join(' | ')}]`,
          )
          const { date, parsed: dateParsed } = parseFilenameDate(f.filename)
          if (!dateParsed) needsDate = true
          fileInfos.push({
            filename: f.filename,
            format: 'daily-summary',
            filenameDateParsed: dateParsed,
            inferredDate: date,
            rowCount: parsed.rows.length,
          })
          for (const r of parsed.rows) {
            allFees.push({
              date,
              symbol: r.symbol,
              fee_ecn: r.fee_ecn,
              fee_sec: r.fee_sec,
              fee_finra: r.fee_finra,
              fee_htb: r.fee_htb,
              fee_cat: r.fee_cat,
              total_fees: r.total_fees,
              status: 'new',
              matchedTrips: 0,
            })
          }
          for (const t of parsed.trace) {
            if (t.outcome === 'skipped') {
              console.info(
                `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                  (t.symbol ? ` symbol=${t.symbol}` : ''),
              )
            }
          }
        } else {
          fileInfos.push({
            filename: f.filename,
            format: 'unknown',
            filenameDateParsed: false,
            inferredDate: '',
            rowCount: 0,
          })
          warnings.push(
            `${f.filename}: format not recognized. Supported: DAS Trades.csv (TradeID-led), DAS Trades-window (Date+Time+P&L), DAS Trades-window (Cloid+LiqType, bare-time — filename needs a date), DAS daily summary CSV, Webull Mobile (Name-led CSV), and Webull Desktop (XLSX).`,
          )
        }
      }

      // If the user dropped an executions file in the same batch as a
      // dateless daily summary, and the executions cover exactly one date,
      // use that date for the fees so they don't have to type it in.
      const execDates = new Set(allExecutions.map((e) => e.date))
      if (needsDate && execDates.size === 1) {
        const onlyDate = execDates.values().next().value as string
        for (const f of allFees) if (!f.date) f.date = onlyDate
        for (const fi of fileInfos) {
          if (fi.format === 'daily-summary' && !fi.inferredDate) {
            fi.inferredDate = onlyDate
            fi.filenameDateParsed = false
          }
        }
        needsDate = false
      }

      const computedTrips = buildRoundTrips(allExecutions)
      const trips = annotateTripStatus(computedTrips)
      // Fees status depends on day_fees lookup; only annotate the ones that
      // already have a date.
      const feesWithDate = allFees.filter((f) => f.date)
      const feesWithoutDate = allFees.filter((f) => !f.date)
      const fees = [...annotateFeeStatus(feesWithDate), ...feesWithoutDate]

      // Bump matchedTrips for fees whose (date, symbol) is also coming in
      // from the executions file in this same batch.
      const incomingPairs = new Map<string, number>()
      for (const t of trips) {
        const k = `${t.date}|${t.symbol}`
        incomingPairs.set(k, (incomingPairs.get(k) ?? 0) + 1)
      }
      for (const f of fees) {
        const extra = incomingPairs.get(`${f.date}|${f.symbol}`) ?? 0
        f.matchedTrips += extra
      }

      const newTrips = trips.filter((t) => t.status === 'new').length
      const duplicateTrips = trips.length - newTrips
      const openTrips = trips.filter((t) => t.is_open).length
      const newFeeRows = fees.filter((f) => f.status === 'new').length
      const replaceFeeRows = fees.length - newFeeRows

      // Dateless-execution guardrail. When a Trades.csv has rows whose
      // `time` column lacks a date AND the filename couldn't supply one,
      // the parser flagged the file in `filesNeedingDate`. Surface that
      // as a top-level warning the user can actually act on (rename the
      // file) instead of letting the rows silently disappear.
      if (filesNeedingDate.length > 0) {
        for (const name of filesNeedingDate) {
          warnings.push(
            `${name}: rows lacked a date and the filename couldn't supply one. ` +
              `Rename to include a date (e.g. trades_2026-05-15.csv) or ` +
              `use an export that includes a Date column.`,
          )
        }
      }

      // Executions present but no companion fee file → UI banner suggests
      // dropping the Account Report. Import still proceeds; trips carry
      // fees_reported=false.
      const feesUnavailable = executionFilesPresent && !feeFilesPresent

      const allDates = [
        ...allExecutions.map((e) => e.date),
        ...fees.map((f) => f.date).filter(Boolean),
      ]
      const dateRange = allDates.length
        ? {
            from: allDates.reduce((a, b) => (a < b ? a : b)),
            to: allDates.reduce((a, b) => (a > b ? a : b)),
          }
        : null

      const summary: PreviewSummary = {
        totalExecutions: allExecutions.length,
        totalTrips: trips.length,
        newTrips,
        duplicateTrips,
        openTrips,
        totalFeeRows: fees.length,
        newFeeRows,
        replaceFeeRows,
        skippedExecutions,
        skippedFeeRows,
      }

      console.info(
        `[FJ import] files=${files.length} ` +
          `execs=${allExecutions.length}(skipped=${skippedExecutions}) ` +
          `trips=${trips.length}(new=${newTrips} dup=${duplicateTrips} open=${openTrips}) ` +
          `fees=${fees.length}(new=${newFeeRows} replace=${replaceFeeRows} skipped=${skippedFeeRows}) ` +
          `range=${dateRange ? `${dateRange.from}..${dateRange.to}` : 'n/a'} ` +
          `needsDate=${needsDate}`,
      )

      return {
        files: fileInfos,
        trips,
        fees,
        needsDate,
        feesUnavailable,
        dateRange,
        summary,
        warnings,
      }
    },
  )

  ipcMain.handle(
    IPC.IMPORT_COMMIT,
    async (e, { trips, fees, feeDateOverride }: CommitInput): Promise<CommitResult> => {
      // Apply the date override to any fee row missing a date.
      const finalFees: DaySummaryFeeRow[] = fees.map((f) =>
        f.date ? f : { ...f, date: feeDateOverride ?? '' },
      )
      // Drop any fee row still missing a date — caller forgot to provide one.
      const usableFees = finalFees.filter((f) => f.date)
      const droppedNoDate = finalFees.length - usableFees.length

      const reAnnotatedFees = annotateFeeStatus(usableFees)
      const toInsertTrips: RoundTrip[] = trips.filter((t) => t.status !== 'duplicate')
      const out = commit(toInsertTrips, reAnnotatedFees, '')

      // Any successful commit invalidates analytics/reports caches.
      // Bump even on zero-insert (caller may have edited fees-only without
      // new trips — fees still affect every aggregate).
      bumpDataVersion()

      // Post-commit enrichment for newly-imported symbols.
      //
      // Patch A (Day 7A commit 5.76): split the await pattern. Country
      // is awaited because the import-complete toast displays
      // countriesUnknown synchronously. Float + aggregates are fired
      // forget — their wrappers run in the background and log results
      // when they finish. This restores the pre-Commit-5 UX where the
      // IPC handler returns within ~10s of import-complete; without
      // the split, withRateLimitRetry's deeper backoff could keep the
      // handler awaiting for 10-30 minutes under free-tier rate-limit
      // pressure (Day 7A commit 5.75 smoke-test regression).
      //
      // floatErrored / aggregatesErrored counters on CommitResult are
      // always 0 here — the values aren't known when the handler
      // returns. The v0.3.0 import-progress UI ticket will switch to
      // a renderer-side subscriber on IMPORT_PROGRESS for live counts;
      // src/core/import/post-commit-enrich.ts (the 3-phase composer)
      // is kept for that future re-wire.
      const newSymbols = Array.from(
        new Set(toInsertTrips.map((t) => t.symbol)),
      ).sort()
      let countriesResolved = 0
      let countriesUnknown = 0
      if (out.insertedTrips > 0 && newSymbols.length > 0) {
        const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
        const sendProgress = wc
          ? (phase: 'country' | 'float' | 'aggregates') =>
              (p: { current: number; total: number; symbol: string }) =>
                wc.send(IPC.IMPORT_PROGRESS, { phase, ...p })
          : null

        // ── Awaited: country (toast reads countriesUnknown sync) ──
        // Country wrapper doesn't accept onProgress today — country
        // orchestrator has no emitProgress hook. Extending both is
        // bundled into the v0.3.0 import-progress UI ticket since
        // that's the consumer; float + aggregates phases emit
        // progress events already so the channel isn't dead.
        try {
          const country = await resolveCountriesForImportedSymbols(newSymbols)
          countriesResolved = country.resolved
          countriesUnknown = country.unknown
          if (country.errors.length > 0) {
            console.info(
              `[FE import] country resolution errors: ` +
                country.errors.map((err) => `${err.symbol}=${err.message}`).join(', '),
            )
          }
          if (countriesResolved > 0) bumpDataVersion()
        } catch (err) {
          // resolveCountriesForImport's per-symbol catch means this
          // shouldn't fire, but guard the import either way.
          console.info(
            `[FE import] country resolution unexpected error: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          )
          countriesUnknown = newSymbols.length
        }

        // ── Fire-and-forget: float (trade cards) ──
        enrichFloatForImportedSymbols(newSymbols, sendProgress?.('float'))
          .then((r) => {
            console.info(
              `[FE import] float fetched=${r.fetched} missing=${r.missing} errored=${r.errored}`,
            )
            if (r.errors.length > 0) {
              console.info(
                `[FE import] float enrichment errors: ` +
                  r.errors.map((err) => `${err.symbol}=${err.message}`).join(', '),
              )
            }
            if (r.fetched > 0) bumpDataVersion()
          })
          .catch((err) => {
            console.info(
              `[FE import] float background error: ` +
                `${err instanceof Error ? err.message : String(err)}`,
            )
          })

        // ── Fire-and-forget: aggregates (RVOL inputs) ──
        enrichAggregatesForImportedSymbols(newSymbols, sendProgress?.('aggregates'))
          .then((r) => {
            console.info(
              `[FE import] aggregates fetched=${r.fetched} empty=${r.empty} errored=${r.errored}`,
            )
            if (r.errors.length > 0) {
              console.info(
                `[FE import] aggregates enrichment errors: ` +
                  r.errors.map((err) => `${err.symbol}=${err.message}`).join(', '),
              )
            }
            if (r.fetched > 0) bumpDataVersion()
          })
          .catch((err) => {
            console.info(
              `[FE import] aggregates background error: ` +
                `${err instanceof Error ? err.message : String(err)}`,
            )
          })
      }

      // Fire-and-forget intraday bars for the new (symbol, date) pairs.
      // Chart placeholders show whatever is cached and update next visit.
      if (out.insertedTrips > 0) {
        refreshIntraday().catch((err) => {
          console.info(
            `[FE intraday] background refresh error: ${err instanceof Error ? err.message : String(err)}`,
          )
        })
      }

      // [FJ commit] log fires before float/aggregates finish — those
      // counters land in their own [FE import] log lines as each
      // background phase completes.
      console.info(
        `[FJ commit] trips_in=${trips.length}(insert=${toInsertTrips.length}) ` +
          `fees_in=${fees.length} (dropped_no_date=${droppedNoDate}) ` +
          `inserted_trips=${out.insertedTrips} skipped_trips=${out.skippedTrips} ` +
          `inserted_fees=${out.insertedFees} replaced_fees=${out.replacedFees} ` +
          `pairs=${out.affectedPairs} dates=[${out.affectedDates.join(',')}] ` +
          `country_resolved=${countriesResolved} country_unknown=${countriesUnknown}`,
      )

      console.log('[FJ commit return]', {
        at: new Date().toISOString(),
        inserted_trips: out.insertedTrips,
      })

      return {
        ...out,
        countriesResolved,
        countriesUnknown,
        // Fire-and-forget — not knowable at return time. v0.3.0 ticket
        // import-progress-ui-renderer-consumer will populate via IPC
        // progress events instead.
        floatErrored: 0,
        aggregatesErrored: 0,
      }
    },
  )
}
