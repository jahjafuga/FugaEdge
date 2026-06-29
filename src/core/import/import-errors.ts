// Day 9 — structured import errors.
//
// Pure catalog: every user-facing import problem maps to one ImportIssue
// with a plain-English message + actionable text. No electron / fs / sqlite
// imports, so it runs in the renderer, the Electron main process, and a
// future web build alike. electron/import/ipc.ts translates the pipeline
// (parsers, detect-format, fee match, enrichment) into ImportIssue[]; the
// import UI renders them. No i18n yet — deferred to v0.3.0.

import type { CommitResult, ImportIssue } from '@shared/import-types'

// ── GitHub issue prefills ─────────────────────────────────────────────────
// Two distinct templates. A broker request and a bug report must NOT share
// a URL — a user filing a database bug should never land in a "Broker
// request" template. The renderer picks URL + button label from
// issue.requestKind.

/** Prefilled "Broker request" issue — asks which broker, how to export, and
 *  for a sample row. Also reused by the Day 9 broker-guide modal footer. */
export const BROKER_REQUEST_URL =
  'https://github.com/jahjafuga/FugaEdge/issues/new' +
  '?title=Broker+request%3A+%5BBroker+name%5D' +
  '&body=Which+broker%3A+%0AHow+do+you+export+your+trades%3A+' +
  '%0ASample+CSV+row+(remove+anything+sensitive)%3A+%0A'

/** Prefilled "Bug report" issue — asks what file format, what FugaEdge
 *  showed, and what the user expected. */
export const BUG_REPORT_URL =
  'https://github.com/jahjafuga/FugaEdge/issues/new' +
  '?title=Bug+report%3A+%5Bshort+description%5D' +
  '&body=What+file+format%3A+%0AWhat+FugaEdge+showed%3A+' +
  '%0AWhat+you+expected%3A+%0A'

// ── Format display names ──────────────────────────────────────────────────
// Internal format codes → human-readable names for ImportIssue.format.

const FORMAT_DISPLAY_NAMES: Record<string, string> = {
  executions: 'DAS Trader Executions (Trades.csv)',
  tradehistory: 'DAS Trader Trade History',
  trades_window: 'DAS Trader Trades window',
  webull_mobile: 'Webull Mobile',
  xlsx: 'Webull Desktop',
  ocean_one: 'Ocean One',
  tradezero: 'TradeZero',
  tradezero_summary: 'TradeZero Summary',
  'daily-summary': 'DAS Account Report',
}

export function formatDisplayName(format: string): string {
  return FORMAT_DISPLAY_NAMES[format] ?? format
}

// ── Issue builders ────────────────────────────────────────────────────────
// One builder per ImportErrorCode, carrying the approved Day 9 copy. Callers
// supply only the dynamic values.

export function unknownFormat(filename: string): ImportIssue {
  return {
    code: 'UNKNOWN_FORMAT',
    severity: 'error',
    message: `We couldn't recognize "${filename}". FugaEdge reads DAS Trader, Webull, Ocean One, and TradeZero exports.`,
    actionable:
      'Open the broker export guide to check you exported the right file. ' +
      'If FugaEdge doesn’t support your broker yet, use "Request a broker" to tell us.',
    requestBroker: true,
    requestKind: 'broker',
  }
}

export function emptyFile(filename: string): ImportIssue {
  return {
    code: 'EMPTY_FILE',
    severity: 'error',
    message: `"${filename}" has no rows to import — it looks empty.`,
    actionable:
      'Re-export from your broker and confirm the file contains trades before dropping it in.',
  }
}

export function unsupportedFileType(filename: string): ImportIssue {
  return {
    code: 'UNSUPPORTED_FILE_TYPE',
    severity: 'error',
    message:
      `"${filename}" isn’t a file FugaEdge can read. It reads .csv exports ` +
      '(DAS Trader, Webull Mobile, TradeZero), .xlsx exports (Webull Desktop), and .xls exports (Ocean One).',
    actionable:
      'Drop a .csv, .xlsx, or .xls export from your broker. Need help exporting? Open the broker guide.',
  }
}

export function fileReadFailed(filename: string): ImportIssue {
  return {
    code: 'FILE_READ_FAILED',
    severity: 'error',
    message:
      `FugaEdge couldn't read "${filename}". It may be open in another ` +
      'program, or the file is damaged.',
    actionable:
      'Close the file in Excel or any other program, then drop it in again.',
  }
}

export function xlsxWrongSheet(filename: string, foundSheets: string): ImportIssue {
  return {
    code: 'XLSX_WRONG_SHEET',
    severity: 'error',
    format: 'Webull Desktop',
    message:
      `"${filename}" doesn’t look like a Webull Desktop export — it has no ` +
      `"Order" tab (found: ${foundSheets}).`,
    actionable:
      'In Webull Desktop, export the Orders view. See the Webull section of the broker guide.',
  }
}

export function xlsxMissingColumn(filename: string, column: string): ImportIssue {
  return {
    code: 'XLSX_MISSING_COLUMN',
    severity: 'error',
    format: 'Webull Desktop',
    message:
      `"${filename}" is missing the "${column}" column FugaEdge needs to ` +
      'read a Webull Desktop export.',
    actionable:
      'Re-export from Webull Desktop without removing or renaming any columns.',
  }
}

export function noUsableRows(
  filename: string,
  format: string,
  rowCount: number,
): ImportIssue {
  return {
    code: 'NO_USABLE_ROWS',
    severity: 'error',
    format: formatDisplayName(format),
    message:
      `FugaEdge read "${filename}" as a ${formatDisplayName(format)} file but ` +
      `found no usable trades — all ${rowCount} rows were skipped.`,
    actionable:
      'This usually means it’s a different report than expected. Check the ' +
      'broker guide for the right export, or open the file to confirm it has fill rows.',
  }
}

