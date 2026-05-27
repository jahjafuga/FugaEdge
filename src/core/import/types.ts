// Universal import data model — spec-mandated path. The actual interfaces
// live in /shared/import-types.ts so the main process and renderer pull
// from a single source via the @shared/ alias. This file is the /src/core
// re-export surface required by v0.2.0's architecture rules.

export type {
  ExecSide,
  Execution,
  RoundTrip,
  RoundTripExecution,
  RowStatus,
  FeeStatus,
  SourceBroker,
  SourceFormat,
  DaySummaryFeeRow,
  CsvFormat,
  FileInfo,
  PreviewSummary,
  PreviewResult,
  PreviewInputFile,
  CommitInput,
  CommitResult,
} from '@shared/import-types'
