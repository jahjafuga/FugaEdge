import type { DayDetail } from '@shared/day-types'
import Card from '@/components/ui/Card'
import { money, signed, pnlClass, percent, int, compactShares } from '@/lib/format'

export default function OverviewTab({ detail }: { detail: DayDetail }) {
  const m = detail.metrics

  if (m.tradeCount === 0) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-2 p-6 text-sm text-fg-secondary">
        No trades on this day.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card title="Trades">
        <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
          {int(m.tradeCount)}
        </div>
        <div className="mt-1 text-xs text-fg-tertiary tnum">
          {m.winCount}W · {m.lossCount}L · {m.scratchCount}S
        </div>
      </Card>

      <Card title="Win rate" subtitle={m.winRate === null ? 'All scratches' : undefined}>
        <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
          {percent(m.winRate)}
        </div>
      </Card>

      <Card title="Biggest win">
        {m.biggestWin ? (
          <>
            <div className={`font-mono text-2xl font-semibold tnum ${pnlClass(m.biggestWin.pnl)}`}>
              {signed(m.biggestWin.pnl)}
            </div>
            <div className="mt-1 font-mono text-xs text-fg-tertiary">{m.biggestWin.symbol}</div>
          </>
        ) : (
          <div className="text-sm text-fg-tertiary">—</div>
        )}
      </Card>

      <Card title="Worst loss">
        {m.worstLoss ? (
          <>
            <div className={`font-mono text-2xl font-semibold tnum ${pnlClass(m.worstLoss.pnl)}`}>
              {signed(m.worstLoss.pnl)}
            </div>
            <div className="mt-1 font-mono text-xs text-fg-tertiary">{m.worstLoss.symbol}</div>
          </>
        ) : (
          <div className="text-sm text-fg-tertiary">—</div>
        )}
      </Card>

      {/* First trade — Decision 5 in the v0.2.2 plan: meaningful psychological
          data point that often sets the day's tone (Ross Cameron). */}
      <Card title="First trade">
        {m.firstTradePnl ? (
          <>
            <div className={`font-mono text-2xl font-semibold tnum ${pnlClass(m.firstTradePnl.pnl)}`}>
              {signed(m.firstTradePnl.pnl)}
            </div>
            <div className="mt-1 font-mono text-xs text-fg-tertiary">
              {m.firstTradePnl.symbol}
              {m.firstTradePnl.rMultiple !== null && (
                <> · {m.firstTradePnl.rMultiple.toFixed(2)}R</>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-fg-tertiary">—</div>
        )}
      </Card>

      <Card
        title="Avg R-multiple"
        subtitle={m.avgRMultiple === null ? 'No planned risk set' : undefined}
      >
        <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
          {m.avgRMultiple !== null ? `${m.avgRMultiple.toFixed(2)}R` : '—'}
        </div>
      </Card>

      <Card title="Avg win / Avg loss">
        <div className="font-mono text-sm tnum">
          <span className={m.avgWin !== null ? pnlClass(m.avgWin) : 'text-fg-tertiary'}>
            {m.avgWin !== null ? signed(m.avgWin) : '—'}
          </span>
          <span className="text-fg-tertiary"> / </span>
          <span className={m.avgLoss !== null ? pnlClass(m.avgLoss) : 'text-fg-tertiary'}>
            {m.avgLoss !== null ? signed(m.avgLoss) : '—'}
          </span>
        </div>
      </Card>

      <Card title="Session window">
        <div className="font-mono text-sm text-fg-primary tnum">
          {m.sessionFirstTradeTime ?? '—'} – {m.sessionLastTradeTime ?? '—'}
        </div>
      </Card>

      {/* Decision 4 in the v0.2.2 plan: top 3 + total count.
          5–15 symbols/day is typical for momentum traders; showing them all
          clutters the card. */}
      <Card title="Symbols traded">
        <div className="font-mono text-xs text-fg-primary">
          <div className="mb-1 text-fg-tertiary">
            {m.symbolsTraded.length} symbol{m.symbolsTraded.length === 1 ? '' : 's'}
          </div>
          {m.topThreeSymbols.map((s) => (
            <div key={s.symbol} className="flex justify-between gap-3">
              <span>{s.symbol}</span>
              <span className="text-fg-tertiary">{s.tradeCount}×</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Volume">
        <div className="font-mono text-sm text-fg-primary tnum">
          {compactShares(m.totalShares)} sh
        </div>
        <div className="mt-1 font-mono text-xs text-fg-tertiary tnum">
          {money(m.totalDollarVolume)} notional
        </div>
      </Card>

      <Card title="Most-used playbook">
        {m.mostUsedPlaybook ? (
          <>
            <div className="text-sm font-medium text-fg-primary">{m.mostUsedPlaybook.playbook}</div>
            <div className="mt-1 font-mono text-xs text-fg-tertiary tnum">
              {m.mostUsedPlaybook.tradeCount} trade{m.mostUsedPlaybook.tradeCount === 1 ? '' : 's'}
              {m.mostUsedPlaybook.winRate !== null && (
                <> · {percent(m.mostUsedPlaybook.winRate)} win rate</>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-fg-tertiary">No playbook tagged</div>
        )}
      </Card>

      {/* Decision 3: honest disclosure of MFE coverage. Sub-100% coverage
          renders the "(N of M trades — incomplete)" subtitle; 0/N renders the
          "awaiting intraday data" empty state instead of a misleading $0.00. */}
      <Card
        title="Money left on table"
        subtitle={
          m.moneyLeftCoverage
            ? `${m.moneyLeftCoverage.withMfe} of ${m.moneyLeftCoverage.total} trades — intraday data ${
                m.moneyLeftCoverage.withMfe === m.moneyLeftCoverage.total ? 'complete' : 'incomplete'
              }`
            : undefined
        }
      >
        {m.moneyLeftOnTable !== null ? (
          <div className="font-mono text-2xl font-semibold text-fg-primary tnum">
            {money(m.moneyLeftOnTable)}
          </div>
        ) : (
          <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-3 text-xs">
            <div className="mb-1 uppercase tracking-wider text-gold">Awaiting intraday data</div>
            <div className="text-fg-secondary">
              The day&apos;s trades don&apos;t have intraday excursion data yet.
              Refresh intraday in Deep Analytics to surface this.
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
