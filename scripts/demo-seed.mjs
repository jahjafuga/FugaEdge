// FugaEdge demo-book seeder. Populates a DEMO database (created beforehand by
// one dev launch with FUGAEDGE_DB_PATH pointing at demo/fugaedge-demo.db) with
// a deterministic, invented, honestly-imperfect month of momentum trading for
// marketing screenshots.
//
// RUN WITH THE ELECTRON BINARY (better-sqlite3 is ABI-built for Electron):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/demo-seed.mjs demo/fugaedge-demo.db
//
// SAFETY: refuses to run unless the target path's parent directory is demo/;
// refuses if the schema is missing (the app must create it first); refuses if
// trades already exist ("wipe demo db and relaunch to reseed" - this script
// never deletes anything). It never resolves or opens any userData database.
//
// TIME LAW: June 2026 Eastern is UTC-4. Regular session 13:30-20:00Z,
// premarket from 08:00Z. Every generated timestamp is true UTC with Z.
//
// DETERMINISM: every dataset value derives from SEED via mulberry32 streams.
// (DB-side created_at defaults are metadata, not dataset, and stay stock.)
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// CONFIG (founder-adjustable)
// ---------------------------------------------------------------------------
const SEED = 20260601;
const MONTH = "2026-06";
const HOLIDAYS = new Set(["2026-06-19"]); // Juneteenth - market closed
const RED_DAY_COUNT = 7; // of 21 sessions
const TRADES_TARGET = 140;
const PROFIT_TARGET = 500;
const MAX_DAILY_LOSS = 300;
const ACCOUNT_NAME = "Demo Momentum";
const ACCOUNT_SIZE = 25000;
const STARTING_CASH_DATE = "2026-05-29";
const DNA_TAGGED_SHARE = 0.88; // >= 80% fully pillar-tagged per ruling

const TICKERS = {
  VYRN: { float: 4_800_000, base: 3.2 },
  QMTX: { float: 12_500_000, base: 6.8 },
  HLPX: { float: 3_100_000, base: 2.4 },
  NRVA: { float: 18_900_000, base: 9.6 },
  TKSI: { float: 7_400_000, base: 4.9 },
  ZYPH: { float: 24_600_000, base: 12.8 },
};

const CATALYSTS = [
  "FDA fast-track designation for lead compound",
  "Phase 2 topline beats consensus",
  "Strategic partnership with major OEM",
  "Short squeeze continuation, day 2",
  "Uplisting to major exchange approved",
  "Activist 13D reveals 9% stake",
  "Government contract award",
  "AI product launch press release",
  "Earnings surprise, guidance raised",
  "Sector sympathy squeeze",
];

const MISTAKES = [
  { name: "Chased extended", axis: "technical" },
  { name: "No confirmation", axis: "technical" },
  { name: "Averaged down", axis: "technical" },
  { name: "Oversized", axis: "psychological" },
  { name: "FOMO entry", axis: "psychological" },
  { name: "Cut winner early", axis: "psychological" },
  { name: "Traded through max loss", axis: "psychological" },
];

const RULES = [
  "Only A+ setups",
  "Wait for the pullback",
  "Max 3 losers then stop",
  "Respect max daily loss",
];

const DAY_NOTES = [
  { pre: "Gap scan is loaded. Two clean names, one chop trap. Plan is VWAP pullbacks only, no opening drive guesses.", post: "Took the plan trades and left the rest alone. Paid for patience today." },
  { pre: "Slept badly. Sizing down a notch until the first green trade confirms the read.", post: "Small size saved the morning. The third trade was FOMO and I knew it as I clicked." },
  { pre: "One clear leader today. If it holds the 9 EMA I press; if it loses VWAP I am done by 10.", post: "Pressed the winner once, added into the flag, out into the push. Textbook day, do not overtrade the afternoon." },
  { pre: "News is thin. Expecting chop, capping myself at three attempts.", post: "Hit the three-attempt cap and walked. Red, but controlled red." },
  { pre: "Two gappers with real volume. Watching the first pullback, not the open print.", post: "First trade chased extended and paid for it. Second trade waited and it paid me back." },
  { pre: "Yesterday's runner has day-2 continuation setup written all over it.", post: "It faded hard off the open. Respected the stop, flipped short bias in my head but did not force it." },
  { pre: "Focus day: only the halt-resume play, nothing else.", post: "One halt resume, one clean win, done in forty minutes. Best kind of day." },
  { pre: "Feeling the pull to make the week back in one day. Naming it here so I do not do it.", post: "Did not make it back in one day. Made a quarter of it back the right way instead." },
];

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
const between = (r, lo, hi) => lo + r() * (hi - lo);

