// Stage 3 — cash-events + balance types, shared between the Electron data
// layer and the renderer (ARCHITECTURE.md rule #7). Beat 1 ships the engine;
// the IPC/preload/client chain consumes these in beat 2.

export const CASH_EVENT_KINDS = ['starting', 'deposit', 'withdrawal'] as const
export type CashEventKind = (typeof CASH_EVENT_KINDS)[number]

export interface CashEvent {
  id: string
  account_id: string
  kind: CashEventKind
  amount: number
  /** YYYY-MM-DD Eastern trading day — the trades.date convention, so anchor
   *  comparisons are plain string compares. */
  date: string
  /** Non-null links the two legs of a transfer; legs are only deletable as a
   *  pair via the transfer_id. */
  transfer_id: string | null
  created_at: string
}

export interface CreateCashEventInput {
  account_id: string
  kind: CashEventKind
  amount: number
  date: string
}

export interface CreateTransferInput {
  from_account_id: string
  to_account_id: string
  amount: number
  date: string
}

export interface TransferResult {
  transfer_id: string
  from_event: CashEvent
  to_event: CashEvent
}

/** A single account's computed ledger balance. NULL from the reader when the
 *  account has no 'starting' anchor (never a fabricated 0). */
export interface AccountBalance {
  account_id: string
  anchor_date: string
  starting: number
  deposits: number
  withdrawals: number
  net_pnl: number
  balance: number
}

/** The combined non-sim roll-up: the composed total over anchored accounts
 *  plus the accounts excluded for lack of an anchor. */
export interface CombinedBalance {
  total: number
  missing_anchor: string[]
}
