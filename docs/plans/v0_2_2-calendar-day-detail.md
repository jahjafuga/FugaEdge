# v0.2.2 — Calendar Day-Detail Modal

**Status:** Planning complete, ready to execute
**Target ship:** 5-7 working days from start
**Started:** [TBD — to be set when Day 1 begins]
**Theme:** "Click a day, see everything you need for that day"

---

## Why this release exists

Two motivations from real DTSM beta-tester conversation (Tester B, 2026-05-27):

1. **The current Calendar pushes content down when a day is clicked.** Day details expand inline below the calendar grid, forcing the user to scroll, and breaking the spatial sense of "I'm reviewing this day." Calendar review is a daily ritual for most momentum traders — it deserves a UX that respects that.

2. **The day-level review surface should be the "home" for a trader.** Most momentum traders spend more time on Calendar than any other surface (it's how they think about their work — day by day, not by aggregate stats). When they click a day, they want every piece of context for that day in one place: P&L summary, key metrics, trade list, intraday chart, notes, mistakes pattern. Currently this is scattered across Reports, Trades, Deep Analytics, and the trade-level chart.

v0.2.2 fixes both by introducing a **Day Detail Modal** that mirrors the existing **Trade Detail Modal** pattern: same overlay style, same tab strip, same card-grid layout — but scoped to one day rather than one trade. Zero learning curve (the pattern is familiar), maximum information density (everything-in-one-place).

---

## What ships

### Day Detail Modal (new)

A new overlay modal triggered by clicking any day in the Calendar surface. Structurally identical to Trade Detail Modal (same component family). Five tabs:

1. **Overview** — day P&L summary header + card-grid of day-level metrics
2. **Trades** — sortable list of all round trips that day
3. **Chart** — intraday chart per symbol, with this day's trade entry/exit markers overlaid
4. **Notes** — day-level free-text journal entry (autosave)
5. **Mistakes** — aggregated mistakes-tagged-on-trades for this day, plus optional day-level mistake tags

### Calendar surface change

Clicking a day NO LONGER expands content inline below the calendar grid. Instead, the Day Detail Modal opens overlay-style (calendar dims behind it).

The existing "inline expansion" UI is removed. Calendar regains its full vertical space.

### Reused existing logic

- Trade Detail Modal component pattern (header, tab strip, card grid, close affordance)
- Intraday chart rendering (from Trade Detail Modal's Chart tab — extended to handle multi-symbol per-day case)
- Money Left on Table math (from Deep Analytics → Execution tab, surfaced day-scoped)
- Round-trip aggregation logic (already exists)
- Notes and Mistakes data models (already exist at trade-level — extended to day-level)

### Bug fix bundled

- Stale `v0.3.0-or-later-ideas.md` entry for "Trade Behavior Analytics — MFE / Reversal Tracking" — needs cleanup since MFE tracking already exists in production. Either delete the entry, narrow it to "expand MFE coverage from 38/99 → 99/99 trades," or rescope to focus on the parts that don't exist yet.

---

## What does NOT ship in v0.2.2

Deferred to v0.2.3 or later:

- **Attachments tab** (for day-level screenshots of broker P&L, scanner state, etc.)
- **Replay tab** (animated playback of trades throughout the day)
- **Comparison tab** (this day vs your typical day — requires baseline math)
- **Catalyst tab** (news/catalyst for symbols traded — requires Polygon News API)
- **"Day-of-week" pattern hints** (e.g. "Wednesdays are your strongest" — belongs in Edge Insights, not Day Detail)
- **Cross-day comparison** ("compared to yesterday" — feature creep)

Deferred to v0.2.5:

- Challenge/Bucket system (separate feature, separate release)

**Discipline rule:** if a v0.2.2 conversation surfaces something cool that's not in the scope above, write it in `docs/plans/v0.3.0-or-later-ideas.md` and do not build it in v0.2.2.

---

## Architecture

### Day Detail Modal component

Lives in `/src/components/DayDetailModal/` — sibling to existing `/src/components/TradeDetailModal/`.

Shares structural code:
- Overlay backdrop + close-on-Escape + close-on-backdrop-click
- Tab strip component
- Card-grid layout component

Per ARCHITECTURE.md:
- No business logic inside the component
- All metrics come from `/src/core/analytics/day.ts` (new pure module)
- Component calls `dayRepo.getDayDetail(date)` which returns a typed `DayDetail` object
- Component is web-portable — no Electron/fs/sqlite imports

### Day-level metrics module

New file: `/src/core/analytics/day.ts`

Pure function: `computeDayMetrics(trades: RoundTrip[], intradayData: IntradayBars[]): DayMetrics`

Returns:

```typescript
interface DayMetrics {
  date: string                       // ISO YYYY-MM-DD
  dayOfWeek: string                  // "Wednesday", etc.
  grossPnl: number
  totalFees: number
  netPnl: number
  tradeCount: number
  winCount: number
  lossCount: number
  scratchCount: number
  winRate: number                    // 0-100
  biggestWin: { symbol: string; pnl: number } | null
  worstLoss: { symbol: string; pnl: number } | null
  avgRMultiple: number | null        // null if no trades have planned risk
  avgWin: number
  avgLoss: number
  sessionFirstTradeTime: string      // HH:MM
  sessionLastTradeTime: string       // HH:MM
  symbolsTraded: string[]
  topThreeSymbols: { symbol: string; tradeCount: number }[]
  totalShares: number
  totalDollarVolume: number
  mostUsedPlaybook: { playbook: string; tradeCount: number; winRate: number } | null
  // Momentum-specific metrics
  firstTradePnl: { symbol: string; pnl: number } | null
  moneyLeftOnTable: number | null    // sum across trades with MFE data
  moneyLeftCoverage: { withMfe: number; total: number } | null  // e.g. 3 of 5
}
```

### Data repository extension

`/src/data/dayRepo.ts` (new):
- `getDayDetail(date: string): Promise<DayDetail>` — returns trades + metrics + notes + mistakes for a day

Implementation in `/src/data/sqlite/dayRepoSqlite.ts` queries existing tables (no schema changes needed). All metrics computed via the pure module above.

### Modal stacking (Day → Trade)

When user clicks a trade in the Day Detail's Trades tab:
- Existing Trade Detail Modal opens on top
- Day Detail Modal stays mounted but visually behind
- Closing Trade Detail returns to Day Detail (state preserved)
- Closing Day Detail returns to Calendar

Z-index discipline:
- Calendar surface: 0
- Day Detail backdrop: 100
- Day Detail content: 110
- Trade Detail backdrop: 200
- Trade Detail content: 210

### Intraday chart reuse

Existing `/src/components/TradeDetailModal/ChartTab.tsx` is per-trade per-symbol.

Day Detail's Chart tab needs per-day multi-symbol. Approach:
- Extract chart rendering into `/src/components/Chart/IntradayChart.tsx` (shared component)
- Day Detail Chart tab adds a symbol picker (tabs across the top: each symbol traded that day)
- Default selected symbol: the symbol with the largest absolute P&L that day
- Entry/exit markers from all trades in that symbol that day overlay on the chart
- Same chart data source (Massive API or whatever currently powers Trade Detail chart)

### Day-level notes and mistakes data model

Two new tables:

```sql
CREATE TABLE day_notes (
  date TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE day_mistakes (
  date TEXT NOT NULL,
  mistake_tag TEXT NOT NULL,
  PRIMARY KEY (date, mistake_tag)
);
```

Migration runs once on first launch after v0.2.2 install. Non-destructive (both tables are new, no existing data touched).

---

## Architecture decisions

### Decision 1 — Modal vs panel vs route

**Decided: overlay modal (same pattern as Trade Detail Modal).**

Considered:
- Side panel (slides in from right) — rejected: calendar visibility is less important than information density once a day is selected
- Full-screen route — rejected: breaks the "drill in, drill back out" mental model; navigation history gets messy
- Bottom drawer — rejected: this is exactly what the current "expand inline" pattern is, and it's what we're moving away from

The modal pattern wins because (a) it's already familiar to users, (b) it preserves context (calendar stays visible behind), and (c) it scales naturally to nested drill-down (day → trade modal stack).

### Decision 2 — Default tab on open

**Decided: Overview tab is default.**

The Overview tab carries the headline numbers (P&L, trade count, win rate) — exactly what a trader wants to see first when reviewing a day. Trades, Chart, Notes, Mistakes are deeper-dive tabs that users navigate to when they want specifics.

### Decision 3 — Money Left on Table coverage display

**Decided: show "(N of M trades — intraday data incomplete)" subtitle when MFE coverage isn't 100%.**

Current FugaEdge MFE coverage in test data is ~38/99 trades. Silently summing partial data would understate the true "money left" amount. Honest disclosure of incomplete data matches the FugaEdge brand voice (see also: "Fees: not reported" instead of misleading $0.00 in v0.2.0).

If coverage is 0/N (no intraday data for any trade that day), the card shows "Money left: awaiting intraday data" — same pattern as Deep Analytics → Execution's existing empty state.

### Decision 4 — Symbols traded card threshold

**Decided: show top 3 symbols + total count.**

Average momentum trader trades 5-15 symbols per day. Showing all of them clutters the card. Top 3 + total ("12 symbols · top: HCTO, AMSS, AIIO") gives the gestalt without flooding.

### Decision 5 — First trade P&L card

**Decided: ship as standalone card on Overview tab.**

Ross Cameron teaches that the first trade often sets the day's tone. Whether your first trade was a winner or loser is a meaningful psychological data point. Worth its own card alongside biggest-win / worst-loss.

Format: `FIRST TRADE · HCTO · +$181.25 (+1.4R)` — symbol, P&L, R-multiple if available.

---

## Build sequence

5-7 working days. Each day is a focused Claude Code session.

### Day 1 — Day Detail Modal shell + Overview tab + day metrics computation

- Create `/src/components/DayDetailModal/` shell mirroring TradeDetailModal structure
- Create `/src/core/analytics/day.ts` pure module with `computeDayMetrics()`
- Create `/src/data/dayRepo.ts` and SQLite implementation
- Build Overview tab with all card-grid metrics:
  - Header: date, day-of-week, GROSS · FEES · NET P&L
  - Cards: trade count, win rate, biggest win, worst loss, first trade P&L, avg R-multiple, avg win vs avg loss, session window, symbols traded (top 3 + count), total volume, most-used playbook, **money left on table**
- Wire Calendar day-click to open the modal (replace current inline expansion)
- All v0.2.1 tests still pass

### Day 2 — Trades tab + modal stacking

- Build Trades tab with sortable table
- Columns: time, symbol, side, playbook, shares, entry/exit, net P&L, R-multiple, mistakes-count
- Default sort: chronological ascending
- Toggle sort options: biggest P&L, worst mistakes
- Click row → opens existing TradeDetailModal as stacked overlay
- Modal stacking logic: state preservation, z-index discipline, close-back-to-day-modal
- Tests verify modal stack open/close behaviors

### Day 3 — Chart tab + intraday data per symbol

- Extract `/src/components/Chart/IntradayChart.tsx` from TradeDetailModal
- TradeDetailModal Chart tab refactored to use the extracted component (regression-test thoroughly)
- DayDetailModal Chart tab implemented:
  - Symbol picker tabs at top of chart
  - Default: symbol with largest absolute P&L that day
  - Trade entry/exit markers overlaid for all trades in selected symbol that day
- Tests with mocked intraday data

### Day 4 — Notes and Mistakes tabs

- Database migration: add `day_notes` and `day_mistakes` tables (non-destructive, no existing data affected)
- Notes tab: free-text textarea with autosave (debounced 500ms)
- Mistakes tab: aggregate per-trade mistake tags + UI for adding day-level mistake tags
- Tests cover both tabs + autosave behavior

### Day 5 — Edge cases + polish

- Day with 0 trades (modal still opens — shows "no trades on this day" message + Notes tab still works)
- Day with 1 symbol only (Chart tab's symbol picker still renders cleanly)
- Day with intraday data missing entirely (Money Left card shows "awaiting" state; Chart tab shows banner)
- Day with all scratches (win rate = 0%, but no big losses either — render honestly)
- Modal opens at very wide / narrow viewport (responsive sanity check)
- Modal stacking edge cases (close TradeDetail with Escape doesn't close DayDetail by mistake)
- Light/dark mode audit (every new card and tab works in both)

**Week Performance — Hold Time section (deferred from Day 4.5c).** The Week
Performance tab ships in 4.5c WITHOUT Hold Time (avg hold all / winners /
losers / scratches). Unlike the other cheap week stats, it carries no field on
`WeekMetrics` and needs new pure aggregation in `week.ts`: parse
`open_time`/`close_time`, diff to seconds, partition into 4 buckets
(all + winners + losers + scratches), null-handle still-open trades — the
heaviest of the candidate week stats. It's thematically the same "execution
timing" family as the intraday MFE/MAE/Money-Left wiring this day already
absorbs, so wire it here alongside that work (not in 4.5c, not v0.3.0) so the
two land together. Mirror the day.ts hold-time accumulators (`day.ts` lines
36-45, 89-109, 157-160) + add `week.test.ts` coverage.

**Intraday MAE/MFE/Money-Left — finding (2026-05-29 diagnosis).** Enrichment
(fetch→compute→store) is VERIFIED WORKING — `trades.mae`/`mfe` populated, bars
join correctly (`open_time` is true UTC-with-Z), `computeMaeMfe`/`computeEma9Distance`
produce real values. The remaining Day-5 task is **DISPLAY WIRING ONLY** (smaller
than originally scoped): `SELECT mae,mfe` in `electron/trades/list.ts` + add the
fields to `TradeListRow` + replace `day.ts`'s hardcoded `avgMfeDollars`/`avgMaeDollars`
nulls with real aggregates + add a MAE/MFE field to `WeekMetrics` + render in both
Execution Quality sections. **EMA9 distance is already fully wired end-to-end —
use it as the template.** Also: the refresh status's "0 MAE/MFE · 0 EMA9" is a
misleading write-delta counter (0 = nothing newly-changed, not 0 coverage) —
relabel it to report coverage during this day's polish.

### Day 6 — Smoke test + cleanup

- Re-import all fixture data (DAS, Webull, real DTSM testers) and click through random days
- Verify metric calculations against hand-calculated expected values for at least one fixture
- Update `v0.3.0-or-later-ideas.md` to clean up stale MFE entry
- Privacy review of any new fixture screenshots
- Documentation update for new Day Detail Modal pattern (component README or storybook)

### Day 7 — Ship

- Version bump to 0.2.2
- Final smoke test
- npm run package:win
- Verify installer artifacts
- GitHub Release draft + publish
- Test auto-updater v0.2.1 → v0.2.2
- DTSM Circle outreach: Tester B ("the day-detail modal you wanted is in v0.2.2"), Tester A, Tester C

---

## Success criteria

v0.2.2 ships successfully when:

1. Clicking any Calendar day opens the Day Detail Modal
2. Calendar surface no longer expands inline (regression-free)
3. All 5 tabs render correctly: Overview, Trades, Chart, Notes, Mistakes
4. Modal stacking (Day → Trade) works cleanly: opens, closes back, preserves state
5. All Overview cards render with correct values for representative fixtures
6. Money Left on Table card matches Deep Analytics → Execution values when day-scoped
7. Notes and Mistakes data persists across launches
8. Intraday chart renders with trade markers for at least one symbol per day
9. All v0.2.1 tests still pass
10. Auto-updater test v0.2.1 → v0.2.2 succeeds
11. Tester B, Tester A, Tester C can use the new modal without confusion in their daily review

If any of these fail at the smoke test, the release is blocked until fixed.

---

## Release-day action items

### Release-notes blurb — superseded 2026-05-28

The original LOCKED copy here described an intraday chart per symbol
that v0.2.2 no longer ships (Chart tab removed in the post-Day-1 spec
update). The blurb was replaced — see "Re-LOCKED release-notes blurb"
in the spec-update addendum below for the new canonical copy.

### Tester B outreach (Circle DM)

Tied to the release, not before. Tester B surfaced the "day-detail as a home" idea on 2026-05-27. Once v0.2.2 ships:

- Send Circle DM letting him know v0.2.2 lands the modal he asked for
- Suggest he try it on his streams as the new review surface
- Ask for feedback after a few sessions (especially: does Money Left card surface anything he didn't notice in Deep Analytics?)

### Tester A outreach (Circle DM)

Tester A loves the Money Left on Table feature in Deep Analytics. The new Day Detail Modal surfaces it more prominently. Worth a heads-up note.

### Tester C outreach (Circle DM)

Webull user, less context on Calendar usage habits. Standard release notice — let him know v0.2.2 is up and the auto-updater will deliver.

---

## After v0.2.2 ships

Next conversations to have:
- v0.2.3 scope (likely: deferred items from this plan — Attachments, additional polish from beta feedback)
- v0.2.5 Challenge/Bucket system planning (this is the big one — major feature, deserves its own planning session)
- v0.3.0 strategic theme decision (was originally foundation work; needs revisit given Challenge moved to v0.2.5)

---

## Day 1 reality reconciliation (added 2026-05-28)

Surveying the codebase before Day 1 surfaced four divergences between this plan and what actually exists. Recording the decisions here so future sessions don't re-litigate them.

### 1. DayDetailModal lives under `src/components/calendar/`

Plan originally said `/src/components/DayDetailModal/`. The existing TradeDetailModal is a single file at `src/components/trades/TradeDetailModal.tsx` (with sibling `ChartTab.tsx` lazy-loaded). For v0.2.2 we adopt a folder layout under the surface that opens the modal:

```
src/components/calendar/
  DayDetailModal/
    index.tsx        # shell, portal, tab strip
    OverviewTab.tsx  # Day 1
    TradesTab.tsx    # Day 2
    ChartTab.tsx     # Day 3
    NotesTab.tsx     # Day 4
    MistakesTab.tsx  # Day 4
```

The folder keeps each tab small (5 tabs would balloon a single file past 600 lines). Lives under `calendar/` because that's the surface that opens it.

### 2. New `/src/data/` layer introduced per ARCHITECTURE.md rule #2

Plan called for `/src/data/dayRepo.ts` + `/src/data/sqlite/dayRepoSqlite.ts`. Reality: no `/src/data/` exists today. Every existing surface keeps its repo at `electron/{surface}/repo.ts` — a known divergence from ARCHITECTURE.md, acknowledged in the CLAUDE.md "honest note."

For v0.2.2 we use the architecture-compliant layout for the NEW code while accepting the legacy layout stays untouched:

```
src/data/dayRepo.ts         # renderer-side typed client (interface + IPC call)
electron/day/repo.ts        # SQLite implementation (matches existing electron/{surface}/repo.ts convention)
electron/day/ipc.ts         # IPC handler that calls electron/day/repo.ts
shared/day-types.ts         # DayDetail + DayMetrics type definitions
shared/ipc-channels.ts      # add DAY_GET_DETAIL
electron/preload/index.ts   # expose window.fugaedge.day.getDetail()
```

The SQLite implementation stays in `electron/` (not `src/data/sqlite/`) because that's where node-only modules actually load in this build setup. `src/data/dayRepo.ts` is the renderer-side facade — when we port to web, it stops calling IPC and starts calling `fetch()`, which matches ARCHITECTURE.md rule #3.

This is the first surface to use `src/data/`. Other surfaces can migrate opportunistically.

### 3. Money Left on Table is a derivation, not a literal port

Plan said "reused from Deep Analytics → Execution tab." Reality: Execution tab renders `data.exitQuality` as a per-trade table (`ExitQualityTable rows={data.exitQuality}`) — not a scalar. There is no existing `moneyLeftOnTable: number` field anywhere.

For v0.2.2 we compute the day-scoped scalar inside `computeDayMetrics()`:

```typescript
moneyLeftOnTable: trades
  .filter(t => t.missedGain != null)
  .reduce((sum, t) => sum + t.missedGain, 0)

moneyLeftCoverage: {
  withMfe: trades.filter(t => t.missedGain != null).length,
  total: trades.length
}
```

Honest disclosure of partial coverage matches Decision 3 above ("(N of M trades — intraday data incomplete)"). If `withMfe === 0`, the card shows the "awaiting intraday data" empty state.

### 4. TDD on the pure module

`src/core/analytics/day.ts` is tested test-first via `src/core/analytics/__tests__/day.test.ts`, mirroring the existing `src/core/performance/__tests__/metrics.test.ts` pattern. The repo, IPC layer, and modal don't need TDD — their correctness is verified by integration smoke and the v0.2.1 test suite still passing.

### Day 1 file inventory (locked)

- `shared/day-types.ts` — new
- `shared/ipc-channels.ts` — add DAY_GET_DETAIL
- `src/core/analytics/day.ts` — new pure module
- `src/core/analytics/__tests__/day.test.ts` — new
- `src/data/dayRepo.ts` — new renderer-side client
- `electron/day/repo.ts` — new SQLite impl
- `electron/day/ipc.ts` — new IPC handler
- `electron/main/index.ts` — register day IPC
- `electron/preload/index.ts` — expose window.fugaedge.day
- `src/components/calendar/DayDetailModal/index.tsx` — modal shell
- `src/components/calendar/DayDetailModal/OverviewTab.tsx` — tab content
- `src/pages/Journal.tsx` (or wherever Calendar lives) — wire day-click to modal, remove DayTradesPanel inline expansion

---

## v0.2.2 spec update — post-Day-1 smoke test (2026-05-28)

Day 1 shipped (commit ac5afe6), then a live smoke test surfaced product-spec
changes that reframe the rest of the build sequence. Day 1's code stays as-is
— its metrics module and modal shell are reusable. The Overview tab gets
rebuilt and a new Performance tab replaces the old Chart tab.

### Tab structure

**Old:** Overview · Trades · Chart · Notes · Mistakes
**New:** Overview · Performance · Trades · Notes · Mistakes

Chart tab removed entirely from v0.2.2. The old Day 3 (Chart tab +
IntradayChart extraction) is dropped; its budget reallocates to the new
Performance work.

### Overview content (rebuilt)

- **Full-width intraday equity curve** at the top: cumulative net P&L
  through the trading day, stepping at each round-trip's `close_time`.
  Implementation: Recharts (already in dependencies — `RunningPnlChart.tsx`
  uses it), not lightweight-charts (which is reserved for the per-symbol
  intraday OHLC).
- **Strip below**: two count-only cards — Trades (W/L/S breakdown) and
  Shares traded. Nothing else.
- The nine perf-flavored cards from Day 1 (Win Rate, R-Multiple, Avg
  Win/Loss, Biggest Win, Worst Loss, Session Window, Most-Used Playbook,
  Symbols Traded, Money Left) **leave Overview** and move to Performance.
  Symbols Traded specifically moves to the Trades tab header (Day 3).

### Performance tab (new)

Dense two-column statistics table, scoped to one day. Reference pattern:
Tradervue's "Detailed" view. Visual structure mirrors `FullStatsTable.tsx`
from Deep Analytics (sections with header chip, label/value rows, optional
hints) so the aesthetic stays consistent across the app.

#### Metric classification (Tradervue universe → day scope)

| Metric | Class | Notes |
|---|---|---|
| Total net / gross P&L | A | Already in `day.ts` |
| Total fees | A | Already |
| Largest gain | A | `biggestWin` moves from Overview |
| Largest loss | A | `worstLoss` moves from Overview |
| Avg winning trade | A | `avgWin` moves |
| Avg losing trade | A | `avgLoss` moves |
| Avg per-share gain/loss | A — new | `netPnl / totalShares` |
| Avg trade gain/loss | A — new | `netPnl / tradeCount` |
| Profit factor | A — new | See convention below |
| Trade P&L std dev | C (conditional) | Show when n≥3 with N coverage; hide otherwise |
| Total trades | A | `tradeCount` |
| # winning / losing / scratch | A | Already |
| Max consecutive wins / losses | A — new | Chronological scan |
| Avg hold time (overall + W/L/S) | A — new | `close_time − open_time` per category |
| Avg position MFE | D | Placeholder, same pattern as Money Left |
| Avg position MAE | D | Same |
| SQN | C — skip | √N factor makes single-day SQN noise; this is a multi-day stat by design |
| K-Ratio | C — skip | Slope/SE over daily equity; day scope = 1 equity point, undefined |
| Probability of random chance | C — skip | Derived from SQN, same problem |
| Total commissions | B — skip | Always null today (DAS Trades.csv has no commission column) |
| Avg daily P&L | B — skip | At day scope equals the day's netPnl |
| Trading days | B — skip | Always 1 at day scope |

**Class definitions:** A = translates cleanly, build it. B = redundant at
single-day scope (collapses to a value Overview already shows or to Total),
skip. C = statistically meaningless at n≈single-day, skip with footer
pointer to Deep Analytics. D = needs intraday data not yet wired, render
"awaiting intraday data" placeholder.

Day-scoped Performance footer text: "Multi-day system-quality stats (SQN,
K-Ratio) live in Deep Analytics → Performance."

#### Profit factor rendering convention (locked)

`profitFactor` returns:
- `number` (finite) — normal case (`Σ positive net_pnl / |Σ negative net_pnl|`)
- `Infinity` — winners exist but no losers (division by zero is a real
  outcome on a winning-only day, not an error)
- `null` — no decided trades (all scratches or empty day)

Render mapping (matches existing `FullStatsTable.tsx` `pf()` helper and
Deep Analytics `OverviewTab.tsx`):
- finite → `n.toFixed(2)`
- `Infinity` → `"∞"`
- `null` → `"—"`

Implementation: a new `formatProfitFactor(n: number | null): string` helper
in `src/lib/format.ts` (alongside `money`, `percent`, `signed`, `duration`).
Day 2 tests it directly with one assertion per output branch, including
explicit `formatProfitFactor(Infinity) === "∞"`. The pure-module
`computeDayMetrics` test asserts the metric value is `Infinity` in the
same scenario.

##### Migration plan for the existing `pf()` helper in `FullStatsTable.tsx`

Day 2 also lands a parity test that asserts, for the three input branches
(finite, `Infinity`, `null`):

```
formatProfitFactor(x) === FullStatsTable.pf(x)
```

If all three assertions pass, `FullStatsTable.tsx` migrates to use
`formatProfitFactor` and the local `pf()` is deleted. If any branch
diverges, `pf()` stays in place and a v0.3.0 cleanup card gets filed in
`docs/plans/v0.3.0-or-later-ideas.md` describing the divergence and the
intended convergence. No silent migration either way.

Rationale for `∞` (not `"—"` or `"100%"`): mathematically accurate (an
unbounded profit factor), consistent with existing FugaEdge surfaces, and
honest — a winning-only day's profit factor is genuinely undefined-as-finite,
not "missing data". Hint text on the row: "No losing trades — profit factor
is undefined."

#### Toggle set: none

Tradervue offers Aggregate-vs-per-trade-avg, Gross/Net, and $/T/R toggles.
v0.2.2 ships with **no toggles**:
- Aggregate vs per-trade: both shown as explicit rows (Total net P&L and
  Avg trade gain/loss are separate rows). No toggle needed.
- Gross / Net: three explicit rows — Total net P&L, Total gross P&L, Total
  fees. Matches existing `FullStatsTable.tsx` convention.
- $ / T / R: hold time stays in `duration()` format. R-multiple is its own
  explicit row (Avg R-multiple). Inline R appendix on Avg winner/loser
  (`+$XX.XX (avg +1.4R)`) only when coverage > 0.

Rationale: dense single-table aesthetic matches the Tradervue Detailed
reference; toggles fragment information and add interaction cost. Brand
voice is "honest disclosure > clever toggles."

### Modal width

`max-w-[980px]` → `max-w-[1400px]`. Performance tab's two-column statistics
layout needs the horizontal real estate, and the equity curve on Overview
breathes at the wider width.

### `day.ts` additions

New pure functions added to `computeDayMetrics` (TDD-style, all in
`src/core/analytics/__tests__/day.test.ts`):

- `avgTradePnl`, `avgPerShareGainLoss`
- `profitFactor` (returns `number | null`, with `Infinity` for no-losers
  case — see convention above)
- `maxConsecutiveWins`, `maxConsecutiveLosses`
- `avgHoldSeconds`, `avgHoldSecondsWinners`, `avgHoldSecondsLosers`,
  `avgHoldSecondsScratches`
- `stdDevPnl` (sample std dev, n−1 denominator; `null` when `tradeCount < 3`)
- `avgMfeDollars`, `avgMaeDollars` — ship as nullable fields on `DayMetrics`,
  consistent with `moneyLeftOnTable`'s pattern. **Day 2 tests must assert
  these are `null` for all fixtures** (intraday wiring lands in Day 5; until
  then the contract is "field exists, value is null"). The render layer
  shows the "awaiting intraday data" placeholder.

`DayMetrics` interface gets these new nullable fields appended. No existing
field changes (winRate stays a 0..1 ratio, etc.).

Expected new test count: ~11 tests (9 for new metrics + 2 for MFE/MAE null
behavior), bringing the file from 9 → ~20 tests.

### Build sequence (renumbered)

| Day | Scope | Status |
|---|---|---|
| 1 | Shell + (legacy) Overview tab + day metrics module | **Shipped (ac5afe6)** |
| 2 | **Overview redesign + Performance tab + new metrics + modal width + `pf()` parity migration** | NEW |
| 3 | Trades tab + modal stacking (was Day 2) | Renumbered |
| ~~3~~ | ~~Chart tab + IntradayChart extraction~~ | **Removed** |
| 4 | Notes + Mistakes tabs | Unchanged |
| 5 | Edge cases + polish + intraday wiring for MFE/MAE/Money Left | Expanded |
| 6 | Smoke test + cleanup | Unchanged |
| 7 | Ship | Unchanged |

Net day count: 7 days total, unchanged from the original plan. Chart's
removal exactly funds Day 2's redesign. Day 5 absorbs the intraday wiring
that turns the MFE/MAE/Money Left placeholders into real values.

### Updated success criteria

The original Success Criteria list needs two changes:

- **Drop criterion 8** ("Intraday chart renders with trade markers for at
  least one symbol per day") — Chart tab removed.
- **Replace with new criterion 8:** "Performance tab renders every
  class-A metric with correct values on representative fixtures, including
  the no-losers profit-factor case (renders ∞), the n<3 std-dev case
  (renders —), and the awaiting-intraday MFE/MAE/Money Left placeholders
  (until Day 5 wiring lands)."

Criteria 1–7 and 9–11 stay as written.

---

## Re-LOCKED release-notes blurb (2026-05-28)

Replaces the original LOCKED blurb (marked superseded above). The original
described an intraday chart per symbol that v0.2.2 no longer ships.

Paste verbatim into the v0.2.2 GitHub release notes under the "Highlights"
section. Refine on Day 7 only if a beta-tester conversation surfaces a
factual gap.

> **Day Detail Modal.** Click any day on the Calendar and a new overlay
> opens with everything you need to review that day — an intraday equity
> curve, your W/L/S split, a dense Performance table (profit factor, avg
> winner vs avg loser, max consecutive streaks, hold time per outcome,
> Money Left on Table, and more), the full trade list, day-level notes,
> and day-level mistake patterns. Click any trade to drill into the Trade
> Detail Modal you already know. Same UX pattern, scoped to one day.

Wording was reviewed and approved 2026-05-28.

---

## Day 4.5 — Weekly Review modal (tabbed, mirrors Day Detail) — added end of Day 4

New scope, accepted eyes-open: replace the single-panel Weekly Review modal
with a full tabbed modal mirroring the Day Detail modal, scoped to a week.
This is a multi-day arc; **Ship slides** (see revised sequence below). A week
is NOT just a big day — the tabs are week-shaped (best/worst DAY, day-by-day,
per-playbook, symbol-grouped trades).

### Reuse strategy — refactor-first (extract shared, then build on it)

Copy-then-dedup drifts; two parallel modals would re-grow the Escape/z-order
bug class we already fixed twice. So we **refactor Day Detail behavior-
preserving to extract shared primitives FIRST**, then build the week tabs on
top. Three primitives extracted from the current Day Detail:

1. **`DetailModalShell`** — portal + backdrop + tab strip + content switch +
   z-110 chrome. `headerRight` is a slot (Day = gross/fees/net trio; Week =
   net/win-rate/best-day). Takes `escapeBlocked` so stacking can suppress the
   shell's own Escape-close.
2. **`useTradeStack({ reload })`** — owns `selectedTradeId`, the Escape guard,
   the 10 trade-save handlers + reload, and renders the stacked
   `TradeDetailModal` (`stacked` → z-210). Both modals share ONE stacking
   implementation — the anti-drift core of this arc.
3. **`CumulativePnlChart`** (generalized `IntradayPnLChart`) — the curve-build
   (prorate net_pnl across closing fills, sort by time, accumulate) is already
   date-agnostic; add an X-axis label mode (`'time'` for day, `'datetime'` /
   weekday for week) + per-point date in the tooltip.
4. **`NotesTab`** generalized to `{ initialValue, onSave }` — Day →
   `saveDayNote`; Week → existing `weekNotesSave`. Debounce + flush identical.

Per-Day-Detail-piece verdict: shell → extract; stacking → extract hook;
equity curve → reuse + label mode; NotesTab → generalize; OverviewTab /
PerformanceTab / TradesTab → **rebuild week-specific** (different content) on
the shared spine; MistakesTab → reuse the per-trade rollup card, drop the
day-level picker (week has no week-level mistake picker).

### Data layer (ARCHITECTURE.md-compliant)

- **`src/core/analytics/week.ts` — pure `computeWeekMetrics(trades, weekStart,
  weekEnd, dailyPnl?)`** (mirrors `day.ts`, TDD). Reuses day conventions for
  net/counts/winRate/profitFactor/symbolBreakdown/mistakeTagCounts over week
  trades, plus week-new: `dayByDay[]`, `bestDay`/`worstDay`, `perPlaybook[]`,
  consistency (% green days, day-P&L std dev, largest swing), `streak`.
- `shared/week-types.ts` — `WeekDetail` + `WeekMetrics`.
- `electron/trades/list.ts` — add `listTradesInRange(from, to)` (one
  `WHERE date BETWEEN` query; full `TradeListRow`). Replaces the current
  modal's 7-parallel `tradesList` fetch.
- `electron/week/repo.ts` — `getWeekDetail(weekStart)`: range-fetch + read
  `week_notes` + feed `computeWeekMetrics`. Thin IPC handler (`electron/week/ipc.ts`),
  no inline SQL. `src/data/weekRepo.ts` renderer client.
- **Reuse:** `week_notes` table + `weekNotesSave` IPC (Notes tab) as-is;
  port `computeStreak` into core; the existing `WeeklySummary`/`computeOne`
  grid path is NOT touched (see drift note).

### Tab content (week-scoped)

- **Overview** — week equity curve (`CumulativePnlChart`, multi-day) + summary
  (net, win rate, best/worst DAY, streak).
- **Performance** — day-by-day P&L (which days win/lose), per-playbook across
  the week, consistency metrics. The pattern-spotting tab.
- **Trades** — symbol-grouped, collapsed-by-default (the scalability spec from
  the Weekly Review parking-lot entry; Tester A does 37+/week — a flat list is the
  trade-dump we're killing). Row → stacked `TradeDetailModal` via `useTradeStack`.
- **Mistakes** — per-trade mistake rollup across the week (same disjoint
  per-trade data path verified in Day 4.2; no week-level picker).
- **Notes** — the weekly reflection box (existing `week_notes`), via the
  generalized `NotesTab`.

### Build arc (4 sub-days, each checkpoint + commit)

- **Day 4.5a — Extract shared primitives (refactor only, no new features).**
  `DetailModalShell` + `useTradeStack` + generalized `CumulativePnlChart` /
  `NotesTab`; Day Detail rewired to use them. **Checkpoint: prove Day Detail
  behavior byte-for-byte identical** (all 5 tabs, stacking, Escape, notes).
  Kept SEPARATE so a regression is isolated to the refactor, not mixed with
  new week code.
- **Day 4.5b — Week data layer + Week Overview.** week-types, `week.ts` (TDD),
  `listTradesInRange`, `electron/week` repo+IPC, `weekRepo`. New `WeekReviewModal`
  on the shared shell, Overview tab only. Wire Calendar `onSelectWeek`.
- **Day 4.5c — Week Performance.** Day-by-day + per-playbook + consistency
  (extends `computeWeekMetrics`, more TDD).
- **Day 4.5d — Week Trades + Mistakes + Notes; retire old modal.** Symbol-
  grouped Trades (reusing `useTradeStack`), Mistakes rollup, Notes via the
  generalized component. Delete the old `WeeklyReviewModal`. Checkpoint
  includes a Day Detail regression pass.

### Revised build sequence + Ship date

| Day | Scope | Status |
|---|---|---|
| 1–4 | Day Detail Modal (shell → 5 tabs) | **Shipped** |
| 4.5a–d | **Weekly Review modal (this arc, ~4 working days)** | NEW |
| 5 | Edge cases + polish (± intraday MFE/MAE/Money-Left wiring) | pending |
| 5.5 | Intraday wiring, IF it slides out of Day 5 (open decision) | conditional |
| 6 | Smoke test + cleanup | pending |
| 7 | Ship | pending |

**Honest Ship: ~Day 11** (Weekly arc adds ~4 days to the original Day-7 ship),
or **~Day 12 if intraday slides to Day 5.5** (that decision is still open from
end of Day 4). Formalize the exact number once the intraday Day-5 call is made.

### Drift note — week aggregation runs in two places (logged for v0.3.0)

`computeWeekMetrics` (new, pure core, rich, per-week) and the existing
`getWeeklySummaries`/`computeOne` (electron, lightweight, 6-weeks-at-once for
the calendar grid) will both compute week aggregates. We deliberately do NOT
unify them now — they serve different surfaces. Logged as a v0.3.0
consolidation item in `docs/plans/v0.3.0-or-later-ideas.md` so they're on
record as parallel paths and don't silently diverge.

### LOCKED release-notes blurb — needs another pass

The re-LOCKED blurb above describes only the Day Detail Modal. It does NOT
mention the Weekly Review modal. Re-draft + re-LOCK the blurb to cover both
surfaces before Ship — do not silently edit; replace the block as before.