const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulid(r) {
  let s = "";
  for (let i = 0; i < 26; i++) s += CROCK[Math.floor(r() * 32)];
  return s;
}
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

// ---------------------------------------------------------------------------
// Target guards
// ---------------------------------------------------------------------------
const target = process.argv[2];
if (!target) {
  console.error("usage: demo-seed.mjs <path under demo/>");
  process.exit(1);
}
const abs = resolve(target);
if (basename(dirname(abs)) !== "demo") {
  console.error("REFUSED: target directory is not demo/ - this seeder only ever touches the demo database.");
  process.exit(1);
}
let db;
try {
  db = new Database(abs, { fileMustExist: true });
} catch {
  console.error("REFUSED: demo DB missing. Create schema first: one dev launch with FUGAEDGE_DB_PATH=" + abs + ", then quit.");
  process.exit(1);
}
db.pragma("foreign_keys = ON");
const schemaRow = db.prepare("SELECT value FROM _meta WHERE key='schema_version'").get();
if (!schemaRow) {
  console.error("REFUSED: no _meta.schema_version - not an app-created DB.");
  process.exit(1);
}
const existingTrades = db.prepare("SELECT COUNT(*) n FROM trades").get().n;
if (existingTrades > 0) {
  console.error("REFUSED: trades already exist (" + existingTrades + "). The demo DB is disposable: wipe demo db and relaunch to reseed.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Calendar: June 2026 sessions (weekdays minus holidays) -> 21 sessions
// ---------------------------------------------------------------------------
const sessions = [];
for (let d = 1; d <= 30; d++) {
  const date = MONTH + "-" + String(d).padStart(2, "0");
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 0 || dow === 6 || HOLIDAYS.has(date)) continue;
  sessions.push(date);
}
const rDays = mulberry32(SEED + 1);
const redIdx = new Set();
while (redIdx.size < RED_DAY_COUNT) {
  const i = 1 + Math.floor(rDays() * (sessions.length - 2)); // never the first day red twice in a row bias; simple spread
  redIdx.add(i);
}

// Day plans: polarity + target net + ticker-day assignments.
const rPlan = mulberry32(SEED + 2);
const tickerNames = Object.keys(TICKERS);
const dayPlans = sessions.map((date, i) => {
  const red = redIdx.has(i);
  let net;
  if (red) {
    net = -Math.round(between(rPlan, 80, 340));
    if (rPlan() < 0.3) net = -Math.round(between(rPlan, 300, 380)); // through max loss days
  } else {
    net = Math.round(between(rPlan, 120, 680));
    if (rPlan() < 0.25) net = Math.round(between(rPlan, 500, 720)); // target-hit days
  }
  const nTickers = rPlan() < 0.35 ? 2 : 1;
  const shuffled = [...tickerNames].sort(() => rPlan() - 0.5);
  const tickers = shuffled.slice(0, nTickers);
  const trades = 5 + Math.floor(rPlan() * 4); // 5..8
  return { date, red, net, tickers, trades };
});
// Nudge total trades toward TRADES_TARGET deterministically.
let totalTrades = dayPlans.reduce((s, p) => s + p.trades, 0);
let k = 0;
while (totalTrades !== TRADES_TARGET && k < 500) {
  const p = dayPlans[k % dayPlans.length];
  if (totalTrades > TRADES_TARGET && p.trades > 4) { p.trades--; totalTrades--; }
  else if (totalTrades < TRADES_TARGET) { p.trades++; totalTrades++; }
  k++;
}

// ---------------------------------------------------------------------------
// Bars: momentum-shaped 1-minute walks per ticker-day (premarket + RTH)
// ---------------------------------------------------------------------------
function utcMs(date, h, m) {
  return Date.parse(date + "T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00Z");
}
function barWalk(r, date, base, changePct, kindRed) {
  const bars = [];
  const openPrice = base * (1 + between(r, 0.02, 0.3));
  const peakMult = 1 + changePct / 100;
  let price = base * (1 + between(r, -0.02, 0.05));
  // Premarket 08:00-13:29Z: grind from near-base toward the open price.
  const pmStart = utcMs(date, 8, 0);
  const pmBars = 330;
  for (let i = 0; i < pmBars; i++) {
    const t = pmStart + i * 60000;
    const drift = (openPrice - price) * 0.012;
    const o = price;
    price = Math.max(0.3, price + drift + (r() - 0.48) * price * 0.006);
    const c = price;
    const h = Math.max(o, c) * (1 + r() * 0.004);
    const l = Math.min(o, c) * (1 - r() * 0.004);
    const v = Math.round(between(r, 300, 4200) * (i > 270 ? 3 : 1));
    bars.push({ t, o: rnd2(o), h: rnd2(h), l: rnd2(l), c: rnd2(c), v });
  }
  // RTH 13:30-19:59Z: surge to peak, pullbacks, then hold (green) or fade (red).
  const rthStart = utcMs(date, 13, 30);
  const peakBar = 20 + Math.floor(r() * 40);
  const peak = base * peakMult;
  for (let i = 0; i < 390; i++) {
    const t = rthStart + i * 60000;
    const o = price;
    let targetP;
    if (i <= peakBar) targetP = openPrice + (peak - openPrice) * (i / peakBar);
    else if (kindRed) targetP = peak - (peak - openPrice * 0.82) * ((i - peakBar) / (390 - peakBar));
    else targetP = peak * (0.9 + 0.08 * Math.sin(i / 31)) - (peak * 0.06) * ((i - peakBar) / (390 - peakBar));
    const pullback = r() < 0.06 ? -price * between(r, 0.004, 0.02) : 0;
    price = Math.max(0.3, price + (targetP - price) * 0.18 + pullback + (r() - 0.5) * price * 0.008);
    const c = price;
    const h = Math.max(o, c) * (1 + r() * 0.006);
    const l = Math.min(o, c) * (1 - r() * 0.006);
    const surge = i <= peakBar ? 4 : 1;
    const v = Math.round(between(r, 4000, 26000) * surge * (1 + (i % 47 === 0 ? 2 : 0)));
    bars.push({ t, o: rnd2(o), h: rnd2(h), l: rnd2(l), c: rnd2(c), v });
  }
  return bars;
}
const rnd2 = (x) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Build everything in memory first
// ---------------------------------------------------------------------------
const rBars = mulberry32(SEED + 3);
const rTrade = mulberry32(SEED + 4);
const rTag = mulberry32(SEED + 5);
const rIds = mulberry32(SEED + 6);

const tickerDays = new Map(); // "SYM|date" -> {bars, warmup, changePct, rvol, catalyst}
for (const plan of dayPlans) {
  for (const sym of plan.tickers) {
    const prof = TICKERS[sym];
    const changePct = Math.round(between(rBars, 15, 180));
    const rvol = rnd2(between(rBars, 3, 40));
    const catalyst = pick(CATALYSTS, rBars);
    const bars = barWalk(rBars, plan.date, prof.base, changePct, plan.red);
    // Warmup: a quiet prior-day RTH segment near base.
    const warm = [];
    const prior = new Date(plan.date + "T12:00:00Z");
    prior.setUTCDate(prior.getUTCDate() - 1);
    const priorDate = prior.toISOString().slice(0, 10);
    let wp = prof.base * (1 - between(rBars, 0, 0.04));
    const wStart = utcMs(priorDate, 13, 30);
    for (let i = 0; i < 390; i++) {
      const t = wStart + i * 60000;
      const o = wp;
      wp = Math.max(0.3, wp + (r0(rBars) - 0.5) * wp * 0.004);
      warm.push({ t, o: rnd2(o), h: rnd2(Math.max(o, wp) * 1.002), l: rnd2(Math.min(o, wp) * 0.998), c: rnd2(wp), v: Math.round(between(rBars, 800, 6000)) });
    }
    tickerDays.set(sym + "|" + plan.date, { bars, warm, changePct, rvol, catalyst });
  }
}
function r0(r) { return r(); }

// Trades
const tradePlans = [];
for (const plan of dayPlans) {
  const n = plan.trades;
  // P&L split: green ~62% winners, red ~35%.
  const winShare = plan.red ? 0.35 : 0.62;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const win = rTrade() < winShare;
    const mag = between(rTrade, 25, plan.red ? 160 : 260);
    raw.push(win ? mag : -mag * (plan.red ? 1.25 : 0.8));
  }
  // Rescale so the day sums exactly to plan.net (last trade absorbs rounding).
  const sum = raw.reduce((s, x) => s + x, 0);
  const scale = sum !== 0 ? plan.net / sum : 1;
  let acc = 0;
  const pnls = raw.map((x, i) => {
    if (i === raw.length - 1) return Math.round((plan.net - acc) * 100) / 100;
    const v = Math.round(x * Math.abs(scale) * (plan.net < 0 && x > 0 ? 0.6 : 1) * 100) / 100;
    acc += v;
    return v;
  });
  // Entry times spread across the session; a couple of premarket entries month-wide.
  const times = [];
  for (let i = 0; i < n; i++) {
    const h = 13 + Math.floor(rTrade() * 6);
    const m = Math.floor(rTrade() * 60);
    const hh = h === 13 ? Math.max(31, m) : m; // keep 13:3x+
    times.push([h, h === 13 ? hh : m]);
  }
  times.sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  for (let i = 0; i < n; i++) {
    const sym = plan.tickers[i % plan.tickers.length];
    tradePlans.push({ date: plan.date, red: plan.red, sym, pnl: pnls[i], time: times[i], idx: i, dayN: n });
  }
}
// Month-wide: force 3 premarket entries deterministically.
[7, 55, 111].forEach((i, j) => {
  if (tradePlans[i]) tradePlans[i].time = [10 + j, 12 + j * 9];
});

