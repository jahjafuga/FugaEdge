\## 2026-05-15 — First public testing day



\### Users who tried FugaEdge today



\*\*User 1: Tester A (DTSM, DAS Trader)\*\*

\- Tried v0.1.6 with execution-level CSV

\- Hit "format not recognized" error

\- Status: messaged with v0.2.0 timeline, fix coming

\- Permission for test fixture: pending



\*\*User 2: Tester B Hogan (DTSM founder, DAS Trader)\*\*

\- Asked for installer link directly

\- Same execution-level CSV blocker

\- Successfully walked through DAS Account Report export with guidance

\- Confirmed ECN rebates (negative fees) in his data

\- Account: ACCOUNT_A, \[redacted], BP [redacted]

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

\- AUUD, SKYQ, TMDE, SLE, MEMX (Tester B)

\- AIIO, AUUD, XRTX, ARTL, MYSE, ALGS (Webull user)

\- ODYS, MOBX (Lao)



AUUD appears across multiple users — likely a runner this period.

