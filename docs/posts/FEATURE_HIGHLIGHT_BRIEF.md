# Feature Highlight Brief — [feature name]

This brief generates the inputs for a FugaEdge `feature_highlight` social post — a
spotlight on ONE feature, with the feature name as hero, a screenshot, capability
bullets (or a single caption line), and a footer. Works for BOTH a teaser (coming-soon,
not yet shipped) AND a shipped-feature deep-dive.

**Template:** `FugaEdge / feature_highlight` (already built + published in Canva Brand Kit).
This brief produces FILL VALUES — not a rebuild.

---

## CRITICAL — teaser vs shipped (this changes the whole post)

Decide this FIRST. It controls the honesty markers on the post.

- **TEASER (coming soon, NOT yet shipped):** top-right tag = `COMING SOON/` in green
  (#34d399), label = `FEATURE PREVIEW`, footer = `In development` in green, and
  ABSOLUTELY NO VERSION NUMBER anywhere on the image. A version number implies it's
  downloadable. Three independent "not shipped yet" signals must be present.
- **SHIPPED (live now):** top-right tag = `FEATURE/`, footer carries the version number
  (e.g. v0.2.5) bottom-right like the other templates.

Posting a teaser that reads as "available now" breaks trust when users download and the
feature isn't there. The teaser framing must be unmistakable.

**This post is:**  TEASER  /  SHIPPED   (circle one)
**If shipped — version:** vX.Y.Z

## Feature

- Feature name (snake_case, the gold hero):
- What it does, in one plain sentence:

## Screenshot

One screenshot of the feature. Requirements:
- DARK MODE only.
- No taskbar / other-app chrome — crop to app content (or to the feature region).
- No sensitive/identifying data.
- High resolution.
- If the screenshot's full content matters (e.g. labels fanning across a chart), the
  frame may need to grow to fit it full-size, which trades space away from bullets —
  in that case use a single caption line instead of three bullets (see below).

**Screenshot shows:**

## Capability bullets OR single caption line

Two layout options depending on how much room the screenshot needs:

**Option A — three capability bullets** (when the screenshot fits with room below):
Each becomes a → bullet. Plain English, what the feature does for the trader.
-
-
-

**Option B — one caption line** (when the screenshot needs full height):
A single Inter sentence framing the feature. Bullets then move to the X caption instead.
**Caption line:**

## Footer right-side label

- If TEASER: which feature area it belongs to (e.g. "FugaEdge charts"). NO version.
- If SHIPPED: the version number (e.g. v0.2.5).

**Footer label:**

## Public attribution check

- [ ] Names cleared for public attribution
- [ ] Use generic references instead

## Anything off-limits

-

---

## X caption guidance for the Canva chat

- TEASER: open with "Coming soon" / "Sneak peek" — frame as upcoming, never as available.
  If the image used Option B (one caption line), the three capability bullets live here
  in the caption instead. No download link (nothing to download yet).
- SHIPPED: can include a download link to releases/latest if driving installs.
- Keep under 280 characters. End with #buildinpublic.
- If using real numbers from the screenshot in the caption, make sure they match the image.

## Instruction to Claude Code

When the founder requests a feature highlight, FIRST confirm teaser-vs-shipped — this is
the load-bearing decision. Fill every section. If teaser, ensure no version number ends up
anywhere in the fill values. Output the filled brief in a code block, no commentary.
