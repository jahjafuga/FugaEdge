import { useState } from 'react'

// Controlled draft for a <input type="number"> — the fix for the "050" append bug.
//
// THE BUG: React's DOM sync special-cases type="number" and compares the node against the
// value prop with a LOOSE `!=` (react-dom updateWrapper):
//
//   if (type === 'number') {
//     if (value === 0 && node.value === '' || node.value != value) { node.value = ... }
//   } else if (node.value !== toString(value)) { ... }   // every other type: STRICT
//
// With a NUMBER prop that breaks twice over:
//   1. node "050" vs prop 50 -> the string coerces -> they test EQUAL -> React never
//      repaints, so a leading zero sticks even though state already holds the right 50.
//   2. `value === 0 && node.value === ''` force-writes "0" back the instant the field is
//      cleared, which is why the "0" could not be deleted and typing only ever appended.
//
// THE FIX: bind a STRING. type="number" is KEPT (the bug is about the value's JS type, not
// the input's type attribute, and the spinbutton role is relied on elsewhere):
//   1. string vs string needs no coercion, so `!=` behaves like `!==` and React repaints
//      on any difference — the DOM can no longer drift from the draft.
//   2. `'' === 0` is false, so an emptied field is left empty. The caller pairs this with
//      placeholder="0", and 0 renders as an EMPTY draft — with nothing in the box, there is
//      nothing to append to, which is the reported bug at its root.
//
// The number semantics are untouched: an empty draft still COMMITS 0 (exactly as today's
// parseFloat("") -> NaN -> 0 did), so "0 = not set / disabled" still holds and nothing in
// the parse/store path changes.
//
// `scale` is the display divisor (the DNA float pillars show millions but store raw shares):
// the draft holds the DISPLAY-space string, and commit multiplies back to STORED space.
//
// Pure React — no electron/node imports; it would run unchanged in a Next.js page.

/** 0 renders as an empty draft so the caller's placeholder shows through. */
const toDraft = (shown: number): string =>
  Number.isFinite(shown) && shown !== 0 ? String(shown) : ''

export interface NumberDraft {
  /** The DISPLAY-space string to bind to `value` (this is what fixes the bug). */
  draft: string
  /** Feed the raw input string; returns the STORED-space number to hand to the parent. */
  onDraftChange: (raw: string) => number
}

export function useNumberDraft(value: number, scale = 1): NumberDraft {
  const shown = Number.isFinite(value) ? value / scale : 0
  const [draft, setDraft] = useState<string>(() => toDraft(shown))
  const [seen, setSeen] = useState<number>(value)

  // The commit expression, defined ONCE. The sync guard below re-runs this exact
  // expression, so a scaled decimal (12.345678 * 1e6, which is not exact in IEEE754)
  // round-trips bit-identically and the guard can never fight the user's own keystroke.
  // Matches the coercion the fields already used: parseFloat, clamp >= 0, NaN -> 0.
  const commit = (raw: string): number => {
    const n = raw.trim() === '' ? 0 : Number.parseFloat(raw)
    return Number.isFinite(n) && n >= 0 ? n * scale : 0
  }

  // Re-sync the draft when `value` changes from OUTSIDE (a settings load, an external
  // reset). Adjusted DURING RENDER, not in an effect — React's documented "you might not
  // need an effect" pattern. An effect would paint one frame with the stale draft first,
  // which on a settings load means the box flashes EMPTY before snapping to the saved
  // number. Setting state during render re-renders immediately, before the browser paints,
  // so there is no flicker (and no test race on the intermediate frame).
  //
  // The guard compares in STORED space against what the CURRENT draft would commit, which
  // is what keeps it safe on every edge:
  //   - an empty draft ALREADY means 0, so an incoming 0 does not clobber it back to "0"
  //   - the number a keystroke JUST committed is not an external change, so a verbatim
  //     draft ("05", "2.50") is never re-stringified out from under the caret
  //   - Object.is, so a NaN value cannot ping-pong forever (NaN !== NaN would loop)
  if (!Object.is(seen, value)) {
    setSeen(value)
    if (commit(draft) !== value) setDraft(toDraft(shown))
  }

  return {
    draft,
    onDraftChange: (raw: string): number => {
      setDraft(raw)
      return commit(raw)
    },
  }
}
