// FugaEdge JUDGING-BOOK seeder — a sibling to demo-seed.mjs, not a fork.
//
// WHY A SIBLING. demo-seed.mjs builds ONE polished month for marketing
// screenshots: shaped intraday bars with their own assertions, an authored
// featured trade, a fills-anchored bar rebuild. This book exists for a
// different job — judging the CALENDAR CARD across four months of contrasting
// shape — and bending the marketing seeder to do both would put a shipped
// artefact at risk for a throwaway one. Neither file imports the other because
// demo-seed.mjs exports nothing; it is a top-level script.
//
// RUN WITH THE ELECTRON BINARY (better-sqlite3 is ABI-built for Electron):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/demo-seed-book.mjs <path under demo/>
//
// SAFETY — the three gates are demo-seed.mjs's, copied verbatim and NOT
// relaxed: the target's parent directory must be named demo/; the schema must
// already exist (the app creates it — one dev launch with FUGAEDGE_DB_PATH);
// and it refuses if trades already exist. There is DELIBERATELY no
// --rebuild-bars bypass of the trades gate — this seeder has no bypass at all.
// A dirty book gets deleted and relaunched.
//
// SCOPE — SET BY THE READ PATH, not by what a book could hold. The calendar
// month query (electron/calendar/get.ts) touches trades, journal and
// session_meta; the weekly path adds trade_mistake, mistake_def and
// week_notes; the account scope and the percent denominator need accounts,
// cash_events and settings. That is the whole list.
//
//   WRITTEN:     accounts · cash_events · settings · trades · journal ·
//                session_meta · mistake_def · trade_mistake
//   NOT WRITTEN: executions · intraday_bars · daily_summary ·
//                max_loss_history · profit_target_history
//
// What that costs, stated rather than discovered: the trade-detail modal will
// show no fills, charts will have no bars, and anything reading daily_summary
// will be empty. The CALENDAR reads none of them — day P&L is
// SUM(net_pnl_precise) straight off trades, and CalendarMonthStats is derived
// in JS from those days, so there is no summary table to keep in sync.
//
// TIME LAW: 2026 Eastern is UTC-4 from March 8. Regular session 13:30-20:00Z.
// Every generated timestamp is true UTC with Z.
//
// DETERMINISM: every value derives from a named seed via mulberry32.
import { basename, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'

import Database from 'better-sqlite3'

// ---------------------------------------------------------------------------
// SEEDS — one stream per concern, so changing one shape does not reshuffle
// every other. Recorded in the run report.
// ---------------------------------------------------------------------------
const SEEDS = {
  days: 20260301, // which weekdays are traded / sat out / journaled
  trades: 20260302, // per-day trade counts and per-trade P&L
  mistakes: 20260303, // which trades carry which mistake tag
  ids: 20260304, // ULIDs and exec hashes
}

const ACCOUNT_NAME = 'Demo Momentum'
const ACCOUNT_TYPE = 'margin' // NON-SIM — a sim account is walled out of the 'all' scope
const STARTING_CASH = 25000
const STARTING_CASH_DATE = '2026-02-27'

// REAL 2026 US equity-market holidays inside the seeded window. Nothing invented:
//   2026-03  none
//   2026-04-03  Good Friday
//   2026-05-25  Memorial Day
//   2026-06-19  Juneteenth
const HOLIDAYS = new Set(['2026-04-03', '2026-05-25', '2026-06-19'])

const TICKERS = ['VYRN', 'QMTX', 'HLPX', 'NRVA', 'TKSI', 'ZYPH', 'ARDX', 'BLTN']

// The mistake vocabulary this book adds. sort_position matters: topMistake
// breaks a count tie by sort_position asc, so the dominant tag is built by
// COUNT, never by relying on the tiebreak.
const MISTAKES = [
  { name: 'Chased extended', axis: 'technical' },
  { name: 'No confirmation', axis: 'technical' },
  { name: 'Averaged down', axis: 'technical' },
  { name: 'Oversized', axis: 'psychological' },
  { name: 'FOMO entry', axis: 'psychological' },
]
/** The tag that must top three or more weeks of 2026-03. */
const DOMINANT = 'Chased extended'

// ---------------------------------------------------------------------------
// THE SHAPE, stated before a row is written.
// ---------------------------------------------------------------------------
const MONTHS = [
  {
    ym: '2026-03',
    tradingDays: 20,
    trades: 260,
    winRate: 0.68,
    net: 4200, // strong +
    outlier: true, // one day ~4x the next best
    satOut: 0,
    closed: 0,
    journalShare: 0.55,
    greenStreak: 4, // four consecutive green trading days
  },
  {
    ym: '2026-04',
    tradingDays: 15,
    trades: 95,
    winRate: 0.64,
    net: 900, // mild +
    outlier: false,
    satOut: 3,
    closed: 1, // Good Friday, Apr 3
    journalShare: 0.4,
    greenStreak: 0,
  },
  {
    ym: '2026-05',
    tradingDays: 12,
    trades: 70,
    winRate: 0.41,
    net: -1650, // negative
    outlier: false,
    uglyDay: -900, // one day carries most of it
    satOut: 1,
    closed: 0,
    journalShare: 0.5,
    greenStreak: 0,
  },
  {
    ym: '2026-06',
    tradingDays: 3,
    trades: 14,
    winRate: 0.5,
    net: 40, // ~flat — the sparse case beat 11 was built for
    outlier: false,
    satOut: 1,
    closed: 0,
    journalShare: 0.34,
    greenStreak: 0,
  },
]

// ---------------------------------------------------------------------------
// Deterministic helpers (mulberry32 — the same generator demo-seed.mjs uses;
// copied because that file exports nothing).
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1))
const round2 = (n) => Math.round(n * 100) / 100

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function ulid(r) {
  let s = ''
  for (let i = 0; i < 26; i++) s += ULID_CHARS[Math.floor(r() * 32)]
  return s
}