export function backupFailed(): ImportIssue {
  return {
    code: 'BACKUP_FAILED',
    severity: 'error',
    message:
      'FugaEdge couldn’t take a safety backup before importing, so the ' +
      'import was stopped. Your journal is unchanged.',
    actionable:
      'Check FugaEdge can write to its data folder (disk space and ' +
      'permissions), then try the import again.',
  }
}

export function commitFailed(): ImportIssue {
  return {
    code: 'COMMIT_FAILED',
    severity: 'error',
    message:
      'Something went wrong saving the import to your journal. The change ' +
      'was rolled back — your journal is unchanged.',
    actionable:
      'Try the import again. If it keeps failing, use "Report an issue" so ' +
      'we can look into it.',
    requestBroker: true,
    requestKind: 'bug',
  }
}

export function fileNotDelivered(filename: string): ImportIssue {
  return {
    code: 'FILE_NOT_DELIVERED',
    severity: 'error',
    message: `Something went wrong loading "${filename}" inside FugaEdge.`,
    actionable:
      'Drop the file in again. If it keeps happening, use "Report an issue" ' +
      'so we can look into it.',
    requestBroker: true,
    requestKind: 'bug',
  }
}

export function rowsSkipped(
  filename: string,
  skipped: number,
  total: number,
): ImportIssue {
  return {
    code: 'ROWS_SKIPPED',
    severity: 'warning',
    message:
      `${skipped} of ${total} rows in "${filename}" were skipped — usually a ` +
      'missing symbol, zero quantity, or an unreadable time.',
    actionable:
      'If your trade count looks low, open the file and check those rows. ' +
      'FugaEdge imported everything it could read.',
  }
}

export function malformedCsv(filename: string, rowCount: number): ImportIssue {
  return {
    code: 'MALFORMED_CSV',
    severity: 'warning',
    message:
      `"${filename}" has ${rowCount} row(s) with broken CSV structure ` +
      '(often a stray quote or comma).',
    actionable:
      'Re-export the file straight from your broker instead of editing it by hand.',
  }
}

export function dateRequired(filename: string): ImportIssue {
  return {
    code: 'DATE_REQUIRED',
    severity: 'warning',
    message:
      `"${filename}" has no trade date — this export format doesn’t ` +
      'include the trade date — and the filename doesn’t either.',
    actionable:
      'Pick the trade date in the preview below, or rename the file to ' +
      'include one (e.g. trades-2026-05-15.csv) and drop it again.',
  }
}

export function feeRowsDropped(count: number): ImportIssue {
  return {
    code: 'FEE_ROWS_DROPPED',
    severity: 'warning',
    message: `${count} fee row(s) weren’t imported because no trade date was set for them.`,
    actionable:
      'Set the trade date in the import preview before importing, so fees ' +
      'attach to the right day.',
  }
}

export function enrichmentNoApiKey(): ImportIssue {
  return {
    code: 'ENRICHMENT_NO_API_KEY',
    severity: 'warning',
    message:
      'Your trades imported. Country and float couldn’t be filled in — ' +
      'no market-data API key is set.',
    actionable:
      'Add a free Polygon API key in Settings → Market data, then run ' +
      'Backfill to fill in the gaps.',
  }
}

export function enrichmentFetchFailed(count: number, reason: string): ImportIssue {
  return {
    code: 'ENRICHMENT_FETCH_FAILED',
    severity: 'warning',
    message:
      `Your trades imported. Market data for ${count} symbol(s) couldn’t ` +
      `be fetched (${reason}).`,
    actionable:
      'This doesn’t affect your trades. Re-run Backfill from Settings ' +
      'later — or check your Polygon plan if it’s a plan or rate limit.',
  }
}

// ── Aggregate helpers ─────────────────────────────────────────────────────

/** Triage a parsed CSV / XLSX file's row counts into 0..n issues. A dateless
 *  file (requiresDate) reports only DATE_REQUIRED — the missing date is the
 *  real fix, not a "wrong report" guess. */
export function csvParseIssues(
  filename: string,
  format: string,
  counts: {
    kept: number
    skipped: number
    malformedRows: number
    requiresDate: boolean
  },
): ImportIssue[] {
  const out: ImportIssue[] = []
  if (counts.requiresDate) {
    out.push(dateRequired(filename))
  } else if (counts.kept === 0 && counts.skipped === 0) {
    out.push(emptyFile(filename))
  } else if (counts.kept === 0) {
    out.push(noUsableRows(filename, format, counts.skipped))
  } else if (counts.skipped > 0) {
    out.push(rowsSkipped(filename, counts.skipped, counts.kept + counts.skipped))
  }
  if (counts.malformedRows > 0) {
    out.push(malformedCsv(filename, counts.malformedRows))
  }
  return out
}

/** A CommitResult for a hard failure (backup or commit threw): every counter
 *  zero, carrying the failure issue(s). The IMPORT_COMMIT handler returns this
 *  instead of throwing, so the structured issue survives the IPC boundary as
 *  plain data (thrown-error custom fields do not). */
export function failedCommitResult(issues: ImportIssue[]): CommitResult {
  return {
    insertedTrips: 0,
    skippedTrips: 0,
    resurrectedTrips: 0,
    insertedFees: 0,
    replacedFees: 0,
    affectedDates: [],
    affectedPairs: 0,
    countriesResolved: 0,
    countriesUnknown: 0,
    countryApiKeyMissing: false,
    floatErrored: 0,
    aggregatesErrored: 0,
    issues,
  }
}
