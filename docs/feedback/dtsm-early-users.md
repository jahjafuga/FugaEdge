\## 2026-05-15 — First public testing day



\### Users who tried FugaEdge today



\*\*User 1: Dave (DTSM, DAS Trader)\*\*

\- Tried v0.1.6 with execution-level CSV

\- Hit "format not recognized" error

\- Status: messaged with v0.2.0 timeline, fix coming

\- Permission for test fixture: pending



\*\*User 2: Brendan Hogan (DTSM founder, DAS Trader)\*\*

\- Asked for installer link directly

\- Same execution-level CSV blocker

\- Successfully walked through DAS Account Report export with guidance

\- Confirmed ECN rebates (negative fees) in his data

\- Account: HOGEDG, \~$100K, BP $35K

\- Trades AUUD, SKYQ, TMDE, SLE, MEMX in pre-market

\- Status: actively testing, dual-file workflow validated

\- Permission for test fixture: pending



\*\*User 3: Webull user (DTSM connection unknown)\*\*

\- Sent two files: mobile CSV + desktop XLSX

\- Both Webull formats, neither supported in v0.1.6

\- Trades AIIO, AUUD, XRTX, ARTL, MYSE, ALGS

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

\- AUUD, SKYQ, TMDE, SLE, MEMX (Brendan)

\- AIIO, AUUD, XRTX, ARTL, MYSE, ALGS (Webull user)

\- ODYS, MOBX (Lao)



AUUD appears across multiple users — likely a runner this period.



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



User 1 (Brendan, DTSM founder):

\- Successfully imported full day of trades using dual-file workflow

\- Confirmed dedup works on incremental re-import (morning -> full day)

\- Discovered API key onboarding gap (FugaEdge needs Polygon key, his was empty)

\- Suggested migration importers from Tradervue/Edgewonk as v0.3.0 focus

\- Strategic shift: now positioning as "co-architect" not "early user"



User 4 (Dave, DTSM, DAS Trader):

\- Sent raw TradeHistory CSV format - completely new format for FugaEdge

\- Columns: Date, Time, Symbol, Side, Quantity, Price, P\&L

\- 188 fills across 10 trading days, multiple symbols

\- Format appears to be from generic broker export (not DAS, not Webull)

\- Has manually been adding date column to other CSV exports as workaround

\- Test fixture and 4 follow-up questions sent



\### Real bugs confirmed by user testing



1\. Float auto-fetch does NOT fire on dual-file imports (confirmed on Lao's 

&#x20;  own data, not just Brendan's)

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

\- DAS Account Window export (Brendan) - WORKS in v0.1.6

\- DAS Executed Orders window (Dave's previous workflow) - similar to Trades

\- Webull Mobile CSV - BLOCKED, Day 4

\- Webull Desktop XLSX - BLOCKED, Day 5

\- Generic TradeHistory CSV (Dave's new file, Date/Time/Symbol/Side/Qty/Price/P\&L) - BLOCKED, NEW DAY ADDITION



4 active users testing FugaEdge, multiple format variants surfaced. 

Universal import is the right strategy.



\### Strategic shifts



1\. v0.2.0 scope expanded by \~1 day to accommodate Dave's TradeHistory format

2\. v0.3.0 explicitly framed as "switching from competitor journals" release 

&#x20;  (Brendan's migration insight)

3\. API key onboarding identified as critical for new user activation - 

&#x20;  every new user will hit this wall without my-key already configured

4\. v0.2.0 ship date: still \~5-6 days out, no panic, Brendan using v0.1.6 daily



\### Commits today



\- docs: add UI consistency items to v0.2.0 Day 8 polish

\- docs: add API key onboarding UX to Day 7 (Brendan testing 2026-05-16)

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

\- Add Dave's TradeHistory parser to Day 5 or 6 of plan

\- Wait for Dave's responses to 4 follow-up questions

\- Watch for Webull user response to my message from yesterday

