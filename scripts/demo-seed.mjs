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
const REBUILD_BARS = process.argv[3] === "--rebuild-bars";
const existingTrades = db.prepare("SELECT COUNT(*) n FROM trades").get().n;
if (!REBUILD_BARS && existingTrades > 0) {
  console.error("REFUSED: trades already exist (" + existingTrades + "). The demo DB is disposable: wipe demo db and relaunch to reseed.");
  process.exit(1);
}
if (REBUILD_BARS && existingTrades === 0) {
  console.error("REFUSED: --rebuild-bars needs an already-seeded book (no trades found).");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// MODE: --rebuild-bars (Track A bars fix). The founder's trader eye caught
// fills printed above the day high and staircase candles: bar-gen and
// trade-gen were independent (the seed path even derives entries FROM bars,
// demo-seed.mjs trade builder), so bars could never be regenerated without
// moving trades. This mode inverts the flow: TRADES ARE FROZEN, bars derive
// through the fills. Invariance gate: every non-bar table is value-identical
// before/after, proven by ordered-dump SHA256, excluding ONLY intraday_bars,
// trade_technicals, trades.entry_ema9_distance_pct and the country columns.
// trade_technicals is WIPED and entry_ema9_distance_pct NULLed so the app's
// own boot backfill (electron/main/index.ts:248-294) recomputes both from the
// new bars - the dual-write in electron/technicals/repo.ts:281-289 ("healed
// here and nowhere else") is the exact core semantics, run by the app itself;
// existing complete rows would block it (repo.ts:319-322), hence the wipe.
// ---------------------------------------------------------------------------
if (REBUILD_BARS) {
  // Local: the top-level rnd2 below sits in TDZ at this point in the module.
  const rnd2 = (x) => Math.round(x * 100) / 100;
  const TRADE_COLS_FROZEN = db
    .prepare("PRAGMA table_info(trades)")
    .all()
    .map((c) => c.name)
    .filter((n) => !["entry_ema9_distance_pct", "country", "country_name", "region", "country_source"].includes(n));

  function invarianceHash() {
    const dump = {
      trades: db.prepare("SELECT " + TRADE_COLS_FROZEN.join(",") + " FROM trades ORDER BY id").all(),
      executions: db.prepare("SELECT * FROM executions ORDER BY id").all(),
      daily_summary: db.prepare("SELECT * FROM daily_summary ORDER BY date").all(),
      trade_mistake: db.prepare("SELECT * FROM trade_mistake ORDER BY trade_id, mistake_def_id").all(),
      journal: db.prepare("SELECT * FROM journal ORDER BY date").all(),
      trade_playbooks: db.prepare("SELECT * FROM trade_playbooks ORDER BY trade_id, playbook_id").all(),
    };
    return createHash("sha256").update(JSON.stringify(dump)).digest("hex");
  }

  const beforeHash = invarianceHash();
  console.log("invariance_before=" + beforeHash);

  // Anchor groups: per (symbol, date) the frozen fills + story facts.
  const groups = db
    .prepare(`
      SELECT t.symbol, t.date,
             SUM(t.net_pnl) AS day_pnl,
             MAX(t.daily_change_pct) AS chg
      FROM trades t GROUP BY t.symbol, t.date ORDER BY t.date, t.symbol
    `)
    .all();
  const fillsStmt = db.prepare(`
    SELECT e.price, e.timestamp_utc FROM executions e
    JOIN trades t ON t.id = e.round_trip_id
    WHERE t.symbol = ? AND t.date = ? ORDER BY e.timestamp_utc
  `);

  const DAY_MIN = 720; // 08:00Z .. 19:59Z inclusive, 1-minute bars
  const seedOf = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 31, 0);

  function rebuildGroup(g) {
    const r = mulberry32(SEED + 7000 + seedOf(g.symbol + "|" + g.date));
    const fills = fillsStmt.all(g.symbol, g.date).map((f) => ({
      price: f.price,
      min: Math.floor((Date.parse(f.timestamp_utc) - utcMs(g.date, 8, 0)) / 60000),
    }));
    const pMin = Math.min(...fills.map((f) => f.price));
    const pMax = Math.max(...fills.map((f) => f.price));
    const chg = g.chg ?? 40;
    const hold = g.day_pnl >= 0;

    const high = pMax * (1 + 0.04 + r() * 0.07);
    const close = hold
      ? Math.min(high * 0.995, pMax * (0.94 + r() * 0.05))
      : Math.max(pMin * (0.96 + r() * 0.06), pMin * 0.9);
    const priorClose = close / (1 + chg / 100);
    const rthOpen = pMin * (0.96 + r() * 0.05);
    const pmStartPrice = priorClose * (1 + 0.01 + r() * 0.05);

    // Ideal path over 720 minutes: premarket build -> opening drive -> pullback
    // cycles + tightening consolidation -> fade (red) or hold (green) into close.
    const RTH0 = 330;
    const driveEnd = RTH0 + 15 + Math.floor(r() * 30);
    const path = new Array(DAY_MIN);
    for (let i = 0; i < RTH0; i++) {
      const f = i / RTH0;
      const curve = Math.pow(f, 1.6);
      path[i] = pmStartPrice + (rthOpen - pmStartPrice) * curve;
    }
    for (let i = RTH0; i <= driveEnd; i++) {
      const f = (i - RTH0) / (driveEnd - RTH0);
      path[i] = rthOpen + (high - rthOpen) * Math.pow(f, 0.85);
    }
    let cursor = driveEnd + 1;
    let level = high;
    const midFloor = rthOpen + (high - rthOpen) * 0.45;
    let cycle = 0;
    while (cursor < 620) {
      cycle += 1;
      const legDown = 2 + Math.floor(r() * 4); // 2-5 red candles
      const depth = (high - midFloor) * (0.18 + r() * 0.22) / Math.sqrt(cycle);
      for (let k = 0; k < legDown && cursor < 620; k++, cursor++) {
        level = Math.max(midFloor, level - depth / legDown);
        path[cursor] = level;
      }
      const legUp = 3 + Math.floor(r() * 5);
      const climb = depth * (0.6 + r() * 0.5);
      for (let k = 0; k < legUp && cursor < 620; k++, cursor++) {
        level = Math.min(high * 0.995, level + climb / legUp);
        path[cursor] = level;
      }
      const flat = 4 + Math.floor(r() * 8); // tightening consolidation
      for (let k = 0; k < flat && cursor < 620; k++, cursor++) {
        level = level + (r() - 0.5) * depth * 0.12;
        path[cursor] = level;
      }
    }
    for (let i = cursor; i < DAY_MIN; i++) {
      const f = (i - cursor) / Math.max(1, DAY_MIN - 1 - cursor);
      path[i] = level + (close - level) * f;
    }
    path[DAY_MIN - 1] = close;

    // Anchor the path through every fill (+/-3 minute ease) - the law.
    for (const f of fills) {
      const m = Math.min(DAY_MIN - 1, Math.max(0, f.min));
      for (let d = -3; d <= 3; d++) {
        const i = m + d;
        if (i < 0 || i >= DAY_MIN) continue;
        const w = 1 - Math.abs(d) / 4;
        path[i] = path[i] + (f.price - path[i]) * w;
      }
      path[m] = f.price;
    }

    // Bars from the path: varied bodies/wicks, spike candle, phase volumes.
    const spikeMin = RTH0 + 3 + Math.floor(r() * Math.max(4, driveEnd - RTH0 - 3));
    const bars = [];
    const fillsByMin = new Map();
    for (const f of fills) {
      const m = Math.min(DAY_MIN - 1, Math.max(0, f.min));
      if (!fillsByMin.has(m)) fillsByMin.set(m, []);
      fillsByMin.get(m).push(f.price);
    }
    let prev = pmStartPrice;
    for (let i = 0; i < DAY_MIN; i++) {
      const t = utcMs(g.date, 8, 0) + i * 60000;
      const o = prev;
      const drift = path[i] - o;
      const noiseScale = i < RTH0 ? 0.004 : i <= driveEnd ? 0.012 : i < 620 ? 0.008 : 0.005;
      const c = Math.max(0.2, path[i] + (r() - 0.5) * path[i] * noiseScale * (0.4 + r()));
      let body = Math.abs(c - o);
      let h = Math.max(o, c) + body * (0.15 + r() * 1.1) + path[i] * noiseScale * r() * 0.6;
      let l = Math.min(o, c) - body * (0.15 + r() * 1.2) - path[i] * noiseScale * r() * 0.6;
      if (i === spikeMin) {
        h = Math.max(h, Math.min(high, Math.max(o, c) * (1 + 0.02 + r() * 0.03)));
      }
      if (i === driveEnd) h = Math.max(h, high);
      if (i === 0) l = Math.min(l, pmStartPrice * (1 - 0.004 - r() * 0.004));
      const anchored = fillsByMin.get(i);
      if (anchored) {
        h = Math.max(h, Math.max(...anchored) * 1.0015);
        l = Math.min(l, Math.min(...anchored) * 0.9985);
      }
      l = Math.max(0.2, l);
      const pmV = 250 + r() * 3800;
      const driveV = 22000 + r() * 65000;
      const midV = 2500 + r() * 13000;
      const lateV = 1500 + r() * 7000;
      const phaseV = i < RTH0 ? pmV * (i > RTH0 - 40 ? 3 : 1) : i <= driveEnd ? driveV : i < 620 ? midV : lateV;
      const v = Math.round(phaseV * (0.6 + 2.6 * (body / Math.max(0.01, path[i] * 0.006))) * (i === spikeMin ? 3 : 1));
      bars.push({ t, o: rnd2(o), h: rnd2(h), l: rnd2(l), c: rnd2(c), v: Math.max(50, v) });
      prev = c;
    }

    // Warmup: quiet prior session ending exactly at priorClose.
    const prior = new Date(g.date + "T12:00:00Z");
    prior.setUTCDate(prior.getUTCDate() - 1);
    const priorDate = prior.toISOString().slice(0, 10);
    const warm = [];
    let wp = priorClose * (0.965 + r() * 0.03);
    for (let i = 0; i < 390; i++) {
      const t = utcMs(priorDate, 13, 30) + i * 60000;
      const o = wp;
      wp = i === 389 ? priorClose : Math.max(0.2, wp + (r() - 0.5) * wp * 0.006 + (priorClose - wp) * 0.01);
      warm.push({ t, o: rnd2(o), h: rnd2(Math.max(o, wp) * (1 + r() * 0.003)), l: rnd2(Math.min(o, wp) * (1 - r() * 0.003)), c: rnd2(wp), v: Math.round(400 + r() * 5200) });
    }
    return { bars, warm };
  }

  const nowIso2 = "2026-06-30T21:30:00.000Z";
  const rebuilt = groups.map((g) => ({ g, out: rebuildGroup(g) }));
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM intraday_bars").run();
    const ins = db.prepare(
      "INSERT INTO intraday_bars (symbol, date, bars, warmup_bars, warmup_attempted_at, warmup_error, fetched_at, error) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)",
    );
    for (const { g, out } of rebuilt) {
      ins.run(g.symbol, g.date, JSON.stringify(out.bars), JSON.stringify(out.warm), nowIso2, nowIso2);
    }
    db.prepare("DELETE FROM trade_technicals").run();
    db.prepare(
      "UPDATE trades SET entry_ema9_distance_pct = NULL, country = 'US', country_name = 'United States', region = 'USA', country_source = 'manual'",
    ).run();
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const afterHash = invarianceHash();
  console.log("invariance_after=" + afterHash);
  console.log("invariance_match=" + (beforeHash === afterHash));

  // Battery.
  const allBars = new Map();
  for (const row of db.prepare("SELECT symbol, date, bars FROM intraday_bars").all()) {
    allBars.set(row.symbol + "|" + row.date, JSON.parse(row.bars));
  }
  let contained = 0;
  let total = 0;
  const allFills = db.prepare(`
    SELECT t.symbol, t.date, e.price, e.timestamp_utc
    FROM executions e JOIN trades t ON t.id = e.round_trip_id
  `).all();
  for (const f of allFills) {
    total += 1;
    const bars = allBars.get(f.symbol + "|" + f.date) ?? [];
    const ts = Date.parse(f.timestamp_utc);
    const bar = bars.find((b) => b.t <= ts && ts < b.t + 60000);
    if (bar && bar.l <= f.price && f.price <= bar.h) contained += 1;
  }
  console.log("fill_containment=" + contained + "/" + total);
  let envOk = 0;
  let cvOk = 0;
  for (const { g } of rebuilt) {
    const bars = allBars.get(g.symbol + "|" + g.date);
    const fp = allFills.filter((f) => f.symbol === g.symbol && f.date === g.date).map((f) => f.price);
    const hi = Math.max(...bars.map((b) => b.h));
    const lo = Math.min(...bars.map((b) => b.l));
    if (hi >= Math.max(...fp) && lo <= Math.min(...fp)) envOk += 1;
    const bodies = bars.slice(330).map((b) => Math.abs(b.c - b.o)).filter((x) => x > 0);
    const mean = bodies.reduce((a, x) => a + x, 0) / bodies.length;
    const sd = Math.sqrt(bodies.reduce((a, x) => a + (x - mean) * (x - mean), 0) / bodies.length);
    const med = bodies.slice().sort((a, b) => a - b)[Math.floor(bodies.length / 2)];
    if (sd / mean >= 0.45 && Math.max(...bodies) >= 4 * med) cvOk += 1;
  }
  console.log("envelope_high_low=" + envOk + "/" + rebuilt.length);
  console.log("body_variance_floor=" + cvOk + "/" + rebuilt.length);
  const spans = [...allBars.values()].every((b) => {
    const first = new Date(b[0].t).toISOString().slice(11, 16);
    const last = new Date(b[b.length - 1].t).toISOString().slice(11, 16);
    return first === "08:00" && last === "19:59";
  });
  console.log("bars_cover_premarket_and_rth=" + spans);
  const cells = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT t.date, ROUND(SUM(t.net_pnl_precise), 2) AS cell, ds.total_pnl AS s
      FROM trades t JOIN daily_summary ds ON ds.date = t.date
      GROUP BY t.date HAVING cell != 0 AND ABS(cell - s) <= 0.005
    )
  `).get().n;
  console.log("day_cell_check=" + cells + "/21");
  db.close();
  console.log(beforeHash === afterHash && contained === total && envOk === rebuilt.length ? "REBUILD OK" : "REBUILD FAILED");
  process.exit(beforeHash === afterHash && contained === total && envOk === rebuilt.length ? 0 : 1);
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

  // Playbook pools, gated on side. The seeder REFERENCES playbooks, it never
  // authors them, so the side of each row is DERIVED from the row itself: a row
  // is short-side when its name/description names the short side and long-side
  // when it names the long side (long / bull); anything else is genuinely
  // side-neutral and stays eligible for both. is_system rows are excluded
  // outright - "No Setup" is the app's protected fallback for an UNCLASSIFIED
  // trade, not a setup a trader picks, and a curated demo should never show it.
  // Weights are keyed by name so they survive any renumbering; the short-side
  // setup is weighted up inside its own pool because it is the only one there
  // and would otherwise land on ~2 of the 17 shorts.
  const PB_WEIGHT = {
    "1-min Pullback": 3,
    "5-min Pullback": 1,
    "Bull Flag": 2,
    "Micro Pullback": 3,
    "First Pullback to VWAP": 1,
    "ABCD": 1,
    "Halt Resume Long": 1,
    "Parabolic Short": 6,
  };
  const pbRows = db
    .prepare("SELECT id, name, description, is_system FROM playbooks ORDER BY id")
    .all();
  const pbSideOf = (p) => {
    const t = (p.name + " " + (p.description || "")).toLowerCase();
    const isShort = /\bshort\b|\bshorting\b/.test(t);
    const isLong = /\blong\b|\bbull\b|\bbullish\b/.test(t);
    if (isShort && !isLong) return "short";
    if (isLong && !isShort) return "long";
    return "neutral";
  };
  const pbPool = (want) => {
    const out = [];
    for (const p of pbRows) {
      if (p.is_system === 1) continue;
      const s = pbSideOf(p);
      if (s !== "neutral" && s !== want) continue;
      const w = PB_WEIGHT[p.name] ?? 1;
      for (let i = 0; i < w; i++) out.push(p.id);
    }
    return out;
  };
  const playbookLong = pbPool("long");
  const playbookShort = pbPool("short");
  if (!playbookLong.length || !playbookShort.length) {
    throw new Error("demo-seed: empty playbook pool - the app's defaults are missing");
  }
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
    // Fee TARGET. Same draw, same position in the rTrade stream as the gross
    // this replaces, so every side, share count and entry time downstream is
    // byte-identical to the pre-fix book. It is now a target the exact solve
    // aims at, never the source of a back-derived fee.
    // [was: gross INVENTED here as net + rand(1..6) and fees BACK-DERIVED as
    // |gross - net|, so neither figure had any relationship to the fills -
    // 0 of 140 trades reconciled against their own executions.]
    const feeTargetC = Math.round(
      (tp.pnl >= 0 ? between(rTrade, 1, 6) : between(rTrade, 0.5, 3)) * 100,
    );

    // DNA pillars: ~88% fully tagged; the rest lose 1-2 pillars honestly.
    const tagged = rTag() < DNA_TAGGED_SHARE;
    const chased = rTag() < (tp.red ? 0.3 : 0.12);
    const ema9 = chased ? rnd2(between(rTag, 5.2, 17.5)) : rnd2(between(rTag, -1.8, 4.7));

    // The remaining rTrade draws, hoisted out of the row literal but kept in
    // their original relative order, so the stream stays byte-identical while
    // the row itself can be built AFTER the fills are solved.
    const entryTimeframe = rTrade() < 0.8 ? "1m" : "5m";
    // Playbook choice GATES ON SIDE (see the pools above).
    // [was: pick(playbookWeighted, rTrade) off a hard-coded id list that never
    // looked at side - 13 of the 14 "Parabolic Short" trades were LONG, and 9
    // trades sat on the protected is_system "No Setup" row.]
    const playbookId = pick(side === "long" ? playbookLong : playbookShort, rTrade);
    const confidence = 1 + Math.floor(rTrade() * 5);
    const plannedRisk = Math.round(between(rTrade, 30, 120));
    const maeFactor = between(rTrade, 0.3, 1.4);
    const mfeFactor = between(rTrade, 1.0, 2.6);

    // Fills: 1-2 entries, 1-3 exits (momentum partials).
    const nIn = rTrade() < 0.35 ? 2 : 1;
    const nOut = 1 + Math.floor(rTrade() * 3);

    // -----------------------------------------------------------------------
    // EXACT SOLVE - integer cents throughout, so every product is exact.
    // The dependency now runs FORWARD from the executions, matching the app's
    // own law (src/core/import/build-round-trips.ts:223-243):
    //     gross = SUM(sells) - SUM(buys)   fees = SUM(per-fill fees)
    //     net   = gross - fees
    // The authored net is the fixed point: the closing level is solved so that
    // gross - net lands on a plausible fee, which makes net come out at the
    // authored tp.pnl EXACTLY. Nothing downstream is compensated.
    // [was: 2dp averages back-solved from net, then fills decorated off those
    // averages with x1.004 / x0.997 jitter - the fills and the headline figure
    // told different stories on all 140 trades.]
    // -----------------------------------------------------------------------
    const netC = Math.round(tp.pnl * 100);
    const openC = Math.round(entry * 100);
    // Adjacent price levels, ~0.2% of price and never under a cent.
    const stepC = Math.max(1, Math.round(openC * 0.002));
    // Leg quantities stay multiples of 50 (the last leg takes the remainder),
    // so the multiset never degenerates into odd-lot crumbs.
    const legQty = (n) => {
      const out = [];
      let rem = shares;
      for (let i = 0; i < n; i++) {
        const q = i === n - 1 ? rem : Math.round(shares / n / 50) * 50 || 100;
        out.push(q);
        rem -= q;
      }
      return out;
    };
    const qIn = legQty(nIn);
    const qOut = legQty(nOut);
    // Opening legs sit at openC, openC+step, ... (paying up on an add for a
    // long; scaling into strength for a short). Closing legs step the same way
    // down from the solved closing level.
    const openValC = qIn.reduce((s, q, i) => s + q * (openC + i * stepC), 0);
    const closeOffC = qOut.reduce((s, q, j) => s + q * (j * stepC), 0);
    // gross = sells - buys for BOTH sides. For a long the closing legs are the
    // sells; for a short the OPENING legs are. Solve the closing level to the
    // drawn fee target, then walk it until the fee clears the floor.
    const FEE_FLOOR_C = 20;
    let closeC;
    if (side === "long") {
      closeC = Math.round((netC + feeTargetC + closeOffC + openValC) / shares);
      while (closeC * shares - closeOffC - openValC - netC < FEE_FLOOR_C) closeC += 1;
    } else {
      closeC = Math.round((openValC + closeOffC - netC - feeTargetC) / shares);
      while (openValC - (closeC * shares - closeOffC) - netC < FEE_FLOOR_C) closeC -= 1;
    }
    const closeValC = closeC * shares - closeOffC;
    if (closeC - (nOut - 1) * stepC <= 0) {
      throw new Error("demo-seed: non-positive closing level on trade " + seq);
    }
    const sellsC = side === "long" ? closeValC : openValC;
    const buysC = side === "long" ? openValC : closeValC;
    const grossC = sellsC - buysC;
    const feesC = grossC - netC; // exact by construction, >= FEE_FLOOR_C
    // Fee components in integer cents; CAT absorbs the remainder so the four
    // sum to feesC exactly.
    const ecnC = Math.floor(feesC * 0.55);
    const secC = Math.floor(feesC * 0.2);
    const finraC = Math.floor(feesC * 0.15);
    const catC = feesC - ecnC - secC - finraC;
    // Per-fill split: integer cents, last fill absorbs the remainder, so the
    // executions re-sum to the trade total EXACTLY.
    // [was: rnd2(feeEcn / fills.length) at the insert - a re-round that could
    // not re-sum; 122 of 140 trades disagreed with their own fills on fees.]
    const nFills = nIn + nOut;
    const splitC = (totalC) => {
      const base = Math.floor(totalC / nFills);
      const a = new Array(nFills).fill(base);
      a[nFills - 1] = totalC - base * (nFills - 1);
      return a;
    };
    const ecnSplit = splitC(ecnC);
    const secSplit = splitC(secC);
    const finraSplit = splitC(finraC);
    const catSplit = splitC(catC);

    // Each leg is priced off ITS OWN level and tagged with its own side.
    // [was: the stored columns and the side tags were both swapped for shorts
    // at the row literal and here, but the PRICE BASES were not - the open-sell
    // fill was priced off the cover average and the cover-buy off the open
    // average. 17 of 17 shorts carried fill-inverted executions, 68.3% of all
    // reconciliation error.]
    const fills = [];
    for (let i = 0; i < nIn; i++) {
      const priceC = openC + i * stepC;
      fills.push({
        side: side === "long" ? "B" : "S",
        qty: qIn[i],
        price: priceC / 100,
        t: openMs + i * 45000,
      });
    }
    for (let j = 0; j < nOut; j++) {
      const priceC = closeC - j * stepC;
      fills.push({
        side: side === "long" ? "S" : "B",
        qty: qOut[j],
        price: priceC / 100,
        t: closeMs - (nOut - 1 - j) * 60000,
      });
    }

    // Stored averages are the true quantity-weighted means of those fills, so
    // shares x average reproduces the executions to the cent.
    const avgOpen = openValC / 100 / shares;
    const avgClose = closeValC / 100 / shares;

    const row = {
      date: tp.date,
      symbol: tp.sym,
      side,
      open_time: new Date(openMs).toISOString().replace(".000Z", "Z"),
      close_time: new Date(closeMs).toISOString().replace(".000Z", "Z"),
      shares,
      avg_buy: side === "long" ? avgOpen : avgClose,
      avg_sell: side === "long" ? avgClose : avgOpen,
      net_pnl: tp.pnl,
      gross_pnl: grossC / 100,
      fee_ecn: ecnC / 100,
      fee_sec: secC / 100,
      fee_finra: finraC / 100,
      fee_cat: catC / 100,
      total_fees: feesC / 100,
      exec_hash: sha1("demo-" + seq),
      entry_timeframe: entryTimeframe,
      ema9,
      account_id: accountId,
      playbook_id: playbookId,
      confidence,
      planned_risk: plannedRisk,
      float_shares: tagged ? TICKERS[tp.sym].float : null,
      daily_change_pct: tagged ? td.changePct : (rTag() < 0.5 ? td.changePct : null),
      rvol: tagged ? td.rvol : null,
      catalyst_type: tagged || rTag() < 0.5 ? td.catalyst : null,
      mae: rnd2(-Math.abs(perShare) * maeFactor),
      mfe: rnd2(Math.abs(perShare) * mfeFactor),
      account_name: ACCOUNT_NAME,
      executions_json: "[]",
      // Precise trio - mirrors the app's own import writer (electron/import/
      // repo.ts:461-469, Beat F3): precise falls back to the 2dp value, and
      // net_pnl_precise = gross_precise - fees_precise. The calendar day-cell
      // CTE (electron/calendar/get.ts:92-94), the balance strip
      // (electron/cash/balance.ts:63,162) and the journal day rollup all sum
      // these columns; the column default 0 is what rendered day cells $0.00.
      gross_pnl_precise: grossC / 100,
      total_fees_precise: feesC / 100,
      net_pnl_precise: (grossC - feesC) / 100,
    };
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
        ecnSplit[i] / 100, secSplit[i] / 100, finraSplit[i] / 100, catSplit[i] / 100,
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
    agg.pnl += tp.pnl; agg.fees += feesC / 100; agg.n += 1; agg.gross += grossC / 100;
    if (tp.pnl > 0) { agg.w += 1; agg.maxW = Math.max(agg.maxW, tp.pnl); } else { agg.l += 1; agg.maxL = Math.min(agg.maxL, tp.pnl); }
    dayAgg.set(tp.date, agg);
  }

  // -------------------------------------------------------------------------
  // THE FEATURED TRADE - the marketing chapter's hero, AUTHORED not generated.
  //
  // The chapter needs one trade that reads as a textbook momentum setup, and
  // the generated book does not contain one. A survey of all 26 ticker-days
  // found seven with a >= 2x extension; QMTX 2026-06-12 was the only day whose
  // pullback also held its shape - 7.96 at the open, 20.44 by 14:00 (x2.57 in
  // half an hour on the session's heaviest volume), then a nine-minute flush
  // to 16.41 that pierces the 9EMA once and immediately reclaims it. This
  // trade is the entry into that reclaim.
  //
  // WHY 14:10 AT 16.80: at that minute the rising 9EMA (16.75) has just passed
  // back UNDER price, with the 20EMA (16.05) and VWAP (12.65) stacked well
  // below - the picture the chapter claims. 16.80 sits inside the 14:10 bar
  // (16.65-16.91) and above the 9EMA, so the stored Entry-vs-9EMA figure reads
  // a clear positive (~+0.3%) rather than landing on zero.
  //
  // WHY THE EXITS ARE CAPPED AT 17.01: --rebuild-bars re-derives the whole
  // price path from the fill set, and the session high is pMax * ~1.07. This
  // day's pMax is 17.01, set by the 17:40 entry of another trade. An exit
  // above it inflates the day - measured: exits at 18.05 lift the high to
  // 21.77 and push the 9EMA back ABOVE price through the entire entry window,
  // destroying the setup. Capping at 17.01 keeps rthOpen 7.96 and high 20.44
  // byte-identical. The recovery runs to 18.20 on the tape; this trade
  // deliberately does not reach for it.
  //
  // It is appended AFTER the 140 generated trades, so it consumes none of the
  // RNG the rest of the book depends on, and it leaves the day's existing four
  // trades untouched.
  // -------------------------------------------------------------------------
  const FEATURED = {
    date: "2026-06-12",
    symbol: "QMTX",
    playbook: "Micro Pullback",
    feesC: 900, // 1500 shares at 0.6c/share - inside the book's own fee scale
    fills: [
      { side: "B", qty: 1500, priceC: 1680, h: 14, m: 10 },
      { side: "S", qty: 750, priceC: 1695, h: 14, m: 13 },
      { side: "S", qty: 750, priceC: 1700, h: 14, m: 15 },
    ],
  };
  {
    const f = FEATURED;
    const td = tickerDays.get(f.symbol + "|" + f.date);
    if (!td) throw new Error("demo-seed: featured trade has no ticker-day: " + f.symbol + "|" + f.date);
    const pbRow = pbRows.find((p) => p.name === f.playbook);
    if (!pbRow) throw new Error("demo-seed: featured playbook missing: " + f.playbook);
    // Same exact-cent law as the generated trades: gross from the executions,
    // fees authored, net = gross - fees.
    const buysC = f.fills.filter((x) => x.side === "B").reduce((s, x) => s + x.qty * x.priceC, 0);
    const sellsC = f.fills.filter((x) => x.side === "S").reduce((s, x) => s + x.qty * x.priceC, 0);
    const shares = f.fills.filter((x) => x.side === "B").reduce((s, x) => s + x.qty, 0);
    const grossC = sellsC - buysC;
    const feesC = f.feesC;
    const netC = grossC - feesC;
    if (netC <= 0) throw new Error("demo-seed: featured trade must be a winner");
    if (Math.max(...f.fills.map((x) => x.priceC)) > 1701) {
      throw new Error("demo-seed: featured exit above pMax 17.01 - would inflate the day");
    }
    const ecnC = Math.floor(feesC * 0.55);
    const secC = Math.floor(feesC * 0.2);
    const finraC = Math.floor(feesC * 0.15);
    const catC = feesC - ecnC - secC - finraC;
    const nF = f.fills.length;
    const splitF = (totalC) => {
      const base = Math.floor(totalC / nF);
      const a = new Array(nF).fill(base);
      a[nF - 1] = totalC - base * (nF - 1);
      return a;
    };
    const ecnS = splitF(ecnC), secS = splitF(secC), finS = splitF(finraC), catS = splitF(catC);
    const tms = f.fills.map((x) => utcMs(f.date, x.h, x.m));
    const stamp = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
    const wire = f.fills.map((x, i) => ({
      trade_id: "DTF",
      order_id: "DOF-" + (i + 1),
      symbol: f.symbol,
      side: x.side,
      is_short: false,
      qty: x.qty,
      price: x.priceC / 100,
      time: stamp(tms[i]),
      date: f.date,
      source_broker: "DAS",
      source_format: "execution",
      account_name: ACCOUNT_NAME,
    }));
    const featRow = {
      date: f.date,
      symbol: f.symbol,
      side: "long",
      open_time: stamp(tms[0]),
      close_time: stamp(tms[tms.length - 1]),
      shares,
      avg_buy: buysC / 100 / shares,
      avg_sell: sellsC / 100 / shares,
      net_pnl: netC / 100,
      gross_pnl: grossC / 100,
      fee_ecn: ecnC / 100,
      fee_sec: secC / 100,
      fee_finra: finraC / 100,
      fee_cat: catC / 100,
      total_fees: feesC / 100,
      exec_hash: sha1("demo-featured-" + f.symbol + "-" + f.date),
      entry_timeframe: "1m",
      ema9: null, // the app's boot backfill computes it from the rebuilt bars
      account_id: accountId,
      playbook_id: pbRow.id,
      confidence: 5,
      planned_risk: 90,
      float_shares: TICKERS[f.symbol].float,
      daily_change_pct: td.changePct,
      rvol: td.rvol,
      catalyst_type: td.catalyst,
      mae: -0.15,
      mfe: 0.27,
      account_name: ACCOUNT_NAME,
      executions_json: JSON.stringify(wire),
      gross_pnl_precise: grossC / 100,
      total_fees_precise: feesC / 100,
      net_pnl_precise: (grossC - feesC) / 100,
    };
    const featInfo = insTrade.run(featRow);
    const featId = Number(featInfo.lastInsertRowid);
    f.fills.forEach((x, i) => {
      insExec.run(
        featId, "DTF", "DOF-" + (i + 1), f.symbol, x.side, x.qty, x.priceC / 100,
        stamp(tms[i]), x.side === "B" ? "REMOVED" : "ADDED", ACCOUNT_NAME,
        ecnS[i] / 100, secS[i] / 100, finS[i] / 100, catS[i] / 100,
      );
    });
    const fAgg = dayAgg.get(f.date) ?? { pnl: 0, fees: 0, n: 0, w: 0, l: 0, gross: 0, maxW: 0, maxL: 0 };
    fAgg.pnl += netC / 100;
    fAgg.fees += feesC / 100;
    fAgg.n += 1;
    fAgg.gross += grossC / 100;
    fAgg.w += 1;
    fAgg.maxW = Math.max(fAgg.maxW, netC / 100);
    dayAgg.set(f.date, fAgg);
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
