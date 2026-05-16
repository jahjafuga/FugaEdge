import { ipcMain } from 'electron'
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
import { parseDailySummaryCsv } from './parse-daily-summary'
import { buildRoundTrips } from '@/core/import/build-round-trips'
import { parseFilenameDate } from './parse-filename'
import { annotateFeeStatus, annotateTripStatus, backfillFloatShares, backfillTradeCountriesFromMarket, commit } from './repo'
import { refreshMarketData } from '../market/fetch'
import { refreshIntraday } from '../market/intraday'
import { bumpDataVersion } from '../lib/cache'
import { resolveCountriesForImportedSymbols } from './resolve-countries'

export function registerImportIpc(): void {
  ipcMain.handle(
    IPC.IMPORT_PREVIEW,
    (_e, files: PreviewInputFile[]): PreviewResult => {
      const fileInfos: FileInfo[] = []
      const allExecutions = []
      const allFees: DaySummaryFeeRow[] = []
      const warnings: string[] = []
      let skippedExecutions = 0
      let skippedFeeRows = 0
      let needsDate = false

      for (const f of files) {
        const fmt = detectFormat(f.text)

        if (fmt === 'executions') {
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

          for (const t of parsed.trace) {
            if (t.outcome === 'skipped') {
              console.info(
                `[FJ import]   ${f.filename} row ${t.row} skipped: ${t.reason}` +
                  (t.symbol ? ` symbol=${t.symbol}` : ''),
              )
            }
          }
        } else if (fmt === 'tradehistory') {
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
        } else if (fmt === 'daily-summary') {
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
            `${f.filename}: format not recognized (expected DAS Trades.csv, DAS Trades-window export, or DAS daily summary)`,
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
        dateRange,
        summary,
        warnings,
      }
    },
  )

  ipcMain.handle(
    IPC.IMPORT_COMMIT,
    async (_e, { trips, fees, feeDateOverride }: CommitInput): Promise<CommitResult> => {
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

      // Auto-detect country per newly-inserted symbol using the same Polygon
      // ticker reference the float fetch uses. Awaited so the import-complete
      // toast can report a gap (vs. v0.1.2's fire-and-forget refresh, which
      // left trades at country=NULL until the user clicked Backfill).
      // Errors are recorded as `countriesUnknown`; the import itself never
      // blocks on a Polygon failure.
      const newSymbols = Array.from(
        new Set(toInsertTrips.map((t) => t.symbol)),
      ).sort()
      let countriesResolved = 0
      let countriesUnknown = 0
      if (out.insertedTrips > 0 && newSymbols.length > 0) {
        try {
          const r = await resolveCountriesForImportedSymbols(newSymbols)
          countriesResolved = r.resolved
          countriesUnknown = r.unknown
          if (r.errors.length > 0) {
            console.info(
              `[FE import] country resolution errors: ` +
                r.errors.map((e) => `${e.symbol}=${e.message}`).join(', '),
            )
          }
          if (countriesResolved > 0) bumpDataVersion()
        } catch (e) {
          // Should never throw — the orchestrator catches per-symbol — but
          // guard the import either way.
          console.info(
            `[FE import] country resolution unexpected error: ${e instanceof Error ? e.message : String(e)}`,
          )
          countriesUnknown = newSymbols.length
        }
      }

      // Fire-and-forget: pull market data for any newly-touched symbols, and
      // intraday bars for the new (symbol, date) pairs. The renderer doesn't
      // wait — Reports/Analytics shows whatever is cached and updates next
      // visit. Errors are logged inside each refresh function.
      if (out.insertedTrips > 0) {
        refreshMarketData()
          .then(() => {
            // Backfill float_shares for symbols market_data didn't have at
            // commit time but now does after the refresh. Silent on any
            // error — the modal Float field is editable as a fallback.
            try {
              const filled = backfillFloatShares()
              if (filled > 0) {
                console.info(`[FE import] backfilled float_shares for ${filled} trades`)
              }
              // Country was resolved per-ticker during refreshMarketData and
              // cached on market_data; copy it onto the new trades the same
              // way float is copied. Pure SQL — no extra Polygon calls.
              const countryFilled = backfillTradeCountriesFromMarket()
              if (countryFilled > 0) {
                console.info(`[FE import] backfilled country for ${countryFilled} trades`)
              }
            } catch (e) {
              console.info(
                `[FE float] backfill error: ${e instanceof Error ? e.message : String(e)}`,
              )
            }
          })
          .catch((e) => {
            console.info(
              `[FE market] background refresh error: ${e instanceof Error ? e.message : String(e)}`,
            )
          })
        refreshIntraday().catch((e) => {
          console.info(
            `[FE intraday] background refresh error: ${e instanceof Error ? e.message : String(e)}`,
          )
        })
      }

      console.info(
        `[FJ commit] trips_in=${trips.length}(insert=${toInsertTrips.length}) ` +
          `fees_in=${fees.length} (dropped_no_date=${droppedNoDate}) ` +
          `inserted_trips=${out.insertedTrips} skipped_trips=${out.skippedTrips} ` +
          `inserted_fees=${out.insertedFees} replaced_fees=${out.replacedFees} ` +
          `pairs=${out.affectedPairs} dates=[${out.affectedDates.join(',')}] ` +
          `country_resolved=${countriesResolved} country_unknown=${countriesUnknown}`,
      )

      return { ...out, countriesResolved, countriesUnknown }
    },
  )
}
