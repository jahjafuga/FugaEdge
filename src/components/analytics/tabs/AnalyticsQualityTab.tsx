import Card from '@/components/ui/Card'
import SectionHeader from '@/components/ui/SectionHeader'
import QualityTab from '@/components/reports/QualityTab'
import WinLossDaysTable from '@/components/reports/WinLossDaysTable'
import DrawdownSection from '@/components/reports/DrawdownSection'
import type { ReportsData } from '@shared/reports-types'

interface AnalyticsQualityTabProps {
  reports: ReportsData
}

// Migration move 1 — the Analytics "Quality" tab. Composes the three existing
// self-contained Reports surfaces (system-quality stats, win/loss days,
// drawdown) into one consistency/quality unit. Functional re-home only: it
// reuses the components as-is and reads them off the `reports` payload Analytics
// already fetches — no backend, IPC, type, or data-wiring change. Reports →
// Quality stays live and untouched until Reports is retired in a later beat.
export default function AnalyticsQualityTab({ reports }: AnalyticsQualityTabProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Quality"
        description="Edge reliability — system quality, consistency, and drawdown."
      />

      {/* System-quality stats (SQN, Kelly, K-Ratio, hold time, MAE/MFE). Self-
          framed — renders its own grid of cards from reports.fullStats. */}
      <QualityTab data={reports} />

      <Card
        title="Win vs loss days"
        subtitle="Day-by-day breakdown. Green rows = green days, red rows = red days."
        hover
      >
        <WinLossDaysTable days={reports.winLossDays} />
      </Card>

      <Card
        title="Drawdown"
        subtitle="Worst peak-to-trough decline plus equity curve."
        hover
      >
        <DrawdownSection drawdown={reports.drawdown} />
      </Card>
    </div>
  )
}