/** Every weekday of a YYYY-MM, minus real market holidays. UTC noon anchor so
 *  no timezone can shift a date. */
function sessionsOf(ym) {
  const [y, m] = ym.split('-').map(Number)
  const out = []
  const last = new Date(Date.UTC(y, m, 0, 12)).getUTCDate()
  for (let d = 1; d <= last; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d, 12))
    const dow = dt.getUTCDay()
    if (dow === 0 || dow === 6) continue
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (HOLIDAYS.has(iso)) continue
    out.push(iso)
  }
  return out
}
const holidaysIn = (ym) => [...HOLIDAYS].filter((h) => h.startsWith(ym)).sort()

// ---------------------------------------------------------------------------
// GATES — copied verbatim from demo-seed.mjs. None relaxed. No bypass.
// ---------------------------------------------------------------------------
const target = process.argv[2]
if (!target) {
  console.error('usage: demo-seed-book.mjs <path under demo/>')
  process.exit(1)
}
const abs = resolve(target)
if (basename(dirname(abs)) !== 'demo') {
  console.error('REFUSED: target directory is not demo/ - this seeder only ever touches a demo database.')
  process.exit(1)
}
let db
try {
  db = new Database(abs, { fileMustExist: true })
} catch {
  console.error('REFUSED: demo DB missing. Create schema first: one dev launch with FUGAEDGE_DB_PATH=' + abs + ', then quit.')
  process.exit(1)
}
db.pragma('foreign_keys = ON')
const schemaRow = db.prepare("SELECT value FROM _meta WHERE key='schema_version'").get()
if (!schemaRow) {
  console.error('REFUSED: no _meta.schema_version - not an app-created DB.')
  process.exit(1)
}
const existingTrades = db.prepare('SELECT COUNT(*) n FROM trades').get().n
if (existingTrades > 0) {
  console.error('REFUSED: trades already exist (' + existingTrades + '). This book is disposable: delete it and relaunch to reseed.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// PLAN — decide every day's state before writing anything, so the shape can be
// reported and asserted rather than discovered.
// ---------------------------------------------------------------------------
const rDays = mulberry32(SEEDS.days)
const rTrades = mulberry32(SEEDS.trades)
const rMist = mulberry32(SEEDS.mistakes)
const rIds = mulberry32(SEEDS.ids)

const plan = [] // { ym, date, state: 'traded'|'satout'|'closed'|'untouched', trades, net, journal }

for (const M of MONTHS) {
  const sessions = sessionsOf(M.ym)
  const closedDates = M.closed > 0 ? holidaysIn(M.ym).slice(0, M.closed) : []

  // Trading days: take an evenly-spread subset so a month never bunches all its
  // activity into one week, then let the per-day counts carry the variation.
  const stride = sessions.length / M.tradingDays
  const tradedIdx = new Set()
  for (let i = 0; i < M.tradingDays; i++) tradedIdx.add(Math.min(sessions.length - 1, Math.floor(i * stride)))
  // stride collisions can under-fill; top up deterministically
  let probe = 0
  while (tradedIdx.size < M.tradingDays && probe < sessions.length) {
    if (!tradedIdx.has(probe)) tradedIdx.add(probe)
    probe++
  }
  const traded = [...tradedIdx].sort((a, b) => a - b).map((i) => sessions[i])

  // Sat-out days: from the sessions NOT traded.
  const spare = sessions.filter((d) => !traded.includes(d))
  const satOut = []
  for (let i = 0; i < M.satOut && spare.length > 0; i++) {
    satOut.push(spare[Math.floor((i + 0.5) * (spare.length / Math.max(1, M.satOut)))] ?? spare[i])
  }

  // ---- per-day trade counts: 3..25, never constant -------------------------
  const counts = traded.map(() => between(rTrades, 3, 25))
  const scale = M.trades / counts.reduce((a, b) => a + b, 0)
  for (let i = 0; i < counts.length; i++) counts[i] = Math.max(3, Math.round(counts[i] * scale))
  // reconcile to the target exactly
  let drift = M.trades - counts.reduce((a, b) => a + b, 0)
  for (let i = 0; drift !== 0 && i < counts.length * 4; i++) {
    const k = i % counts.length
    if (drift > 0) { counts[k]++; drift-- }
    else if (counts[k] > 3) { counts[k]--; drift++ }
  }

  // ---- day colour: losers CLUSTER --------------------------------------------
  // A red day is not sprinkled — bad stretches run 2..4 sessions, which is what
  // a drawdown actually looks like and what makes a streak line mean anything.
  const wantRed = Math.round(traded.length * (1 - M.winRate))
  const red = new Set()
  let guard = 0
  while (red.size < wantRed && guard++ < 200) {
    const start = between(rTrades, 0, traded.length - 1)
    const run = between(rTrades, 2, 4)
    for (let k = start; k < Math.min(traded.length, start + run) && red.size < wantRed; k++) red.add(k)
  }
  // ---- carve out the required green streak ---------------------------------
  if (M.greenStreak > 0) {
    const at = Math.floor(traded.length * 0.55)
    for (let k = at; k < at + M.greenStreak && k < traded.length; k++) red.delete(k)
  }

  // ---- per-day net, summing to the month's target --------------------------
  const raw = traded.map((_, i) => (red.has(i) ? -(40 + rTrades() * 260) : 40 + rTrades() * 300))
  if (M.outlier) {
    // one day ~4x the next best green
    const greens = raw.map((v, i) => ({ v, i })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
    if (greens.length > 1) raw[greens[0].i] = greens[1].v * 4
  }
  if (M.uglyDay) {
    const reds = raw.map((v, i) => ({ v, i })).filter((x) => x.v < 0).sort((a, b) => a.v - b.v)
    if (reds.length > 0) raw[reds[0].i] = M.uglyDay
  }
  const sum = raw.reduce((a, b) => a + b, 0)
  const adj = (M.net - sum) / raw.length
  const nets = raw.map((v) => round2(v + adj))
  // adjustment must not flip a day's colour — that would break the streak/cluster
  for (let i = 0; i < nets.length; i++) {
    if (red.has(i) && nets[i] >= 0) nets[i] = round2(-Math.abs(nets[i]) - 1)
    if (!red.has(i) && nets[i] <= 0) nets[i] = round2(Math.abs(nets[i]) + 1)
  }
  const finalDrift = round2(M.net - nets.reduce((a, b) => a + b, 0))
  // park the residue on the largest-magnitude day of the right sign
  const parkIdx = nets.reduce((best, v, i) =>
    Math.sign(v) === Math.sign(finalDrift || 1) && Math.abs(v) > Math.abs(nets[best]) ? i : best, 0)
  nets[parkIdx] = round2(nets[parkIdx] + finalDrift)

  // ---- journaling: partial, never 0% and never 100% ------------------------
  const jCount = Math.max(1, Math.min(traded.length - 1, Math.round(traded.length * M.journalShare)))
  const journaled = new Set()
  for (let i = 0; i < jCount; i++) journaled.add(Math.floor((i + 0.5) * (traded.length / jCount)))

  traded.forEach((date, i) => {
    plan.push({
      ym: M.ym, date, state: 'traded',
      trades: counts[i], net: nets[i], journal: journaled.has(i), red: red.has(i),
    })
  })
  satOut.forEach((date) => plan.push({ ym: M.ym, date, state: 'satout', trades: 0, net: 0, journal: false }))
  closedDates.forEach((date) => plan.push({ ym: M.ym, date, state: 'closed', trades: 0, net: 0, journal: false }))
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------
const NOW = '2026-02-27T12:00:00.000Z'
const accountId = ulid(rIds)

const tx = db.transaction(() => {
  db.prepare(
    "INSERT INTO accounts (id, name, broker, account_type, color, status, is_default, created_at) VALUES (?, ?, 'DAS', ?, NULL, 'active', 1, ?)",
  ).run(accountId, ACCOUNT_NAME, ACCOUNT_TYPE, NOW)
  db.prepare(
    "INSERT INTO cash_events (id, account_id, kind, amount, date, note, transfer_id, created_at) VALUES (?, ?, 'starting', ?, ?, NULL, NULL, ?)",
  ).run(ulid(rIds), accountId, STARTING_CASH, STARTING_CASH_DATE, NOW)
  // Scope the app at this account so the card's percent branch resolves against
  // its contributed capital rather than the 'all' wall.
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('account_scope', accountId)

  // mistake vocabulary
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_position), 0) m FROM mistake_def WHERE axis = ?')
  const insDef = db.prepare(
    'INSERT INTO mistake_def (axis, name, sort_position, is_custom, is_archived) VALUES (?, ?, ?, 1, 0)',
  )
  const mistakeIds = {}
  for (const m of MISTAKES) {
    const pos = maxSort.get(m.axis).m + 1
    mistakeIds[m.name] = Number(insDef.run(m.axis, m.name, pos).lastInsertRowid)
  }

  const insTrade = db.prepare(`
    INSERT INTO trades (
      date, symbol, side, open_time, close_time, is_open,
      shares_bought, avg_buy_price, shares_sold, avg_sell_price,
      pnl, gross_pnl, fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat,
      total_fees, commission, net_pnl, executions_json, exec_hash,
      net_pnl_precise, gross_pnl_precise, total_fees_precise, account_id
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, NULL, ?, '[]', ?, ?, ?, ?, ?)
  `)
  const insJunction = db.prepare('INSERT INTO trade_mistake (trade_id, mistake_def_id) VALUES (?, ?)')
  const insJournal = db.prepare(`
    INSERT INTO journal (date, premarket_notes, postsession_notes, emotion_rating, rules_followed, rule_violations, day_tags, rule_breaks)
    VALUES (?, ?, ?, ?, '[]', '[]', ?, '[]')
    ON CONFLICT(date) DO UPDATE SET
      premarket_notes = excluded.premarket_notes,
      postsession_notes = excluded.postsession_notes,
      emotion_rating = excluded.emotion_rating,
      day_tags = excluded.day_tags
  `)
  const insSession = db.prepare(`
    INSERT INTO session_meta (date, no_trade_day, no_trade_reason, updated_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      no_trade_day = excluded.no_trade_day,
      no_trade_reason = excluded.no_trade_reason,
      updated_at = excluded.updated_at
  `)

  let dominantWeeks = new Set()

  for (const day of plan) {
    if (day.state === 'satout' || day.state === 'closed') {
      // THE APP'S OWN WRITE, not what the read path merely tolerates.
      // NoTradeDayModal.handleSave writes journal.postsession_notes =
      // "Sat out: <reason>" AND adds the "no-trade-day" day_tag; the dashboard's
      // "Mark as no-trade day" writes session_meta.no_trade_day = 1. Both are
      // real paths and the read side ORs them, so this book uses BOTH — the
      // holiday and half the sit-outs through the modal shape, the rest through
      // the dashboard shape — rather than picking one and calling it typical.
      const reason = day.state === 'closed' ? 'Holiday (Market Closed)' : 'No setups'
      const viaModal = day.state === 'closed' || rDays() < 0.6
      if (viaModal) {
        insJournal.run(day.date, '', `Sat out: ${reason}`, null, JSON.stringify(['no-trade-day']))
      } else {
        insSession.run(day.date, reason, NOW)
      }
      continue
    }

    // ---- one day's trades ---------------------------------------------------
    const n = day.trades
    // split the day's net across n trades, with the right win/loss mix
    const wins = day.red ? Math.max(1, Math.floor(n * 0.35)) : Math.max(1, Math.round(n * 0.7))
    const parts = []
    for (let i = 0; i < n; i++) parts.push(i < wins ? 1 : -1)
    const posSum = parts.filter((p) => p > 0).length
    const negSum = parts.filter((p) => p < 0).length
    // choose magnitudes so the signed sum lands on day.net
    const gross = Math.abs(day.net) * 2.2 + 60
    const winEach = (gross * 0.62) / Math.max(1, posSum)
    const lossEach = (gross * 0.62 - day.net) / Math.max(1, negSum)
    const raw = parts.map((p) => (p > 0 ? winEach : -lossEach))
    const drift = (day.net - raw.reduce((a, b) => a + b, 0)) / n
    const pnls = raw.map((v) => round2(v + drift))
    // reconcile to the cent on the last trade
    const resid = round2(day.net - pnls.reduce((a, b) => a + b, 0))
    pnls[pnls.length - 1] = round2(pnls[pnls.length - 1] + resid)

    const week = day.date.slice(0, 7) + '-w' + Math.ceil(Number(day.date.slice(8, 10)) / 7)
    for (let i = 0; i < n; i++) {
      const sym = pick(rTrades, TICKERS)
      const side = rTrades() < 0.78 ? 'long' : 'short'
      const shares = between(rTrades, 100, 2000)
      const entry = round2(2 + rTrades() * 14)
      const net = pnls[i]
      const fees = round2(Math.min(Math.abs(net) * 0.06 + 0.4, 12))
      const grossPnl = round2(net + fees)
      const exit = round2(side === 'long' ? entry + grossPnl / shares : entry - grossPnl / shares)
      const hh = 13 + Math.floor(i / 6)
      const mm = (i * 7) % 60
      const open = `${day.date}T${String(Math.min(hh, 19)).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`
      const close = `${day.date}T${String(Math.min(hh + 1, 19)).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`
      const hash = createHash('sha1').update(`${day.date}|${sym}|${i}|${SEEDS.ids}`).digest('hex')
      const id = Number(
        insTrade.run(
          day.date, sym, side, open, close,
          side === 'long' ? shares : 0, side === 'long' ? entry : 0,
          side === 'long' ? 0 : shares, side === 'long' ? 0 : entry,
          net, grossPnl, fees, net, hash, net, grossPnl, fees, accountId,
        ).lastInsertRowid,
      )

      // ---- mistake tags -----------------------------------------------------
      // The DOMINANT tag is built by COUNT, never by leaning on topMistake's
      // sort_position tiebreak: in 2026-03 it lands on many losers across four
      // separate weeks, so it tops each of them outright.
      if (net < 0) {
        if (day.ym === '2026-03' && rMist() < 0.55) {
          insJunction.run(id, mistakeIds[DOMINANT])
          dominantWeeks.add(week)
        } else if (rMist() < 0.28) {
          insJunction.run(id, mistakeIds[pick(rMist, MISTAKES.filter((m) => m.name !== DOMINANT)).name])
        }
      }
    }

    // ---- journaling --------------------------------------------------------
    if (day.journal) {
      insJournal.run(
        day.date,
        day.red ? 'Plan: fade the open, size down.' : 'Plan: front-side momentum only.',
        day.red ? 'Took the loss early. Sizing was the problem, not the read.' : 'Clean session — let the winner run.',
        day.red ? 2 + Math.floor(rDays() * 2) : 3 + Math.floor(rDays() * 3),
        '[]',
      )
    }
  }

  console.log('  dominant tag weeks in 2026-03: ' + [...dominantWeeks].sort().join(' '))
})

tx()

// ---------------------------------------------------------------------------
// REPORT
// ---------------------------------------------------------------------------
console.log('SEEDED ' + abs)
console.log('  seeds: ' + JSON.stringify(SEEDS))
console.log('  account: ' + ACCOUNT_NAME + ' (' + ACCOUNT_TYPE + ', non-sim) starting $' + STARTING_CASH)
for (const M of MONTHS) {
  const r = db
    .prepare(
      `SELECT COUNT(DISTINCT date) d, COUNT(*) t, ROUND(SUM(net_pnl_precise),2) net,
              SUM(CASE WHEN net_pnl > 0.005 THEN 1 ELSE 0 END) w,
              SUM(CASE WHEN net_pnl < -0.005 THEN 1 ELSE 0 END) l
       FROM trades WHERE date LIKE ? AND deleted_at IS NULL`,
    )
    .get(M.ym + '%')
  const so = db.prepare("SELECT COUNT(*) n FROM session_meta WHERE date LIKE ? AND no_trade_day = 1").get(M.ym + '%').n
  const jm = db.prepare("SELECT COUNT(*) n FROM journal WHERE date LIKE ? AND day_tags LIKE '%no-trade-day%'").get(M.ym + '%').n
  const jc = db.prepare("SELECT COUNT(*) n FROM journal WHERE date LIKE ?").get(M.ym + '%').n
  console.log(
    '  ' + M.ym + '  days=' + r.d + '/' + M.tradingDays +
    '  trades=' + r.t + '/' + M.trades +
    '  win%=' + (r.w + r.l ? Math.round((r.w / (r.w + r.l)) * 100) : 0) + '/' + Math.round(M.winRate * 100) +
    '  net=' + r.net + '/' + M.net +
    '  satout(session_meta)=' + so + ' satout(journal-tag)=' + jm + ' journalRows=' + jc,
  )
}
db.close()
console.log('  (connection closed)')