// ---------------------------------------------------------------------------
// Insert (single transaction)
// ---------------------------------------------------------------------------
const nowIso = "2026-06-30T21:00:00.000Z"; // deterministic bookkeeping stamp
const accountId = ulid(rIds);

const insertAll = db.transaction(() => {
  // Account + cash + settings frame
  db.prepare(
    "INSERT INTO accounts (id, name, broker, account_type, color, status, is_default, created_at) VALUES (?, ?, ?, 'margin', NULL, 'active', 1, ?)",
  ).run(accountId, ACCOUNT_NAME, "DAS", "2026-05-29T12:00:00.000Z");
  db.prepare(
    "INSERT INTO cash_events (id, account_id, kind, amount, date, note, transfer_id, created_at) VALUES (?, ?, 'starting', ?, ?, NULL, NULL, ?)",
  ).run(ulid(rIds), accountId, ACCOUNT_SIZE, STARTING_CASH_DATE, "2026-05-29T12:00:00.000Z");

  const upsertSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  upsertSetting.run("daily_profit_target", String(PROFIT_TARGET));
  upsertSetting.run("max_daily_loss", String(MAX_DAILY_LOSS));
  upsertSetting.run("account_size", String(ACCOUNT_SIZE));
  const ruleObjs = RULES.map((name) => ({ id: ulid(rIds), name, archived: false }));
  upsertSetting.run("journal_rules", JSON.stringify(ruleObjs));
  db.prepare("INSERT INTO profit_target_history (effective_from, value) VALUES (?, ?)").run("2026-05-31T00:00:00.000Z", PROFIT_TARGET);
  db.prepare("INSERT INTO max_loss_history (effective_from, value) VALUES (?, ?)").run("2026-05-31T00:00:00.000Z", MAX_DAILY_LOSS);

  // Authored mistake vocabulary (is_custom=1, appended per axis)
  const maxSort = db.prepare("SELECT COALESCE(MAX(sort_position), -1) m FROM mistake_def WHERE axis = ?");
  const insDef = db.prepare("INSERT INTO mistake_def (axis, name, sort_position, is_custom, is_archived) VALUES (?, ?, ?, 1, 0)");
  const mistakeIds = {};
  for (const m of MISTAKES) {
    const pos = maxSort.get(m.axis).m + 1;
    const info = insDef.run(m.axis, m.name, pos);
    mistakeIds[m.name] = Number(info.lastInsertRowid);
  }

  // Bars
  const insBars = db.prepare(
    "INSERT INTO intraday_bars (symbol, date, bars, warmup_bars, warmup_attempted_at, warmup_error, fetched_at, error) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)",
  );
  for (const [key, v] of tickerDays) {
    const [sym, date] = key.split("|");
    insBars.run(sym, date, JSON.stringify(v.bars), JSON.stringify(v.warm), nowIso, nowIso);
  }

  // Trades + executions + junctions
  const insTrade = db.prepare(`
    INSERT INTO trades (
      date, symbol, side, open_time, close_time, is_open,
      shares_bought, avg_buy_price, shares_sold, avg_sell_price,
      pnl, gross_pnl, fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees,
      net_pnl, executions_json, exec_hash, entry_timeframe, entry_ema9_distance_pct,
      account_id, playbook_id, confidence, planned_risk, float_shares,
      daily_change_pct, rvol, catalyst_type, mae, mfe,
      source_broker, source_format, source_file, account_name,
      gross_pnl_precise, total_fees_precise, net_pnl_precise
    ) VALUES (
      @date, @symbol, @side, @open_time, @close_time, 0,
      @shares, @avg_buy, @shares, @avg_sell,
      @net_pnl, @gross_pnl, @fee_ecn, @fee_sec, @fee_finra, 0, @fee_cat, @total_fees,
      @net_pnl, @executions_json, @exec_hash, @entry_timeframe, @ema9,
      @account_id, @playbook_id, @confidence, @planned_risk, @float_shares,
      @daily_change_pct, @rvol, @catalyst_type, @mae, @mfe,
      'DAS', 'execution', 'demo-seed', @account_name,
      @gross_pnl_precise, @total_fees_precise, @net_pnl_precise
    )
  `);
  const insExec = db.prepare(`
    INSERT INTO executions (
      round_trip_id, trade_id, order_id, symbol, side, quantity, price,
      timestamp_utc, source_broker, source_format, source_file, route,
      liquidity_type, account_name, is_paper, commission,
      ecn_fee, sec_fee, finra_fee, cat_fee, htb_fee, other_fees
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DAS', 'execution', 'demo-seed', 'SMRT', ?, ?, 0, NULL, ?, ?, ?, ?, 0, 0)
  `);
  const insJunction = db.prepare("INSERT INTO trade_mistake (trade_id, mistake_def_id) VALUES (?, ?)");

  const playbookWeighted = [1, 1, 4, 4, 3, 5, 2, 6, 7, 3, 1, 4, 8, 9];
  let seq = 0;
  const dayAgg = new Map();
  const tagDays = new Set();

  for (const tp of tradePlans) {
    seq += 1;
    const td = tickerDays.get(tp.sym + "|" + tp.date);
    const [h, m] = tp.time;
    const openMs = utcMs(tp.date, h, m);
    const bar = td.bars.find((b) => b.t >= openMs) ?? td.bars[td.bars.length - 60];
    const entry = bar.c;
    const holdMin = 3 + Math.floor(rTrade() * 35);
    const closeMs = Math.min(bar.t + holdMin * 60000, utcMs(tp.date, 19, 58));
    const side = rTrade() < 0.86 ? "long" : "short";
    // Per-share move bounded to stay plausible against the tape.
    let perShare = between(rTrade, 0.03, Math.max(0.06, entry * 0.05));
    let shares = Math.max(100, Math.round(Math.abs(tp.pnl) / perShare / 50) * 50);
    if (shares > 3000) shares = 3000;
    perShare = Math.abs(tp.pnl) / shares;
    const dir = tp.pnl >= 0 ? 1 : -1;
    const sgn = side === "long" ? 1 : -1;
    const avgBuy = rnd2(entry);
    const avgSell = rnd2(entry + sgn * dir * perShare);
    const gross = rnd2(tp.pnl >= 0 ? Math.abs(tp.pnl) + between(rTrade, 1, 6) : tp.pnl + between(rTrade, 0.5, 3));
    const fees = rnd2(Math.abs(gross - tp.pnl));
    const feeEcn = rnd2(fees * 0.55);
    const feeSec = rnd2(fees * 0.2);
    const feeFinra = rnd2(fees * 0.15);
    const feeCat = rnd2(Math.max(0, fees - feeEcn - feeSec - feeFinra));

    // DNA pillars: ~88% fully tagged; the rest lose 1-2 pillars honestly.
    const tagged = rTag() < DNA_TAGGED_SHARE;
    const chased = rTag() < (tp.red ? 0.3 : 0.12);
    const ema9 = chased ? rnd2(between(rTag, 5.2, 17.5)) : rnd2(between(rTag, -1.8, 4.7));

    const row = {
      date: tp.date,
      symbol: tp.sym,
      side,
      open_time: new Date(openMs).toISOString().replace(".000Z", "Z"),
      close_time: new Date(closeMs).toISOString().replace(".000Z", "Z"),
      shares,
      avg_buy: side === "long" ? avgBuy : avgSell,
      avg_sell: side === "long" ? avgSell : avgBuy,
      net_pnl: tp.pnl,
      gross_pnl: gross,
      fee_ecn: feeEcn,
      fee_sec: feeSec,
      fee_finra: feeFinra,
      fee_cat: feeCat,
      total_fees: fees,
      exec_hash: sha1("demo-" + seq),
      entry_timeframe: rTrade() < 0.8 ? "1m" : "5m",
      ema9,
      account_id: accountId,
      playbook_id: pick(playbookWeighted, rTrade),
      confidence: 1 + Math.floor(rTrade() * 5),
      planned_risk: Math.round(between(rTrade, 30, 120)),
      float_shares: tagged ? TICKERS[tp.sym].float : null,
      daily_change_pct: tagged ? td.changePct : (rTag() < 0.5 ? td.changePct : null),
      rvol: tagged ? td.rvol : null,
      catalyst_type: tagged || rTag() < 0.5 ? td.catalyst : null,
      mae: rnd2(-Math.abs(perShare) * between(rTrade, 0.3, 1.4)),
      mfe: rnd2(Math.abs(perShare) * between(rTrade, 1.0, 2.6)),
      account_name: ACCOUNT_NAME,
      executions_json: "[]",
      // Precise trio - mirrors the app's own import writer (electron/import/
      // repo.ts:461-469, Beat F3): precise falls back to the 2dp value, and
      // net_pnl_precise = gross_precise - fees_precise. The calendar day-cell
      // CTE (electron/calendar/get.ts:92-94), the balance strip
      // (electron/cash/balance.ts:63,162) and the journal day rollup all sum
      // these columns; the column default 0 is what rendered day cells $0.00.
      gross_pnl_precise: gross,
      total_fees_precise: fees,
      net_pnl_precise: rnd2(gross - fees),
    };

    // Fills: 1-2 entries, 1-3 exits (momentum partials).
    const nIn = rTrade() < 0.35 ? 2 : 1;
    const nOut = 1 + Math.floor(rTrade() * 3);
    const fills = [];
    let remainingIn = shares;
    for (let i = 0; i < nIn; i++) {
      const q = i === nIn - 1 ? remainingIn : Math.round(shares / nIn / 50) * 50 || 100;
      remainingIn -= q;
      fills.push({ side: side === "long" ? "B" : "S", qty: q, price: rnd2(row.avg_buy * (1 + (i ? 0.004 : 0))), t: openMs + i * 45000 });
    }
    let remainingOut = shares;
    for (let i = 0; i < nOut; i++) {
      const q = i === nOut - 1 ? remainingOut : Math.round(shares / nOut / 50) * 50 || 100;
      remainingOut -= q;
      fills.push({ side: side === "long" ? "S" : "B", qty: q, price: rnd2(row.avg_sell * (1 - (i ? 0.003 : 0))), t: closeMs - (nOut - 1 - i) * 60000 });
    }
    row.executions_json = JSON.stringify(
      fills.map((f, i) => ({
        trade_id: "DT" + seq,
        order_id: "DO" + seq + "-" + (i + 1),
        symbol: tp.sym,
        side: f.side,
        is_short: side === "short",
        qty: f.qty,
        price: f.price,
        time: new Date(f.t).toISOString().replace(".000Z", "Z"),
        date: tp.date,
        source_broker: "DAS",
        source_format: "execution",
        account_name: ACCOUNT_NAME,
      })),
    );

    const info = insTrade.run(row);
    const tradeId = Number(info.lastInsertRowid);
    fills.forEach((f, i) => {
      insExec.run(
        tradeId, "DT" + seq, "DO" + seq + "-" + (i + 1), tp.sym, f.side, f.qty, f.price,
        new Date(f.t).toISOString().replace(".000Z", "Z"),
        f.side === "B" ? "REMOVED" : "ADDED", ACCOUNT_NAME,
        rnd2(feeEcn / fills.length), rnd2(feeSec / fills.length), rnd2(feeFinra / fills.length), rnd2(feeCat / fills.length),
      );
    });

    // Mistake tags: red days tag hard; green days occasionally (discipline
    // is not the same as winning).
    const wantTag = tp.red ? rTag() < 0.5 : rTag() < 0.14;
    if (wantTag) {
      const pool = chased
        ? ["Chased extended", "FOMO entry", "No confirmation"]
        : tp.pnl < 0
          ? ["No confirmation", "Averaged down", "Oversized", "FOMO entry", "Traded through max loss"]
          : ["Cut winner early", "Oversized"];
      const name = pick(pool, rTag);
      insJunction.run(tradeId, mistakeIds[name]);
      if (rTag() < 0.25) {
        const second = pick(pool.filter((p) => p !== name), rTag);
        if (second) insJunction.run(tradeId, mistakeIds[second]);
      }
      tagDays.add(tp.date);
    }

    const agg = dayAgg.get(tp.date) ?? { pnl: 0, fees: 0, n: 0, w: 0, l: 0, gross: 0, maxW: 0, maxL: 0 };
    agg.pnl += tp.pnl; agg.fees += fees; agg.n += 1; agg.gross += gross;
    if (tp.pnl > 0) { agg.w += 1; agg.maxW = Math.max(agg.maxW, tp.pnl); } else { agg.l += 1; agg.maxL = Math.min(agg.maxL, tp.pnl); }
    dayAgg.set(tp.date, agg);
  }

  // daily_summary (the Dashboard reader)
  const insSummary = db.prepare(
    "INSERT INTO daily_summary (date, total_pnl, total_fees, trade_count, winners, losers, gross_pnl, largest_win, largest_loss, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [date, a] of dayAgg) {
    insSummary.run(date, rnd2(a.pnl), rnd2(a.fees), a.n, a.w, a.l, rnd2(a.gross), rnd2(a.maxW), rnd2(a.maxL), accountId);
  }

  // Journal rows: emotion + rule marks every session; authored notes on 8 days.
  const ruleIds = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='journal_rules'").get().value).map((r) => r.id);
  const insJournal = db.prepare(
    "INSERT INTO journal (date, premarket_notes, postsession_notes, emotion_rating, rules_followed, rule_violations, day_tags, rule_breaks) VALUES (?, ?, ?, ?, ?, ?, '[]', '[]')",
  );
  const noteDays = [0, 3, 6, 9, 12, 14, 17, 19];
  dayPlans.forEach((plan, i) => {
    const noteIdx = noteDays.indexOf(i);
    const note = noteIdx >= 0 ? DAY_NOTES[noteIdx] : null;
    const emotion = plan.red ? 2 + Math.floor(rTag() * 2) : 3 + Math.floor(rTag() * 3);
    const violated = [];
    const followed = [];
    for (const id of ruleIds) {
      if (plan.red && rTag() < 0.45 && violated.length < 2) violated.push(id);
      else if (rTag() < 0.85) followed.push(id);
    }
    insJournal.run(
      plan.date,
      note ? note.pre : "",
      note ? note.post : "",
      emotion,
      JSON.stringify(followed),
      JSON.stringify(violated),
    );
  });

  return { tagDays: tagDays.size };
});

