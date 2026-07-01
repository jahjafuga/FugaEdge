import type { SourceBroker } from '@shared/import-types'

// Pure selector for the Import "Fees not included" banner's body copy. Extracted
// so the variant rule is unit-testable and portable (zero electron/db/react).
//
// After Fix 1 the banner only fires when NO trip reports fees, so the advice
// must match the broker: DAS fees live in a separate Account Report (suggest
// dropping it); ThinkorSwim exports carry no fees at all (honest "not reported",
// no DAS suggestion); anything else, or a mixed-broker batch, gets neutral copy.
//
// NOTE: key on the EMITTED literal 'ThinkorSwim' (parse-tos.ts). The SourceBroker
// union also carries a dead 'ToS' literal that no parser emits — keying on that
// would silently misroute the ThinkorSwim case to 'generic'.
export function deriveFeesBannerVariant(
  brokers: readonly SourceBroker[],
): 'das' | 'thinkorswim' | 'generic' {
  const set = new Set(brokers)
  if (set.size === 1 && set.has('DAS')) return 'das'
  if (set.size === 1 && set.has('ThinkorSwim')) return 'thinkorswim'
  return 'generic'
}
