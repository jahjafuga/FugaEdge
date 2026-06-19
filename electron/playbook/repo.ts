import { openDatabase } from '../db/database'
import { computeRiskBreakdown } from '../lib/r-multiple'
import {
  PLAYBOOK_TIERS,
  type CreatePlaybookInput,
  type Playbook,
  type PlaybookStats,
  type PlaybookTag,
  type PlaybookTier,
  type PlaybookWithStats,
  type UpdatePlaybookInput,
} from '@shared/playbook-types'
import { isWin, isLoss } from '@/core/classify/outcome'

interface PlaybookRowDb {
  id: number
  name: string
  description: string
  rules: string
  ideal_conditions: string
  archived: number
  is_system: number
  tier: string
  created_at: string
}

function normalizeTier(raw: string | null | undefined): PlaybookTier {
  // The DB column is NOT NULL DEFAULT 'B' but tolerate odd values from
  // hand-edited rows by clamping back to 'B' rather than throwing.
  if (raw && (PLAYBOOK_TIERS as readonly string[]).includes(raw)) {
    return raw as PlaybookTier
  }
  return 'B'
}

function rowToPlaybook(r: PlaybookRowDb): Playbook {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    rules: r.rules ?? '',
    ideal_conditions: r.ideal_conditions ?? '',
    archived: !!r.archived,
    is_system: !!r.is_system,
    tier: normalizeTier(r.tier),
    created_at: r.created_at,
  }
}

function emptyStats(): PlaybookStats {
  return {
    trade_count: 0,
    net_pnl: 0,
    winners: 0,
    losers: 0,
    scratches: 0,
    win_rate: null,
    profit_factor: null,
    avg_winner: null,
    avg_loser: null,
    largest_winner: null,
    largest_loser: null,
    avg_r: null,
  }
}

interface TradeRowForStats {
  net_pnl: number
  side: 'long' | 'short'
  avg_buy_price: number
  avg_sell_price: number
  shares_bought: number
  shares_sold: number
  planned_risk: number | null
  planned_stop_loss_price: number | null
}

function computeStatsForPlaybook(playbookId: number): PlaybookStats {
  const db = openDatabase()
  const trades = db
    .prepare(`
      SELECT net_pnl, side, avg_buy_price, avg_sell_price,
             shares_bought, shares_sold,
             planned_risk, planned_stop_loss_price
      FROM trades WHERE playbook_id = ? AND deleted_at IS NULL
    `)
    .all(playbookId) as TradeRowForStats[]

  if (trades.length === 0) return emptyStats()

  let net = 0
  let winnersSum = 0
  let losersSum = 0
  let winners = 0
  let losers = 0
  let scratches = 0
  let largestWinner: number | null = null
  let largestLoser: number | null = null

  for (const t of trades) {
    net += t.net_pnl
    if (isWin(t.net_pnl)) {
      winners++
      winnersSum += t.net_pnl
      if (largestWinner == null || t.net_pnl > largestWinner) largestWinner = t.net_pnl
    } else if (isLoss(t.net_pnl)) {
      losers++
      losersSum += t.net_pnl
      if (largestLoser == null || t.net_pnl < largestLoser) largestLoser = t.net_pnl
    } else {
      scratches++
    }
  }

  // Average R-multiple — mean of R values for trades that have planned_risk.
  // Trades without planned_risk are excluded from the average rather than
  // counted as 0R, which would flatten the metric.
  let rSum = 0
  let rCount = 0
  for (const t of trades) {
    const { r_multiple: r } = computeRiskBreakdown(t.net_pnl, {
      side: t.side,
      avg_buy_price: t.avg_buy_price,
      avg_sell_price: t.avg_sell_price,
      shares_bought: t.shares_bought,
      shares_sold: t.shares_sold,
      planned_risk: t.planned_risk,
      planned_stop_loss_price: t.planned_stop_loss_price,
    })
    if (r !== null && Number.isFinite(r)) {
      rSum += r
      rCount += 1
    }
  }

  const decided = winners + losers
  return {
    trade_count: trades.length,
    net_pnl: net,
    winners,
    losers,
    scratches,
    win_rate: decided > 0 ? winners / decided : null,
    profit_factor:
      losers > 0 ? winnersSum / Math.abs(losersSum) : null,
    avg_winner: winners > 0 ? winnersSum / winners : null,
    avg_loser: losers > 0 ? losersSum / losers : null,
    largest_winner: largestWinner,
    largest_loser: largestLoser,
    avg_r: rCount > 0 ? rSum / rCount : null,
  }
}