const txOut = insertAll();
db.pragma("wal_checkpoint(TRUNCATE)");

// ---------------------------------------------------------------------------
// Verification battery
// ---------------------------------------------------------------------------
const q = (sql) => db.prepare(sql).get();
const all = (sql) => db.prepare(sql).all();
console.log("=== DEMO SEED VERIFICATION ===");
console.log("trades=" + q("SELECT COUNT(*) n FROM trades").n);
console.log("sessions=" + q("SELECT COUNT(DISTINCT date) n FROM trades").n);
const days = all("SELECT date, SUM(net_pnl) s FROM trades GROUP BY date ORDER BY date");
console.log("green_days=" + days.filter((d) => d.s > 0).length + " red_days=" + days.filter((d) => d.s <= 0).length);
console.log("month_net=" + rnd2(days.reduce((s, d) => s + d.s, 0)));
console.log("bars_rows=" + q("SELECT COUNT(*) n FROM intraday_bars").n);
console.log("distinct_tickers=" + q("SELECT COUNT(DISTINCT symbol) n FROM trades").n);
console.log("dna_judgeable=" + q("SELECT COUNT(*) n FROM trades WHERE avg_buy_price IS NOT NULL AND daily_change_pct IS NOT NULL AND rvol IS NOT NULL AND float_shares IS NOT NULL").n);
const badBars = all("SELECT DISTINCT t.symbol, t.date FROM trades t LEFT JOIN intraday_bars b ON b.symbol = t.symbol AND b.date = t.date WHERE b.symbol IS NULL");
console.log("traded_days_missing_bars=" + badBars.length);
const barSpan = all("SELECT symbol, date, bars FROM intraday_bars").map((r) => {
  const b = JSON.parse(r.bars);
  return { first: new Date(b[0].t).toISOString(), last: new Date(b[b.length - 1].t).toISOString() };
});
const spanOk = barSpan.every((s) => s.first.slice(11, 16) === "08:00" && s.last.slice(11, 16) === "19:59");
console.log("bars_cover_premarket_and_rth=" + spanOk);
const times = all("SELECT open_time, close_time FROM trades");
const timesOk = times.every((t) => /Z$/.test(t.open_time) && /Z$/.test(t.close_time) && t.open_time.slice(11, 13) >= "08" && t.close_time.slice(11, 13) < "20");
console.log("all_timestamps_utc_z_in_window=" + timesOk);
console.log("settings_target=" + q("SELECT value v FROM settings WHERE key='daily_profit_target'").v + " settings_maxloss=" + q("SELECT value v FROM settings WHERE key='max_daily_loss'").v);
console.log("playbook_distribution=" + JSON.stringify(Object.fromEntries(all("SELECT playbook_id, COUNT(*) n FROM trades GROUP BY playbook_id ORDER BY playbook_id").map((r) => [r.playbook_id, r.n]))));
console.log("mistake_junction_rows=" + q("SELECT COUNT(*) n FROM trade_mistake").n + " across_days=" + txOut.tagDays);
console.log("null_pnl_closed=" + q("SELECT COUNT(*) n FROM trades WHERE is_open = 0 AND net_pnl IS NULL").n);
// Day-cell read-path check (the fix's own battery): the calendar month CTE
// sums net_pnl_precise (electron/calendar/get.ts:92) - for EVERY traded date
// that expression must be non-zero and equal daily_summary.total_pnl to the
// cent. The original battery verified trade sums, not the surface's read.
const dayCells = all(`
  SELECT t.date,
         ROUND(SUM(t.net_pnl_precise), 2) AS cell,
         ROUND(SUM(t.net_pnl), 2)         AS flat,
         ds.total_pnl                     AS summary
  FROM trades t JOIN daily_summary ds ON ds.date = t.date
  GROUP BY t.date ORDER BY t.date
`);
const cellBad = dayCells.filter((d) => d.cell === 0 || d.cell === null || Math.abs(d.cell - d.summary) > 0.005);
console.log("day_cell_expr_dates=" + dayCells.length + " nonzero_and_matching=" + (dayCells.length - cellBad.length) + " bad=" + cellBad.length);
if (cellBad.length > 0) {
  for (const d of cellBad.slice(0, 5)) console.log("  BAD " + d.date + " cell=" + d.cell + " summary=" + d.summary);
}
console.log("journal_rows=" + q("SELECT COUNT(*) n FROM journal").n + " noted_days=" + q("SELECT COUNT(*) n FROM journal WHERE premarket_notes != ''").n);
console.log("executions_rows=" + q("SELECT COUNT(*) n FROM executions").n);
console.log("daily_summary_rows=" + q("SELECT COUNT(*) n FROM daily_summary").n);
db.close();
console.log("done");
