# Product Marketing Context

*Last updated: 2026-05-17*

## Product Overview

**One-liner:** A local-first Windows desktop trading journal built for small-cap momentum day traders.
**What it does:** FugaEdge imports your DAS Trader executions v0.2.0 (Lightspeed + Webull CSV import V2) in active development, reconstructs your trades, and surfaces the patterns behind your edge - sentiment, catalysts, playbook adherence, time-of-day, and period-over-period performance. All data stays on your machine. No cloud, no account required.
**Product category:** Trading journal / trade analytics software.
**Product type:** Open-source desktop application (Electron, Windows). Currently v0.1.6.
**Business model:** Freemium. Free tier forever covers everything shipped today plus everything in v0.2.0. A Pro tier is planned for v0.4.0+ and will add a mobile companion, cloud sync, Video Analyst, AI features, multi-account support, and broker integrations.

## Target Audience

**Target customer:** Solo retail day traders running a Ross Cameron-style small-cap momentum strategy. Not institutional, not swing-focused, not options-primary.
**Decision-maker:** The trader themselves — same person who uses, buys, and judges results.
**Primary use case:** Journal every trade, review the day honestly, identify what's working and what isn't, and enforce playbook discipline over time.
**Jobs to be done:**

* Help me see whether I actually have an edge, broken down by setup, time of day, catalyst, and emotional state.
* Hold me accountable to my playbook so I stop taking trades I know I shouldn't.
* Give me a clean, fast review ritual after the close without exporting CSVs into a spreadsheet.

**Use cases:**

* Post-market review: import the day's DAS executions, tag sentiment and catalyst, write the journal entry.
* Weekly/monthly review: use EDGE INSIGHTS, Compare Periods, and Calendar Compare to spot drift.
* Playbook discipline: log A+/B/C setups and check adherence over time.
* Psychology work: rate emotional state 1–5 per trade, correlate to outcomes (Mark Douglas "Trading in the Zone" framework).

## Personas

Solo trader = user, champion, decision-maker, and financial buyer in one. No multi-stakeholder buying loop. Persona table omitted intentionally — see Target Audience above.

## Problems \& Pain Points

**Core problem:** Momentum day traders need brutally honest feedback loops to survive, but every existing journal is a generic web app built for any-strategy-any-broker traders. Most end up in spreadsheets or skip journaling entirely.
**Why alternatives fall short:**

* They're web-only SaaS — your full trading history lives on someone else's server.
* They're generic — built to serve options traders, swing traders, futures traders, and day traders with one set of fields. Nothing momentum-specific (catalyst tagging, float, news, sentiment).
* They're priced like enterprise software ($30–$80/mo) when the trader is one person paying out of P\&L.
* They were built by software companies, not by traders who run the same playbook the user is trying to journal.
**What it costs them:** Repeating the same mistake for months without seeing it. Sizing into setups that have negative expectancy. Tilting after losses because there's no structured review. Paying a recurring SaaS fee on top of broker, data, scanner, and platform costs.
**Emotional tension:** Trading is already isolating and self-judging. A bad journal makes it worse — either too clinical to surface psychology, or too vague to be actionable. Traders want a tool that respects how hard the work is.

## Competitive Landscape

**Direct:** Tradervue, TraderSync, TradeZella, Edgewonk, Chartlog — all web-only SaaS. Fall short because they're generic across strategies, cloud-only, subscription-priced, and not built by momentum traders.
**Secondary:** Spreadsheets (Excel, Google Sheets, Notion templates) — what most traders fall back to. Falls short because there's no analytics layer, no automated import, and review fatigue kills the habit within weeks.
**Indirect:** Skipping journaling entirely / relying on broker P\&L reports / mental review. Falls short because there's no longitudinal pattern detection — the trader keeps repeating the same setup mistake unknowingly.

## Differentiation

**Key differentiators:**

* **Desktop-first, local-first.** Data stays on your machine. No cloud upload of your full trading history.
* **Momentum-specific.** Catalyst tracking, sentiment ratings, playbook discipline — designed for the small-cap momentum playbook, not retrofitted onto it.
* **Built by a trader who runs the playbook.** Not a generic SaaS team shipping features by survey.
* **Open source.** The code is auditable. The trader can verify what happens to their data.
* **Honest free tier.** Everything shipped today, plus everything in v0.2.0, stays free forever. Pro is for features that genuinely require infrastructure (cloud sync, mobile, AI).
* **Mark Douglas psychology baked in.** Sentiment ratings (1–5), catalyst tagging, and playbook adherence are first-class — not bolted on.

**How we do it differently:** A native Windows app instead of a browser tab. Polygon integration for market data. CSV import that understands DAS Trader's quirks. EDGE INSIGHTS that compares periods and calendar windows so the trader can see *when* their edge changed, not just *that* it changed.
**Why that's better:** Faster, more private, more honest. The journal lives where the platform lives (desktop) and respects that this is the trader's data, not the vendor's growth funnel.
**Why customers choose us:** Because it's the journal the trader would have built for themselves if they had time — and someone did.

## Objections

