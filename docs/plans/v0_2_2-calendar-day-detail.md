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

### Release-notes blurb — copy LOCKED (do not reword without review)

Paste this verbatim into the v0.2.2 GitHub release notes under the
"Highlights" section. Refine on the day if needed.

> **Day Detail Modal.** Click any day on the Calendar and a new overlay
> opens with everything you need to review that day — P&L summary,
> key metrics including Money Left on Table, the full trade list,
> intraday chart per symbol with your entry/exit markers, day-level
> notes, and day-level mistake patterns. Click any trade in the list
> to drill into the existing Trade Detail Modal. Same UX pattern as
> the Trade Detail Modal you already know, scoped to one day.

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
