// ONE METRIC for the Trades view row — Table / Charts / Grid / Columns.
//
// Every one of them is now a pressable OBJECT with its own border and surface,
// rather than bare text sharing a container. The metric is lifted from PRINT
// REPORT on the Analytics page (Analytics.tsx), which is the most finished button
// in the app: h-8, rounded-md, border-border-subtle, bg-bg-2, and a
// transition-colors at 150ms. Nothing here is a new value.
//
// The one thing NOT taken from it is its hover, which tints gold. Gold is the
// selected state in this row, and a gold hover on an inactive control makes the
// user hunt for which view is actually on while the cursor moves. Hover LIFTS
// (a step up the surface scale); gold SELECTS.
//
// Exported as strings rather than a component so the segmented buttons and the
// menu trigger cannot drift apart — they share the characters, not a convention.

/** Height, radius, border, type and transition. The shared skeleton. */
export const VIEW_CONTROL_BASE =
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 ' +
  'text-[11px] font-semibold uppercase tracking-wider ' +
  'transition-colors duration-150 ease-out-soft'

/** The focus treatment. shadow-glow-gold was declared in tailwind.config long ago
 *  and used by nothing until the analytics toolbar; these controls had none at all,
 *  and they are real buttons now. Same string that bar uses. */
export const VIEW_CONTROL_FOCUS =
  'focus-visible:border-gold focus-visible:shadow-glow-gold focus-visible:outline-none'

/** Not selected: its own surface, and a hover that raises it one step. No gold. */
export const VIEW_CONTROL_INACTIVE =
  'border-border-subtle bg-bg-2 text-fg-tertiary hover:bg-bg-3 hover:text-fg-primary'

/** Selected. The only gold in the row, and the only thing that means "this one". */
export const VIEW_CONTROL_ACTIVE = 'border-gold bg-gold text-accent-ink'

/** Everything an unselected control needs. */
export const viewControlIdle = `${VIEW_CONTROL_BASE} ${VIEW_CONTROL_INACTIVE} ${VIEW_CONTROL_FOCUS}`
/** Everything the selected control needs. */
export const viewControlOn = `${VIEW_CONTROL_BASE} ${VIEW_CONTROL_ACTIVE} ${VIEW_CONTROL_FOCUS}`
