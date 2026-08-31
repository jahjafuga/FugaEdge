/** THE APP'S OWN DEFINITION OF A LOW FLOAT, in one place.
 *
 *  THE NUMBER IS NOT INVENTED HERE. It is the threshold the Low-Float Hunter
 *  badge has counted by since it shipped, which lived in the main process at
 *  electron/badges/execution-facts.ts and could not be read by a pure module.
 *  The resolver needs the same number to answer "low float", and two copies of
 *  a threshold is how the badge and the filter start disagreeing about what
 *  the trader's own strategy means.
 *
 *  WHY NOT PICK A NICER NUMBER. Because a band that does not match the badge
 *  is a second opinion the trader never asked for. The word "above" is still
 *  out of the vocabulary for the same reason: its band definition contradicts
 *  its plain meaning, and until that is ruled on it stays unreadable rather
 *  than guessing.
 *
 *  ARCHITECTURE: pure, no electron, no fs, no sqlite -- so the badge layer and
 *  the resolver can both import it and the web port carries it unchanged. */
export const LOW_FLOAT_MAX = 20_000_000

/** THE FLOOR OF A HIGH FLOAT, so the two bands PARTITION.
 *
 *  Range bounds are inclusive on both sides, so a high band starting AT
 *  LOW_FLOAT_MAX would match a stock sitting exactly on the threshold -- and so
 *  would the low band. One stock answering both "low float" and "high float" is
 *  the kind of quiet contradiction this campaign exists to remove.
 *
 *  A FLOAT IS A SHARE COUNT. The column is declared INTEGER and carries zero
 *  non-integer values on any measured book, so "more than LOW_FLOAT_MAX" is
 *  exactly "at least one share more". This is not a second threshold; it is the
 *  same one, expressed strictly through an inclusive-bounds API. */
export const HIGH_FLOAT_MIN = LOW_FLOAT_MAX + 1
