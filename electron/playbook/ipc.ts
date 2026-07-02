import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  BulkSetPlaybookInput,
  CreatePlaybookInput,
  PlaybookTagInput,
  SetPlaybookOnTradeInput,
  UpdatePlaybookInput,
} from '@shared/playbook-types'
import type { TradeListRow } from '@shared/trades-types'
import type { AccountScope } from '@shared/accounts-types'
import { bumpDataVersion } from '../lib/cache'
import { xpReconcileForTradeIds } from '../xp/reconcile'
import {
  addPlaybookTag,
  createPlaybook,
  deletePlaybook,
  getPlaybookTagsForTrade,
  listPlaybooks,
  removePlaybookTag,
  setPlaybookOnTrade,
  setPlaybookOnTradesBulk,
  updatePlaybook,
} from './repo'
import { getTrade } from '../trades/list'

export function registerPlaybookIpc(): void {
  // Multi-account slice — optional scope (the trades-list opt-in shape);
  // absent resolves through the seam as 'all'. Definitions stay global;
  // only the per-playbook stats follow it. Mutations untouched.
  ipcMain.handle(
    IPC.PLAYBOOKS_LIST,
    (_e, input?: { accountScope?: AccountScope }) =>
      listPlaybooks(input?.accountScope ?? 'all'),
  )
  ipcMain.handle(IPC.PLAYBOOK_CREATE, (_e, input: CreatePlaybookInput) => {
    const r = createPlaybook(input)
    bumpDataVersion()
    return r
  })
  ipcMain.handle(IPC.PLAYBOOK_UPDATE, (_e, input: UpdatePlaybookInput) => {
    const r = updatePlaybook(input)
    bumpDataVersion()
    return r
  })
  ipcMain.handle(
    IPC.TRADE_PLAYBOOK_SAVE,
    (_e, input: SetPlaybookOnTradeInput) => {
      setPlaybookOnTrade(input.trade_id, input.playbook_id)
      bumpDataVersion()
      // v0.2.5 XP hook (L11/L12 — playbook feeds D8 AND D9): fire-and-forget
      // after save + bump; the launch sweep heals any miss.
      void Promise.resolve()
        .then(() => xpReconcileForTradeIds([input.trade_id]))
        .catch((e) => console.warn('[xp hook]', e))
      return getTrade(input.trade_id)
    },
  )
  // Phase 2 — bulk set the primary playbook. Mirrors TRADE_PLAYBOOK_SAVE: repo
  // write -> bump -> fire-and-forget XP reconcile for ALL ids (playbook feeds
  // D8/D9) -> return the refreshed rows so the renderer patches them in with the
  // correct server-joined playbook_name / tier.
  ipcMain.handle(
    IPC.TRADES_PLAYBOOK_SAVE_BULK,
    (_e, input: BulkSetPlaybookInput) => {
      setPlaybookOnTradesBulk(input.trade_ids, input.playbook_id)
      bumpDataVersion()
      void Promise.resolve()
        .then(() => xpReconcileForTradeIds(input.trade_ids))
        .catch((e) => console.warn('[xp hook]', e))
      return input.trade_ids
        .map((id) => getTrade(id))
        .filter((t): t is TradeListRow => t != null)
    },
  )
  ipcMain.handle(IPC.PLAYBOOK_DELETE, (_e, id: number) => {
    const r = deletePlaybook(id)
    bumpDataVersion()
    return r
  })
  // Beat 2 — secondary confluence tags (trade_playbooks). TAGS_GET is a pure
  // read (no bump). ADD/REMOVE mirror TRADE_PLAYBOOK_SAVE exactly: repo write →
  // bump → fire-and-forget XP reconcile → return the refreshed trade.
  ipcMain.handle(IPC.TRADE_PLAYBOOK_TAGS_GET, (_e, tradeId: number) =>
    getPlaybookTagsForTrade(tradeId),
  )
  ipcMain.handle(IPC.TRADE_PLAYBOOK_TAG_ADD, (_e, input: PlaybookTagInput) => {
    addPlaybookTag(input.trade_id, input.playbook_id)
    bumpDataVersion()
    void Promise.resolve()
      .then(() => xpReconcileForTradeIds([input.trade_id]))
      .catch((e) => console.warn('[xp hook]', e))
    return getTrade(input.trade_id)
  })
  ipcMain.handle(IPC.TRADE_PLAYBOOK_TAG_REMOVE, (_e, input: PlaybookTagInput) => {
    removePlaybookTag(input.trade_id, input.playbook_id)
    bumpDataVersion()
    void Promise.resolve()
      .then(() => xpReconcileForTradeIds([input.trade_id]))
      .catch((e) => console.warn('[xp hook]', e))
    return getTrade(input.trade_id)
  })
}
