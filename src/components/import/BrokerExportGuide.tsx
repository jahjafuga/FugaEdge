import { useState, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { BROKER_REQUEST_URL } from '@/core/import/import-errors'
import { ipc } from '@/lib/ipc'

// DAS Trader export-guide screenshots. Real assets — the @/assets/* pipeline
// is proven by the existing BrandMark icon/logo imports.
import flowAStep1 from '@/assets/help/das/flow-a-step1-trade-menu.png'
import flowAStep2 from '@/assets/help/das/flow-a-step2-reports.png'
import flowAStep3 from '@/assets/help/das/flow-a-step3-export-dialog.png'
import flowBStep1 from '@/assets/help/das/flow-b-step1-trade-menu.png'
import flowBStep2 from '@/assets/help/das/flow-b-step2-account-report.png'
import flowBStep3 from '@/assets/help/das/flow-b-step3-export.png'
import flowCStep1 from '@/assets/help/das/flow-c-step1-trades-panel.png'
import flowCStep2 from '@/assets/help/das/flow-c-step2-context-menu.png'
import flowCStep3 from '@/assets/help/das/flow-c-step3-save-dialog.png'

// ─────────────────────────────────────────────────────────────────────────
// Day 9 Part 2 — in-app broker export guide. SKELETON: layout structure +
// real screenshot imports only. Per-step titles/descriptions are placeholder
// text, filled with the kickoff copy in step 4. Pure presentational — no
// business logic, no IPC beyond the footer's openExternal link.
// ─────────────────────────────────────────────────────────────────────────

interface BrokerExportGuideProps {
  open: boolean
  onClose: () => void
}

type GuideTab = 'das' | 'webull'

export default function BrokerExportGuide({ open, onClose }: BrokerExportGuideProps) {
  const [tab, setTab] = useState<GuideTab>('das')

  return (
    <Modal open={open} onClose={onClose} title="How to export your trades" width={760}>
      {/* Tab strip — DAS Trader / Webull */}
      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        <TabButton label="DAS Trader" active={tab === 'das'} onClick={() => setTab('das')} />
        <TabButton label="Webull" active={tab === 'webull'} onClick={() => setTab('webull')} />
      </div>

      {/* SECTION 1 — DAS Trader: three sub-flows, three steps each */}
      {tab === 'das' && (
        <div className="space-y-8">
          <Flow title="Flow A — Executions CSV">
            <Step n={1} title="Open the Trade menu" img={flowAStep1} imgAlt="DAS Flow A, step 1">
              From the top toolbar, click Trade.
            </Step>
            <Step n={2} title="Click Reports" img={flowAStep2} imgAlt="DAS Flow A, step 2">
              Inside the Trade menu, click Reports.
            </Step>
            <Step n={3} title="Export" img={flowAStep3} imgAlt="DAS Flow A, step 3">
              Tick the Executions box, choose a save path, then click Export.
            </Step>
          </Flow>

          <Flow title="Flow B — Account Report (fees)">
            <Step n={1} title="Open the Trade menu" img={flowBStep1} imgAlt="DAS Flow B, step 1">
              From the top toolbar, click Trade.
            </Step>
            <Step n={2} title="Click Account Report" img={flowBStep2} imgAlt="DAS Flow B, step 2">
              Inside the Trade menu, click Account Report.
            </Step>
            <Step n={3} title="Export" img={flowBStep3} imgAlt="DAS Flow B, step 3">
              In the Account Report window, click Export.
            </Step>
          </Flow>

          <Flow title="Flow C — Trades window CSV">
            <Step n={1} title="Right-click the Trades panel" img={flowCStep1} imgAlt="DAS Flow C, step 1">
              Right-click anywhere inside the Trades window.
            </Step>
            <Step n={2} title="Click Export from the context menu" img={flowCStep2} imgAlt="DAS Flow C, step 2">
              From the menu that appears, click Export.
            </Step>
            <Step n={3} title="Save the CSV" img={flowCStep3} imgAlt="DAS Flow C, step 3">
              Pick a folder, name the file, and click Save.
            </Step>
          </Flow>
        </div>
      )}

      {/* SECTION 2 — Webull: two placeholder sub-sections, screenshots later */}
      {tab === 'webull' && (
        <div className="space-y-8">
          <WebullPlaceholder title="Webull Mobile">
            Screenshots coming soon — for now, see Help on Circle or open an
            issue on GitHub if you need help exporting from the Webull mobile
            app.
          </WebullPlaceholder>
          <WebullPlaceholder title="Webull Desktop">
            Screenshots coming soon — for now, see Help on Circle or open an
            issue on GitHub if you need help exporting from Webull Desktop.
          </WebullPlaceholder>
        </div>
      )}

      {/* Footer — request-a-broker */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border-subtle pt-5">
        <span className="text-sm text-fg-tertiary">Don&apos;t see your broker?</span>
        <button
          type="button"
          onClick={() => ipc.openExternal(BROKER_REQUEST_URL)}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-3 text-xs font-semibold text-fg-secondary transition-colors duration-150 hover:border-gold/50 hover:text-gold"
        >
          Request your broker
          <ExternalLink size={12} strokeWidth={2.25} />
        </button>
      </div>
    </Modal>
  )
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-150 ${
        active
          ? 'border-gold text-gold'
          : 'border-transparent text-fg-tertiary hover:text-fg-secondary'
      }`}
    >
      {label}
    </button>
  )
}

// One DAS sub-flow — a heading over a stack of steps.
function Flow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-fg-primary">{title}</h3>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

// One step — numbered title, screenshot, one-line description (placeholder
// for now; copy filled in step 4).
function Step({
  n,
  title,
  img,
  imgAlt,
  children,
}: {
  n: number
  title: string
  img: string
  imgAlt: string
  children: ReactNode
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/[0.14] text-[10px] font-semibold text-gold">
          {n}
        </span>
        <span className="text-sm font-medium text-fg-primary">{title}</span>
      </div>
      <img
        src={img}
        alt={imgAlt}
        className="mt-3 max-w-full rounded border border-border-subtle"
      />
      <p className="mt-2 text-xs text-fg-tertiary">{children}</p>
    </div>
  )
}

// Webull sub-section — styled empty state. Swapping in 3 real <Step>s once
// the Webull screenshots arrive is a drop-in replacement of the box below.
function WebullPlaceholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-fg-primary">{title}</h3>
      {/* TODO (Webull screenshots): replace this box with three <Step>
          components, identical shape to the DAS flows above. */}
      <div className="flex items-center justify-center rounded-md border border-dashed border-border-strong bg-bg-2 px-6 py-12 text-center text-xs text-fg-tertiary">
        {children}
      </div>
    </section>
  )
}
