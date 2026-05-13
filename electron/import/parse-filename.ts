// The daily summary CSV has no date column, so we infer the date from the
// filename. Spec example: "11thmaytrades.csv" → 2026-05-11.
// Year defaults to current; if the resulting date is more than a day in the
// future, roll back to the previous year (handles "yesterday's file imported
// today" gracefully but won't pick a year far in the future).

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export interface FilenameParseResult {
  date: string
  parsed: boolean
}

export function parseFilenameDate(
  filename: string,
  now: Date = new Date(),
): FilenameParseResult {
  const base = filename
    .toLowerCase()
    .replace(/\.csv$/, '')
    .replace(/[_\-\s]/g, '')

  // "11thmaytrades" / "11may" / "11maytrades"
  const m1 = base.match(/^(\d{1,2})(?:st|nd|rd|th)?([a-z]+?)(?:trades?)?$/)
  if (m1) {
    const day = Number(m1[1])
    const month = MONTHS[m1[2]]
    if (month && day >= 1 && day <= 31) {
      return { date: resolveYear(now, month, day), parsed: true }
    }
  }

  // "may11" / "may11trades"
  const m2 = base.match(/^([a-z]+?)(\d{1,2})(?:st|nd|rd|th)?(?:trades?)?$/)
  if (m2) {
    const month = MONTHS[m2[1]]
    const day = Number(m2[2])
    if (month && day >= 1 && day <= 31) {
      return { date: resolveYear(now, month, day), parsed: true }
    }
  }

  // ISO-ish "2026-05-11" or "20260511" anywhere in filename
  const m3 = filename.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/)
  if (m3) {
    const year = Number(m3[1])
    const month = Number(m3[2])
    const day = Number(m3[3])
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: `${year}-${pad(month)}-${pad(day)}`, parsed: true }
    }
  }

  return { date: '', parsed: false }
}

function resolveYear(now: Date, month: number, day: number): string {
  const year = now.getFullYear()
  const candidate = new Date(year, month - 1, day)
  const oneDayMs = 24 * 60 * 60 * 1000
  if (candidate.getTime() - now.getTime() > oneDayMs) {
    return `${year - 1}-${pad(month)}-${pad(day)}`
  }
  return `${year}-${pad(month)}-${pad(day)}`
}
