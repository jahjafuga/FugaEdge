import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  CommitInput,
  CommitResult,
  DaySummaryFeeRow,
  FileInfo,
  ImportIssue,
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
import { backupBeforeImport } from '@/core/import/backup'
import { electronBackupStorage } from '../db/backup'
import {
  backupFailed,
  commitFailed,
  csvParseIssues,
  enrichmentFetchFailed,
  enrichmentNoApiKey,
  failedCommitResult,
  feeRowsDropped,
  fileNotDelivered,
  unknownFormat,
  xlsxMissingColumn,
  xlsxWrongSheet,
} from '@/core/import/import-errors'

export function registerImportIpc(): void {
  ipcMain.handle(
    IPC.IMPORT_PREVIEW,
    async (_e, files: PreviewInputFile[]): Promise<PreviewResult> => {
      const fileInfos: FileInfo[] = []
      const allExecutions = []
      const allFees: DaySummaryFeeRow[] = []
      let skippedExecutions = 0
      let skippedFeeRows = 0
      let needsDate = false
      let executionFilesPresent = false
      let feeFilesPresent = false
      // Day 9 — structured issues, surfaced on PreviewResult.issues.
      const issues: ImportIssue[] = []

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
            issues.push(fileNotDelivered(f.filename))
            continue
          }
          try {
            executionFilesPresent = true
            const parsed = await parseWebullDesktopXlsx(f.bytes, f.filename)
            skippedExecutions += parsed.skipped
            allExecutions.push(...parsed.executions)
            issues.push(
              ...csvParseIssues(f.filename, 'xlsx', {
                kept: parsed.executions.length,
                skipped: parsed.skipped,
                malformedRows: parsed.warnings.length,
                requiresDate: false,
              }),
            )
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
            if (message.includes('expected a sheet named')) {
              const found = message.split('found:')[1]?.trim() || '(none)'
              issues.push(xlsxWrongSheet(f.filename, found))
            } else if (message.includes('missing required column')) {
              const col =
                message.match(/missing required column "([^"]*)"/)?.[1] ??
                '(unknown)'
              issues.push(xlsxMissingColumn(f.filename, col))
            } else {
              issues.push(unknownFormat(f.filename))
            }
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
          issues.push(fileNotDelivered(f.filename))
          continue
        }

        const fmt = detectFormat(f.text)

        if (fmt === 'executions') {
          executionFilesPresent = true
          const parsed = parseExecutionsCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'executions', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: parsed.requiresDate,
            }),
          )
          fileInfos.push({
            filename: f.filename,
            format: 'executions',
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
        } else if (fmt === 'tradehistory') {
          executionFilesPresent = true
          const parsed = parseTradeHistoryCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'tradehistory', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: false,
            }),
          )
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
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'trades_window', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: parsed.requiresDate,
            }),
          )
          fileInfos.push({
            filename: f.filename,
            format: 'trades_window',
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
        } else if (fmt === 'webull_mobile') {
          executionFilesPresent = true
          const parsed = parseWebullMobileCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'webull_mobile', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: false,
            }),
          )
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
          console.info(
            `[FJ import] ${f.filename} daily-summary headers=[${parsed.headers.join(' | ')}]`,
          )
          const { date, parsed: dateParsed } = parseFilenameDate(f.filename)
          if (!dateParsed) needsDate = true
          issues.push(
            ...csvParseIssues(f.filename, 'daily-summary', {
              kept: parsed.rows.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: !dateParsed,
            }),
          )
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
          issues.push(unknownFormat(f.filename))
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
        issues,
      }
    },
  )

  ipcMain.handle(
    IPC.IMPORT_COMMIT,
    async (e, { trips, fees, feeDateOverride }: CommitInput): Promise<CommitResult> => {
      // Day 7.5: snapshot the DB before any executions / round_trips are
      // written. Day 9: a backup failure is caught and returned as a
      // structured BACKUP_FAILED issue — a thrown error's custom fields don't
      // survive the IPC boundary, so the failure must travel back as data.
      // The import still aborts; the database is untouched.
      const issues: ImportIssue[] = []
      try {
        const backup = await backupBeforeImport(electronBackupStorage)
        console.info(
          `[FJ backup] pre-import backup → ${backup.path} (${backup.bytes} bytes)`,
        )
      } catch (err) {
        console.error(
          `[FJ backup] pre-import backup failed, import aborted: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        return failedCommitResult([backupFailed()])
      }

      // Apply the date override to any fee row missing a date.
      const finalFees: DaySummaryFeeRow[] = fees.map((f) =>
        f.date ? f : { ...f, date: feeDateOverride ?? '' },
      )
      // Drop any fee row still missing a date — caller forgot to provide one.
      const usableFees = finalFees.filter((f) => f.date)
      const droppedNoDate = finalFees.length - usableFees.length

      const reAnnotatedFees = annotateFeeStatus(usableFees)
      const toInsertTrips: RoundTrip[] = trips.filter((t) => t.status !== 'duplicate')
      let out: ReturnType<typeof commit>
      try {
        out = commit(toInsertTrips, reAnnotatedFees, '')
      } catch (err) {
        console.error(
          `[FJ commit] commit failed and rolled back: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        return failedCommitResult([commitFailed()])
      }
      if (droppedNoDate > 0) issues.push(feeRowsDropped(droppedNoDate))

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
      let countryApiKeyMissing = false
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
          countryApiKeyMissing = country.apiKeyMissing
          // Day 9 — surface enrichment state as structured issues. No API
          // key is fully knowable here (sync settings read); a country fetch
          // failure is too, because country is awaited. Float/aggregates run
          // fire-and-forget below, so their fetch failures are NOT knowable
          // at return time — they stay log-only until the v0.3.0
          // IMPORT_PROGRESS renderer subscriber lands.
          if (country.apiKeyMissing) {
            issues.push(enrichmentNoApiKey())
          } else if (country.errors.length > 0) {
            const errText = country.errors.map((x) => x.message).join(' ')
            const reason = errText.includes('429')
              ? 'rate limit'
              : errText.includes('403')
                ? 'plan limit'
                : 'network or API error'
            issues.push(enrichmentFetchFailed(country.errors.length, reason))
          }
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
        countryApiKeyMissing,
        // Fire-and-forget — not knowable at return time. v0.3.0 ticket
        // import-progress-ui-renderer-consumer will populate via IPC
        // progress events instead.
        floatErrored: 0,
        aggregatesErrored: 0,
        issues,
      }
    },
  )
}