|Objection|Response|
|-|-|
|"Why not just use Tradervue/TraderSync/TradeZella?"|Those are generic web apps. FugaEdge is desktop, local-first, and built specifically around the momentum playbook — catalyst, sentiment, and playbook discipline are first-class, not optional fields.|
|"It's v0.1.6 / pre-launch — why trust it with my journal?"|The app is open source and the free tier is permanent. Your data is local CSV-derived state on your machine — nothing is locked behind a vendor. You can leave at any time and your data goes with you.|
|"Windows-only? I'm on Mac."|Today, yes. Windows-first because DAS Trader runs on Windows and that's where the target user already is. Mac support will follow when the user base demands it.|

**Anti-persona:**

* Options-primary traders. Swing traders. Futures-primary traders. Institutional traders.
* Mac/Linux users (today).
* Traders who don't use DAS, Lightspeed, or Webull (until more import paths land).
* People who want a coach, a Discord, or a signal service — FugaEdge is a tool, not a community.

## Switching Dynamics

**Push:** Generic SaaS journals don't capture catalysts or sentiment in a useful way. Subscription fatigue. Discomfort uploading a full trading history to a third party. Spreadsheets that decay after two weeks of discipline.
**Pull:** A journal that already speaks the user's language — small-cap, catalyst, float, A+ setup, playbook, sentiment. Data stays local. Free tier is honest. Built by someone running the same playbook.
**Habit:** Whatever they're doing now (Tradervue tab, Excel, nothing) is the path of least resistance after the close. Changing journals mid-year feels like losing continuity.
**Anxiety:** "Will my old data import?" "Is this going to be abandoned?" "Is the free tier going to get rugpulled?" "Is a one-person project going to keep up?"

## Customer Language

**How they describe the problem:** *(TBD — capture verbatim during DTSM beta cohort)*
**How they describe us:** *(TBD — capture verbatim from first beta users)*
**Words to use:** edge, playbook, setup, catalyst, sentiment, A+ / B / C, float, small-cap, momentum, discipline, review, journal, local-first, your data, your machine, honest free tier.
**Words to avoid:** "platform," "enterprise," "AI-powered" (until it actually is), "sync to the cloud" (until Pro), "all traders" / "any strategy" (we're not that), "social" / "leaderboards" (anti-Mark-Douglas).
**Glossary:**

|Term|Meaning|
|-|-|
|FugaEdge|Product name.|
|EDGE JOURNAL|Sub-brand / app surface name.|
|EDGE INSIGHTS|Analytics view comparing performance across periods.|
|Compare Periods|Feature that diffs two date ranges.|
|Calendar Compare|Feature that diffs calendar windows (e.g., this Monday vs last Monday).|
|Playbook|The trader's documented set of A+/B/C setups.|
|Sentiment rating|1–5 emotional-state tag attached to each trade.|
|Catalyst|The news / fundamental reason a small-cap is in play that day.|
|DAS Trader|The execution platform most ICP users trade through (Windows only).|
|DTSM|Tester B Hogan's trading community (joindtsm.com) — first beta cohort partner.|

## Brand Voice

**Tone:** Direct, trader-to-trader. Not corporate. Not hype. Honest about what's shipped vs. what's coming.
**Style:** Plainspoken. Specific. Uses the user's own vocabulary (setup, float, catalyst, A+). Short sentences. Numbers and concrete features over adjectives.
**Personality:** Disciplined. Skeptical. Builder-energy. Respect for the difficulty of the craft. A little stoic — closer to Mark Douglas than to growth-hacker.

## Proof Points

**Metrics:** *(pre-launch — none to cite yet)*
**Customers:** First beta cohort via DTSM (Tester B Hogan, joindtsm.com) — planned alongside v0.2.0, currently in active development.
**Testimonials:** *(TBD post-beta)*
**Value themes:**

|Theme|Proof|
|-|-|
|Built for momentum traders|Catalyst tracking, sentiment 1–5, playbook A+/B/C, EDGE INSIGHTS, Compare Periods, Calendar Compare.|
|Local-first / your data stays yours|Electron desktop app, no cloud account, open-source code, GitHub Releases auto-updater.|
|Built by a trader|Solo developer running the same Ross Cameron-style small-cap momentum playbook the tool serves.|
|Honest free tier|Everything in v0.1.6 + v0.2.0 stays free forever. Pro is reserved for features that genuinely need infrastructure.|
|Ships and iterates|v0.1.6 live, v0.2.0 (Lightspeed + Webull CSV import V2) in active development.|

## Goals

**Business goal:** Land a focused first beta cohort via DTSM around the v0.2.0 launch, validate the journal-as-discipline-loop thesis, and build toward a paid Pro tier (v0.4.0+) once mobile, cloud sync, and AI features are ready.
**Conversion action (pre-launch):** Download the Windows installer and complete the onboarding tour (DAS CSV import → first journal entry).
**Current metrics:** *(pre-launch — none yet)*

## Existing Features (v0.1.6 reference)

* DAS Trader CSV import (Lightspeed + Webull arriving v0.2.0)
* 9 pages: Dashboard, Trades, Calendar, Reports, Playbook, Analytics, Journal, Import, Settings
* EDGE INSIGHTS, Compare Periods, Calendar Compare
* Sentiment ratings (1–5), catalyst tracking, country/region tracking
* Light/dark theme, onboarding tour
* Polygon market data integration
* Auto-updater via GitHub Releases

## Brand Assets

* Names: **FugaEdge** (company/product), **EDGE JOURNAL** (app surface)
* Logo: bull silhouette
* Tagline: *TBD*

