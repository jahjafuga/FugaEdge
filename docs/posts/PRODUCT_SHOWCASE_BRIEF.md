# Product Showcase Brief — [feature name]

This brief generates the inputs for a FugaEdge `product_showcase` social post — a
screenshot-led post where the app UI is the hero, not text. Used to show off a SHIPPED
feature with a closer look ("here's what this does"), distinct from a release announcement.

**Template:** `FugaEdge / product_showcase` (already built + published in Canva Brand Kit).
This brief produces FILL VALUES — not a rebuild.

The template supports two modes:
- **Single hero** — one clean screenshot fills the frame (best when one screenshot tells
  the whole story and stays readable at full size).
- **Sequence (multi-panel)** — 2-3 stacked panels, each a numbered step with its own
  cropped screenshot (best for a multi-step flow like select → confirm → recover).
  NOTE: panels make each screenshot small — crop each tightly to its key region, or the
  UI text becomes illegible.

---

## Feature being showcased

- Feature name (snake_case, the gold hero on the post):
- Shipped in version: vX.Y.Z (must already be live — showcases are for shipped features, not teasers)
- Mode: single hero  OR  sequence (2-3 panels)

## Screenshots needed

List the screenshot(s) and what each must show. Requirements for ALL screenshots:
- DARK MODE only (brand is near-black #0d0f14 — light-mode screenshots clash and break the brand).
- No Windows taskbar / other-app chrome at the edges — crop to just the app content.
- No sensitive/identifying data (account names, sensitive P&L, beta-tester info) — scrub before capture.
- High resolution — capture at full window size.

**Single hero mode** — one screenshot, cropped to its key region:
- Screenshot:  [what it shows, e.g. "the confirm-trash modal with the 30-day restore line"]

**Sequence mode** — one screenshot PER panel, each cropped TIGHT to its essential region:
- Panel 1 (step label: ___):  [screenshot + crop region]
- Panel 2 (step label: ___):  [screenshot + crop region]
- Panel 3 (step label: ___):  [screenshot + crop region]

## Caption line (on the image)

One plain-English sentence that frames the screenshot(s). Inter font, muted. Examples:
- "Deleted trades, recoverable for 30 days."
- "Every fill, plotted at its real price on the candle."

**Caption line:**

## Version tag (footer)

The shipped version this feature is in. Goes bottom-right. Examples: v0.2.3.

**Version:**

## Public attribution check

- [ ] Names cleared for public attribution
- [ ] Use generic references instead

## Anything off-limits

-

---

## X caption guidance for the Canva chat

- A showcase is awareness, not conversion — the caption explains the feature, usually
  WITHOUT a download link (the goal is "look what this does," not "download vX.Y.Z").
- If sequence mode: the caption can walk the 1/2/3 steps to mirror the image's panels.
- If single hero: lead with the why (the problem the feature solves), then the how.
- Keep under 280 characters. End with #buildinpublic.
- If this showcase covers a feature ALREADY announced in a release post, frame it as a
  closer look — don't re-announce it as new.

## Instruction to Claude Code

When the founder requests a product showcase for a shipped feature, fill this brief from
the actual feature as shipped. Confirm the feature is LIVE in the named version before
filling. Output the filled brief in a code block, no commentary.
