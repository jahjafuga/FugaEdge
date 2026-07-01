// Pure rule for the Import page's "Fees not included" banner. Extracted from
// electron/import/ipc.ts so it is unit-testable and free of electron/db imports
// (SaaS-portable). See __tests__/feesUnavailable.test.ts.
//
// The banner should fire only when this batch has execution files, NO companion
// fee file (DAS Account Report / daily-summary), AND no trip actually carries
// inline fees. Inline-fee brokers (Lightspeed, TradeZero, Ocean One, DAS
// executions with fees) set fees_reported=true, so the banner must stay silent
// for them even though no separate fee file was dropped.
export function deriveFeesUnavailable(
  executionFilesPresent: boolean,
  feeFilesPresent: boolean,
  trips: ReadonlyArray<{ fees_reported?: boolean }>,
): boolean {
  return executionFilesPresent && !feeFilesPresent && !trips.some((t) => t.fees_reported)
}
