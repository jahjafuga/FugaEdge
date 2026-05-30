> **Anonymization note.** Beta-tester identities are coded: **Tester A** and **Tester B** are DAS Trader participants, **Tester C** is a Webull participant. Real names, account names/numbers, balances, and traded symbols have been removed.

\## 2026-05-15 — First public testing day



\### Users who tried FugaEdge today



\*\*User 1: Tester A (DTSM, DAS Trader)\*\*

\- Tried v0.1.6 with execution-level CSV

\- Hit "format not recognized" error

\- Status: messaged with v0.2.0 timeline, fix coming

\- Permission for test fixture: pending



\*\*User 2: Tester B (DAS Trader)\*\*

\- Asked for installer link directly

\- Same execution-level CSV blocker

\- Successfully walked through DAS Account Report export with guidance

\- Confirmed ECN rebates (negative fees) in his data

\- Account: ACCOUNT_A

\- Trades pre-market momentum names

\- Status: actively testing, dual-file workflow validated

\- Permission for test fixture: pending



\*\*User 3: Webull user (DTSM connection unknown)\*\*

\- Sent two files: mobile CSV + desktop XLSX

\- Both Webull formats, neither supported in v0.1.6

\- Trades pre-market momentum names

\- Has both cash account and paper trading account

\- Status: messaged with v0.2.0 timeline, 4 questions pending

\- Permission for test fixture: pending



\### Key discoveries from today



1\. Most DAS users export execution-level CSV, not summary

2\. DAS Account Report (separate file) contains all fee data

3\. ECN fees can be negative (rebates for adding liquidity)

4\. Webull is a significant user segment, two distinct formats

5\. Float auto-fetch only fires on summary import path (bug)

6\. Country detection requires manual entry for new tickers

7\. Light/dark mode bug on Trades cards (separate issue)



\### Decisions made



\- v0.1.7 is canceled, all work rolled into v0.2.0

\- v0.2.0 becomes "Universal Import" release

\- Timeline: 10-14 days

\- Plan locked in docs/plans/v0.2.0-universal-import.md



\### Tickers being traded by DTSM in May 2026



For marketing/positioning intel:

\- pre-market momentum names (Tester B)

\- pre-market momentum names (Webull user)

\- ODYS, MOBX (Lao)



One name appeared across multiple users — likely a runner this period.



\## 2026-05-16 — Day 1 of v0.2.0 shipped + 4th user surfaces



\### What got built today



v0.2.0 Day 1 (Universal Data Model Foundation) completed and 

committed to feature/v0.2.0-universal-import branch.



Built:

\- Universal Execution and RoundTrip types

\- Broker-agnostic round trip builder at /src/core/import/build-round-trips.ts

