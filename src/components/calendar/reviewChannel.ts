// THE REVIEW CARD'S WIRING, AS A PROP, WITH ITS ID ALREADY BOUND.
//
// The Overview tab renders the review card for whatever period mounts it, and
// every period's review lives on its own IPC pair keyed on its own id. The tab
// must therefore not name a channel: it calls what it is handed.
//
// THE METHODS TAKE NO ARGUMENT, AND THAT IS THE WHOLE DESIGN. The first cut of
// this passed the tab's period START to the channel. For a week that is the id
// -- the Sunday IS the week_start the key is anchored on -- so it worked, and
// for a month it silently did not: the id is '2026-06' but the start is
// '2026-06-01', so buildMonthlyReviewIntent threw, the handler returned
// { completed: false }, and the trader would simply never have been awarded.
// Nothing would have reported it. Binding the id at the HOST, where it is
// known, makes that mistake unavailable rather than merely tested for.
//
// WHY THIS IS NOT A `period: 'week' | 'month'` DISCRIMINATOR: the weekly GET
// handler does no validation whatsoever -- electron/xp/ipc.ts:45-52 builds
// `weekly_review:${id}` and looks it up -- so a wrong branch is invisible. A
// wrong OBJECT is a thing a test can watch being called, which is what AI6
// does.
export interface ReviewChannel {
  /** Has this period's review already been banked? */
  get(): Promise<{ completed: boolean }>
  /** Bank it. `completed: false` carries the guard's rejection in `error`. */
  complete(): Promise<{
    completed: boolean
    awarded?: boolean
    error?: string
  }>
}
