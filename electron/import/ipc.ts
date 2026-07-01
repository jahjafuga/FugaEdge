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
import { parseTradeZeroCsv } from './parse-tradezero'
import { parseLightspeedCsv } from './parse-lightspeed'
import { parseToSActivityCsv, parseToSStatementCsv } from './parse-tos'
import { parseTradeZeroSummaryCsv } from './parse-tradezero-summary'
import { parseWebullDesktopXlsx } from './parse-webull-desktop'
import { parseOceanOneXls, detectOceanOneXls } from './parse-ocean-one'
import { buildRoundTrips } from '@/core/import/build-round-trips'
import { deriveFeesUnavailable } from '@/core/import/feesUnavailable'
import { parseFilenameDate } from './parse-filename'
import { annotateFeeStatus, annotateTripStatus, commit, markSummariesSuperseded } from './repo'
import { formatCommitLog } from './format-commit-log'
import { refreshIntraday } from '../market/intraday'
import { bumpDataVersion } from '../lib/cache'
import { reconcileXpForDates } from '../xp/reconcile'
import { resolveCountriesForImportedSymbols } from './resolve-countries'
import { enrichFloatForImportedSymbols } from './enrich-float'
import { backfillAllFloat } from './backfill-float'
import { backfillAllDailyChange } from '../market/daily-change-backfill'
import { backfillAllProfiles } from './backfill-profile'
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
  // v0.2.2 — standalone float backfill over existing trades. Handler is a thin
  // shell (ARCHITECTURE rule 1): it wires per-symbol progress to the renderer
  // and delegates all logic to backfillAllFloat. Independent of COUNTRY_BACKFILL.
  ipcMain.handle(IPC.FLOAT_BACKFILL, async (e) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    const result = await backfillAllFloat({
      emitProgress: wc
        ? (p) => wc.send(IPC.FLOAT_BACKFILL_PROGRESS, p)
        : undefined,
    })
    if (result.filled > 0) bumpDataVersion()
    return result
  })

  // v0.2.5 Trader DNA — standalone daily % change backfill over existing trades.
  // Thin shell (ARCHITECTURE rule 1): wires per-symbol progress and delegates to
  // backfillAllDailyChange. The manual retry for the fire-once auto-arm.
  ipcMain.handle(IPC.DAILY_CHANGE_BACKFILL, async (e) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    const result = await backfillAllDailyChange({
      emitProgress: wc
        ? (p) => wc.send(IPC.DAILY_CHANGE_BACKFILL_PROGRESS, p)
        : undefined,
    })
    if (result.tradesFilled > 0) bumpDataVersion()
    return result
  })

  // v0.2.3 Stage A — standalone sector/industry backfill over existing
  // market_data rows. Thin shell (ARCHITECTURE rule 1): wires per-symbol
  // progress to the renderer and delegates to backfillAllProfiles. Independent
  // of FLOAT_BACKFILL / COUNTRY_BACKFILL.
  ipcMain.handle(IPC.PROFILE_BACKFILL, async (e, input?: { force?: boolean }) => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents ?? null
    const result = await backfillAllProfiles({
      force: input?.force === true,
      emitProgress: wc
        ? (p) => wc.send(IPC.PROFILE_BACKFILL_PROGRESS, p)
        : undefined,
    })
    if (result.filled > 0) bumpDataVersion()
    return result
  })

  ipcMain.handle(
    IPC.IMPORT_PREVIEW,
    async (_e, files: PreviewInputFile[], previewDate?: string): Promise<PreviewResult> => {
      const fileInfos: FileInfo[] = []
      const allExecutions = []
      // Round-trip-native parser output (Ocean One): trips that arrive already
      // built (with their own dedup hashes + 2 synthetic executions), merged
      // with the buildRoundTrips output below rather than fed through netting.
      const directTrips: RoundTrip[] = []
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

        // Ocean One .xls (OLE2) — routed by extension, then sheet-sniffed to
        // CONFIRM it's Ocean One before parsing, so a non-Ocean-One .xls fails
        // clean as "unrecognized" instead of crashing the parser. The parser is
        // round-trip-native: it emits RoundTrips directly into directTrips.
        if (f.filename.toLowerCase().endsWith('.xls')) {
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
          if (!detectOceanOneXls(f.bytes)) {
            fileInfos.push({
              filename: f.filename,
              format: 'unknown',
              filenameDateParsed: false,
              inferredDate: '',
              rowCount: 0,
            })
            issues.push(unknownFormat(f.filename))
            continue
          }
          try {
            const parsed = parseOceanOneXls(f.bytes, f.filename)
            skippedExecutions += parsed.skipped
            directTrips.push(...parsed.roundTrips)
            issues.push(
              ...csvParseIssues(f.filename, 'ocean_one', {
                kept: parsed.roundTrips.length,
                skipped: parsed.skipped,
                malformedRows: parsed.warnings.length,
                requiresDate: false,
              }),
            )
            fileInfos.push({
              filename: f.filename,
              format: 'ocean_one',
              filenameDateParsed: false,
              inferredDate: '',
              rowCount: parsed.roundTrips.length,
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
            const message = e instanceof Error ? e.message : String(e)
            fileInfos.push({
              filename: f.filename,
              format: 'unknown',
              filenameDateParsed: false,
              inferredDate: '',
              rowCount: 0,
            })
            issues.push(unknownFormat(f.filename))
            console.info(`[FJ import]   ${f.filename} Ocean One parse failed: ${message}`)
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
        } else if (fmt === 'tradezero') {
          executionFilesPresent = true
          const parsed = parseTradeZeroCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'tradezero', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: false,
            }),
          )
          fileInfos.push({
            filename: f.filename,
            format: 'tradezero',
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
        } else if (fmt === 'lightspeed') {
          executionFilesPresent = true
          const parsed = parseLightspeedCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'lightspeed', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: false,
            }),
          )
          fileInfos.push({
            filename: f.filename,
            format: 'lightspeed',
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
        } else if (fmt === 'tos_activity') {
          executionFilesPresent = true
          const parsed = parseToSActivityCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'tos_activity', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: false,
            }),
          )
          fileInfos.push({
            filename: f.filename,
            format: 'tos_activity',
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
        } else if (fmt === 'tos_statement') {
          executionFilesPresent = true
          const parsed = parseToSStatementCsv(f.text, f.filename)
          skippedExecutions += parsed.skipped
          allExecutions.push(...parsed.executions)
          issues.push(
            ...csvParseIssues(f.filename, 'tos_statement', {
              kept: parsed.executions.length,
              skipped: parsed.skipped,
              malformedRows: parsed.warnings.length,
              requiresDate: false,
            }),
          )
          fileInfos.push({
            filename: f.filename,
            format: 'tos_statement',
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
        } else if (fmt === 'tradezero_summary') {
          // TradeZero daily-summary: pre-aggregated round trips, NO date in the
          // file. The date is supplied by the preview prompt (previewDate). A
          // summary trip bakes the date into its dedup hashes at parse time, so
          // we can only build trips once we have it — until then, flag needsDate
          // and build none (the file still appears in the list). With a date,
          // parse → directTrips (round-trip-native, the Ocean One path).
          if (previewDate) {
            const parsed = parseTradeZeroSummaryCsv(f.text, previewDate, f.filename)
            directTrips.push(...parsed.roundTrips)
            issues.push(
              ...csvParseIssues(f.filename, 'tradezero_summary', {
                kept: parsed.roundTrips.length,
                skipped: parsed.skipped,
                malformedRows: parsed.warnings.length,
                requiresDate: false,
              }),
            )
            fileInfos.push({
              filename: f.filename,
              format: 'tradezero_summary',
              filenameDateParsed: false,
              inferredDate: previewDate,
              rowCount: parsed.roundTrips.length,
            })
            for (const t of parsed.trace) {
              if (t.outcome === 'skipped') {
                console.info(
                  `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                    (t.symbol ? ` symbol=${t.symbol}` : ''),
                )
              }
            }
          } else {
            needsDate = true
            issues.push(
              ...csvParseIssues(f.filename, 'tradezero_summary', {
                kept: 0,
                skipped: 0,
                malformedRows: 0,
                requiresDate: true,
              }),
            )
            fileInfos.push({
              filename: f.filename,
              format: 'tradezero_summary',
              filenameDateParsed: false,
              inferredDate: '',
              rowCount: 0,
            })
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

      // Merge fill-built trips with round-trip-native parser output (Ocean One).
      // annotateTripStatus marks new vs duplicate uniformly across both.
      const computedTrips = buildRoundTrips(allExecutions)
      // Phase 2 guard: after the hash dedup, drop any incoming SUMMARY trip whose
      // (symbol, date) is covered by an execution (DB or same batch) — summary
      // yields to executions. The reverse (execution superseding a pre-existing
      // DB summary) is enforced destructively in commit().
      const { trips, superseded: supersededTrips } = markSummariesSuperseded(
        annotateTripStatus([...computedTrips, ...directTrips]),
      )
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

      // Executions present, no companion fee file, AND no trip carries inline
      // fees → UI banner suggests dropping the Account Report. Inline-fee
      // brokers (Lightspeed, etc.) report fees, so the banner stays silent.
      const feesUnavailable = deriveFeesUnavailable(executionFilesPresent, feeFilesPresent, trips)

      const allDates = [
        ...allExecutions.map((e) => e.date),
        ...directTrips.map((t) => t.date),
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
        supersededTrips,
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

      // v0.2.5 XP hook (L11/L12 — the import act feeds session/streak
      // awards): fire-and-forget after save + bump, BEFORE the awaited
      // country block so XP latency never rides on a Polygon fetch. The
      // date set comes from ALL trips (inserted + resurrected + duplicate)
      // — over-reconciling a paid date is free by idempotency. A failure
      // delays XP by one launch (the sweep heals), never the import.
      const xpDates = Array.from(new Set(trips.map((t) => t.date)))
      void Promise.resolve()
        .then(() => reconcileXpForDates(xpDates))
        .catch((err) => console.warn('[xp hook]', err))

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
        formatCommitLog(out, {
          tripsIn: trips.length,
          toInsert: toInsertTrips.length,
          feesIn: fees.length,
          droppedNoDate,
          countriesResolved,
          countriesUnknown,
        }),
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
