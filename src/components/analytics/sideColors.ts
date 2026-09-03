// THE SIDE COLOURS, ONCE (beat 287). Moved out of DualEquityChart so the tab
// and the chart import one constant instead of each spelling a hex. A colour
// is presentation, so this lives under components, not core.
//
// long = blue-500, short = orange-500 -- deliberately OUTSIDE the win/loss
// palette: green and red stay P&L semantics, and a side is not an outcome.
// Gold remains the app accent and is not spelled here.
export const SIDE_COLORS = { long: '#3b82f6', short: '#f97316' } as const

export type SideKey = keyof typeof SIDE_COLORS