export function listPlaybooks(): PlaybookWithStats[] {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT id, name, description, rules, ideal_conditions, archived, is_system, tier, created_at
      FROM playbooks
      ORDER BY archived ASC, name ASC
    `)
    .all() as PlaybookRowDb[]
  return rows.map((r) => {
    const pb = rowToPlaybook(r)
    return { ...pb, stats: computeStatsForPlaybook(pb.id) }
  })
}

export function getPlaybook(id: number): PlaybookWithStats | null {
  const db = openDatabase()
  const row = db
    .prepare(`
      SELECT id, name, description, rules, ideal_conditions, archived, is_system, tier, created_at
      FROM playbooks WHERE id = ?
    `)
    .get(id) as PlaybookRowDb | undefined
  if (!row) return null
  const pb = rowToPlaybook(row)
  return { ...pb, stats: computeStatsForPlaybook(pb.id) }
}

export function createPlaybook(input: CreatePlaybookInput): PlaybookWithStats {
  const db = openDatabase()
  const name = (input.name ?? '').trim()
  if (!name) throw new Error('Playbook name is required')
  const tier = normalizeTier(input.tier ?? 'B')

  const result = db
    .prepare(`
      INSERT INTO playbooks (name, description, rules, ideal_conditions, tier)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(
      name,
      (input.description ?? '').trim(),
      (input.rules ?? '').trim(),
      (input.ideal_conditions ?? '').trim(),
      tier,
    )
  const id = Number(result.lastInsertRowid)
  const got = getPlaybook(id)
  if (!got) throw new Error('Playbook disappeared after insert')
  return got
}

export function updatePlaybook(input: UpdatePlaybookInput): PlaybookWithStats {
  const db = openDatabase()
  // Beat 2 — "No Setup" (is_system=1) is fully frozen: no rename, re-grade, or
  // archive (all three flow through this one fn). Guard BEFORE the read/merge/
  // write so nothing mutates; a non-existent id falls through to the existing
  // not-found throw below.
  const sys = db
    .prepare('SELECT is_system FROM playbooks WHERE id = ?')
    .get(input.id) as { is_system: number } | undefined
  if (sys?.is_system === 1) {
    throw new Error('System playbooks cannot be modified')
  }
  // Read the current row, merge incoming fields, write back. Cleaner than
  // building a dynamic SET clause per call.
  const current = db
    .prepare('SELECT id, name, description, rules, ideal_conditions, archived, tier FROM playbooks WHERE id = ?')
    .get(input.id) as
      | { id: number; name: string; description: string; rules: string; ideal_conditions: string; archived: number; tier: string }
      | undefined
  if (!current) throw new Error(`Playbook ${input.id} not found`)

  const next = {
    name: input.name !== undefined ? input.name.trim() : current.name,
    description: input.description !== undefined ? input.description.trim() : current.description,
    rules: input.rules !== undefined ? input.rules.trim() : current.rules,
    ideal_conditions:
      input.ideal_conditions !== undefined ? input.ideal_conditions.trim() : current.ideal_conditions,
    archived: input.archived !== undefined ? (input.archived ? 1 : 0) : current.archived,
    tier: input.tier !== undefined ? normalizeTier(input.tier) : normalizeTier(current.tier),
  }

  if (!next.name) throw new Error('Playbook name cannot be empty')

  db.prepare(`
    UPDATE playbooks
    SET name = ?, description = ?, rules = ?, ideal_conditions = ?, archived = ?, tier = ?
    WHERE id = ?
  `).run(
    next.name,
    next.description,
    next.rules,
    next.ideal_conditions,
    next.archived,
    next.tier,
    input.id,
  )

  const got = getPlaybook(input.id)
  if (!got) throw new Error('Playbook disappeared after update')
  return got
}

export interface DeletePlaybookResult {
  deleted: boolean
  trades_unlinked: number
}

// Deletes a playbook and nulls playbook_id on every trade that referenced it.
// Wrapped in a transaction so a partial state isn't possible. Trades themselves
// stay intact; they'll just render as "No playbook" afterwards.
export function deletePlaybook(id: number): DeletePlaybookResult {
  const db = openDatabase()
  // Beat 2 — "No Setup" (is_system=1) cannot be deleted. Guard BEFORE the txn so
  // nothing mutates; a non-existent id falls through to the existing no-op (the
  // txn's not-found early-return leaves { deleted:false }).
  const sys = db
    .prepare('SELECT is_system FROM playbooks WHERE id = ?')
    .get(id) as { is_system: number } | undefined
  if (sys?.is_system === 1) {
    throw new Error('System playbooks cannot be deleted')
  }
  let tradesUnlinked = 0
  let deleted = false
  const tx = db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM playbooks WHERE id = ?').get(id)
    if (!exists) return
    const r = db.prepare('UPDATE trades SET playbook_id = NULL WHERE playbook_id = ?').run(id)
    tradesUnlinked = Number(r.changes)
    db.prepare('DELETE FROM playbooks WHERE id = ?').run(id)
    deleted = true
  })
  tx()
  return { deleted, trades_unlinked: tradesUnlinked }
}