\- DAS parser refactor (now emits universal Execution\[] with source\_broker, 

&#x20; source\_format, source\_file fields)

\- Database schema migration with pre-migration auto-backup

\- Dual-write executions table alongside existing executions\_json

\- 86 baseline tests -> 115 tests passing (29 new tests, target was 95+)

\- Hash compatibility mathematically proven (Decision D works on real data)



Verified through 7 incremental smoke tests during the day. v0.1.6 

behavior is bit-for-bit preserved.



\### Architectural decisions locked



8 decisions made and documented in commit message:

\- A: No Account Report parser yet (Day 3)

\- B: Daily summary parser stays fee-only

\- C: Keep existing field/column names (no churn)

\- D: account\_name in exec\_hash only when non-empty (preserves dedup on upgrade)

\- E: Open positions persist with is\_open=1 (no behavior change)

\- F: Universal types live in /shared/import-types.ts

\- G: Dual-write executions table

\- H: Auto-backup before schema migration



\### Real user testing today



User 1 (Tester B):

\- Successfully imported full day of trades using dual-file workflow

\- Confirmed dedup works on incremental re-import (morning -> full day)

\- Discovered API key onboarding gap (FugaEdge needs Polygon key, his was empty)

\- Suggested migration importers from Tradervue/Edgewonk as v0.3.0 focus

\- Strategic shift: now positioning as "co-architect" not "early user"



User 4 (Tester A, DTSM, DAS Trader):

\- Sent raw TradeHistory CSV format - completely new format for FugaEdge

\- Columns: Date, Time, Symbol, Side, Quantity, Price, P\&L

\- 188 fills across 10 trading days, multiple symbols

\- Format appears to be from generic broker export (not DAS, not Webull)

\- Has manually been adding date column to other CSV exports as workaround

\- Test fixture and 4 follow-up questions sent



\### Real bugs confirmed by user testing



1\. Float auto-fetch does NOT fire on dual-file imports (confirmed on Lao's 

&#x20;  own data, not just Tester B's)

2\. Float manual entry rounds 1.47M -> 1.5M incorrectly (should be 2-decimal)

3\. Version display hardcoded "V0.1.0" at src/components/layout/Sidebar.tsx:197

4\. API key onboarding UX: empty key field with no first-time prompt

5\. Vitest exit shows V8 FATAL ERROR (cosmetic, tests still pass)



All added to v0.2.0 plan doc for Day 6/7/8 work.



\### New format discoveries



Today's testing revealed FugaEdge needs to support these formats:

\- DAS Trades.csv (execution-format) - WORKS in v0.1.6 with companion fee file

\- DAS Account Report (fees) - WORKS in v0.1.6

\- DAS Daily Summary - WORKS in v0.1.6 (single-file)

\- DAS Account Window export (Tester B) - WORKS in v0.1.6

\- DAS Executed Orders window (Tester A's previous workflow) - similar to Trades

\- Webull Mobile CSV - BLOCKED, Day 4

\- Webull Desktop XLSX - BLOCKED, Day 5

\- Generic TradeHistory CSV (Tester A's new file, Date/Time/Symbol/Side/Qty/Price/P\&L) - BLOCKED, NEW DAY ADDITION



4 active users testing FugaEdge, multiple format variants surfaced. 

Universal import is the right strategy.



\### Strategic shifts



1\. v0.2.0 scope expanded by \~1 day to accommodate Tester A's TradeHistory format

2\. v0.3.0 explicitly framed as "switching from competitor journals" release 

&#x20;  (Tester B's migration insight)

3\. API key onboarding identified as critical for new user activation - 

&#x20;  every new user will hit this wall without my-key already configured

4\. v0.2.0 ship date: still \~5-6 days out, no panic, Tester B using v0.1.6 daily



\### Commits today



\- docs: add UI consistency items to v0.2.0 Day 8 polish

\- docs: add API key onboarding UX to Day 7 (Tester B testing 2026-05-16)

\- feat(v0.2.0): universal data model + round trip builder (Day 1)



All on feature/v0.2.0-universal-import branch.



\### Tomorrow



Day 2: DAS execution-CSV refinements

\- Single-file execution import (with friendly warning about missing fees)

\- Better error messages

\- Test fixture integration from real user files

\- Maybe begin format auto-detection scaffolding



Plus queued reminders:

\- Create /docs/plans/v0.3.0-or-later-ideas.md

\- Add Tester A's TradeHistory parser to Day 5 or 6 of plan

\- Wait for Tester A's responses to 4 follow-up questions

\- Watch for Webull user response to my message from yesterday



\## 2026-05-16 — Day 2 of v0.2.0 shipped (3 parsers landed in one session)



\### What got built today



Day 2 closed with three new parsers covering every DAS execution-level
variant the DTSM cohort has surfaced. Committed as three separate
commits on feature/v0.2.0-universal-import for a clean architectural
log (Track A → B → C). Each commit's snapshot typechecks in isolation.



Track A — `parse-tradehistory.ts` (commit 5ad11c8):

\- New parser for Tester A-shape DAS export: Date,Time,Symbol,Side,
&#x20;  Quantity,Price,P\&L

\- Synthesizes deterministic per-fill IDs: `th-<sha1[0..12]>`
&#x20;  (date|time|symbol|side|qty|price)

\- Broker P\&L captured into new optional Execution.broker\_pnl field

\- 26 new tests (115 → 141)



Track B — single-file import + refinements (commit 2bfcbc3):

\- DAS Trades.csv can now import standalone (no companion fee file
&#x20;  required). Gold "Fees not included" banner suggests dropping the
&#x20;  Account Report alongside; commit button stays enabled

\- Bare HH:MM:SS time fallback in parse-executions.ts uses filename
&#x20;  date (new MM-DD-YYYY pattern added to parse-filename.ts).
&#x20;  Requires 4-digit year so "05-15-26" stays ambiguous

\- Dateless-execution guardrail: no date in time AND no date in
&#x20;  filename → top-level "rename the file" warning, no silent drop

\- Opportunistic P/L or P\&L column capture on parse-executions.ts
&#x20;  (DAS exports vary on whether this column is included)

\- route + broker\_pnl threaded into RoundTripExecution so they
&#x20;  persist via executions\_json with no DB migration

\- exec\_hash invariance proven: bare and rich builds of identical
&#x20;  fills produce the same hash (verified by test)

\- 23 new tests (141 → 164)



Track C — `parse-trades-window.ts` (commit a002eaa):

\- New parser for Tester B-shape DAS export: Time,Symbol,Side,Price,
&#x20;  Qty,Route,LiqType,Broker,Account,Type,Cloid

\- Caught during Day 2 audit when Tester B supplied his real file
&#x20;  earlier — turned out to be a THIRD distinct DAS export shape, not
&#x20;  the same as the existing TradeID-led path

\- Cloid is per-ORDER (partial fills share it) → used as order\_id

\- Per-fill trade\_id synthesized as `tw-<sha1[0..12]>` (same payload
&#x20;  formula as Track A)

\- Account column populated into both legacy `account` AND universal
&#x20;  `account_name` (Tester B-shape is v0.2.0-only, no v0.1.6 dedup
&#x20;  compat concern)

\- liq\_type, broker\_code, order\_type captured as supplementary
&#x20;  metadata on Execution

\- Bare time + filename rescue reuses Track B's guardrail path

\- 26 new tests (164 → 190, target was 175+)



\### Architectural decisions locked in Day 2



1\. broker\_pnl is reference-only data — FugaEdge always recomputes
&#x20;  its own gross/net P\&L from buy/sell pricing

2\. route + broker\_pnl persist via executions\_json (no DB migration);
&#x20;  Day 8 wires them to the Trade Detail Modal

3\. exec\_hash IGNORES route and broker\_pnl (identity invariance proven
&#x20;  by test)

4\. Dedup fires at exec\_hash (trip) level only. Per-execution rows in
&#x20;  the executions table get inserted via cascade when the parent trip
&#x20;  insert succeeds. No separate per-row uniqueness constraint —
&#x20;  protection cascades from trips. Important contract for downstream
&#x20;  code that touches the executions table directly

5\. Dateless-execution path blocks with a clear "rename the file"
&#x20;  message rather than firing a modal. Date-picker modal for executions
&#x20;  is reserved for Day 9 in-app guide work

6\. account\_name population differs by format:

&#x20;  \- parse-executions.ts: NOT populated (Decision D — v0.1.6 hash compat)

&#x20;  \- parse-trades-window.ts: IS populated (v0.2.0-only format)

7\. trade\_id synth scheme is consistent across new parsers: 12-hex of
&#x20;  sha1 over (date|time|symbol|side|qty|price) — different prefix per
&#x20;  format (`th-`, `tw-`) for traceability

8\. broker\_code (Tester B's "Broker" column) is distinct from
&#x20;  source\_broker. source\_broker = originating platform ("DAS");
&#x20;  broker\_code = executing-broker tag (ARCX, CROX). Different fields,
&#x20;  both captured

9\. liq\_type stays a raw string (DAS RR/X/99/RBD codes) rather than
&#x20;  forcing the universal ADDED/REMOVED mapping. Capture now,
&#x20;  normalize later when the translation table exists



\### Smoke test results (6/6 PASSED, user-verified)



1\. Tester A CSV regression: 188 fills / 65 trips / all DUP on re-drop ✅

2\. `tester-b_trades_2026-04-02.csv` (ISO): 95 exec / 13 trips / 13 NEW
&#x20;  / ISO filename rescue → 2026-04-02 ✅

3\. `04-02-2026.csv` (MM-DD-YYYY): 95 exec / 13 trips / 13 NEW /
&#x20;  MM-DD-YYYY rescue → 2026-04-02 (imported to DB) ✅

4\. `random-export.csv`: dateless guardrail fired, "Nothing new to
&#x20;  import" disabled state, actionable warning copy ✅

5\. `Tester B Trades Example.csv` (no date in name): same guardrail
&#x20;  fired identically (consistent message across filename shapes) ✅

6\. Re-drop of `tester-b_trades_2026-04-02.csv` after Scenario 3 wrote
&#x20;  under `04-02-2026.csv`: 0 NEW / 13 DUPLICATE — synth IDs are
&#x20;  content-based and survive filename drift when the derived date
&#x20;  matches ✅



\### Known cosmetic issues deferred to Day 8 polish



\- UNKNOWN format pill in ImportSummary should map 'tradehistory' and
&#x20;  'trades\_window' to friendly labels (currently shows "unknown")

\- "Saving to database…" UI lacks completion feedback

\- PreviewTable.tsx:48 React key warning (pre-existing)



\### Test count summary



\- Baseline (post Day 1): 115

\- After Track A: 141 (+26)

\- After Track B: 164 (+23)

\- After Track C: 190 (+26)

\- Net for Day 2: +75



\### Commits today



\- 5ad11c8 feat(v0.2.0): TradeHistory parser for Tester A-shape DAS
&#x20;  export (Day 2 Track A)

\- 2bfcbc3 feat(v0.2.0): single-file Trades.csv + bare-time guardrail
&#x20;  + filename pattern (Day 2 Track B)

\- a002eaa feat(v0.2.0): TradesWindow parser for Tester B-shape DAS
&#x20;  export (Day 2 Track C)



All on feature/v0.2.0-universal-import, pushed to origin.



\### Test fixtures (all gitignored)



\- test-fixtures/dtsm-tester-a-das-executed-orders-may-2026.csv (Track A
&#x20;  real-fixture coverage)

\- test-fixtures/Tester B Trades Example.csv (Track C real-fixture
&#x20;  coverage, generic-invariant assertions only — no ACCOUNT_A or other
&#x20;  identifying strings)

\- test-fixtures/tester-b\_trades\_2026-04-02.csv (ISO rename for
&#x20;  smoke-test filename-rescue scenario)

\- test-fixtures/04-02-2026.csv (MM-DD-YYYY rename for smoke-test)

\- test-fixtures/random-export.csv (no-date rename for guardrail
&#x20;  scenario)



\### Tomorrow



Day 3 candidates per the plan:

\- Account Report parser (DAS fee file)

\- Fee matching by (date, symbol) with proportional allocation for
&#x20;  multi-roundtrip days

\- Support negative ECN fees (Tester B's confirmed data)

\- Day 4 (Webull Mobile CSV) is still queued for after