export function setPlaybookOnTrade(tradeId: number, playbookId: number | null): void {
  const db = openDatabase()
  // Validate the playbook exists (when one is provided) so we don't leave a
  // dangling ID after the row gets deleted under us.
  if (playbookId != null) {
    const exists = db.prepare('SELECT 1 FROM playbooks WHERE id = ?').get(playbookId)
    if (!exists) throw new Error(`Playbook ${playbookId} not found`)
  }
  // Beat 2 — Invariant 1 on the primary path: promoting a playbook to primary
  // must drop it from the secondary junction so it is never BOTH. Atomic: the
  // junction delete + the primary update commit together (a crash can't leave
  // double-membership). Setting primary to null skips the junction delete and
  // just clears the primary.
  const tx = db.transaction(() => {
    if (playbookId != null) {
      db.prepare(
        'DELETE FROM trade_playbooks WHERE trade_id = ? AND playbook_id = ?',
      ).run(tradeId, playbookId)
    }
    db.prepare('UPDATE trades SET playbook_id = ? WHERE id = ?').run(playbookId, tradeId)
  })
  tx()
}

// Beat 2 — read a trade's SECONDARY confluence tags (the trade_playbooks
// junction), NOT the primary on trades.playbook_id. A separate per-trade fetch
// (the ATTACHMENTS_LIST precedent), ordered by name for a stable display. tier
// is normalized like everywhere else; a system "No Setup" can never be a
// secondary, so these are always real graded user playbooks.
export function getPlaybookTagsForTrade(tradeId: number): PlaybookTag[] {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT p.id, p.name, p.tier
      FROM trade_playbooks tp
      JOIN playbooks p ON p.id = tp.playbook_id
      WHERE tp.trade_id = ?
      ORDER BY p.name
    `)
    .all(tradeId) as { id: number; name: string; tier: string }[]
  return rows.map((r) => ({ id: r.id, name: r.name, tier: normalizeTier(r.tier) }))
}

// Beat 2 — add a SECONDARY confluence tag (trade_playbooks). Mirrors
// setPlaybookOnTrade's existence check, PLUS the two invariants:
//   Inv 2 — a system "No Setup" (is_system=1) can never be a secondary.
//   Inv 1 — the trade's PRIMARY (trades.playbook_id) can't also be a secondary.
// INSERT OR IGNORE, not a plain INSERT: re-adding the same tag is a benign,
// idempotent no-op — the composite PK swallows the duplicate without erroring,
// the right UX for clicking "add" twice. (Contrast the No Setup SEED, which uses
// a PLAIN insert precisely to SURFACE a UNIQUE-name collision.)
export function addPlaybookTag(tradeId: number, playbookId: number): void {
  const db = openDatabase()
  const pb = db
    .prepare('SELECT is_system FROM playbooks WHERE id = ?')
    .get(playbookId) as { is_system: number } | undefined
  if (!pb) throw new Error(`Playbook ${playbookId} not found`)
  if (pb.is_system === 1) {
    throw new Error('A system playbook cannot be a confluence tag')
  }
  const trade = db
    .prepare('SELECT playbook_id FROM trades WHERE id = ?')
    .get(tradeId) as { playbook_id: number | null } | undefined
  if (trade && trade.playbook_id === playbookId) {
    throw new Error('That playbook is already the primary setup on this trade')
  }
  db.prepare(
    'INSERT OR IGNORE INTO trade_playbooks (trade_id, playbook_id) VALUES (?, ?)',
  ).run(tradeId, playbookId)
}

// Beat 2 — remove a secondary confluence tag. Removing an absent (trade,
// playbook) pair deletes zero rows — a clean no-op, never an error.
export function removePlaybookTag(tradeId: number, playbookId: number): void {
  const db = openDatabase()
  db.prepare(
    'DELETE FROM trade_playbooks WHERE trade_id = ? AND playbook_id = ?',
  ).run(tradeId, playbookId)
}
