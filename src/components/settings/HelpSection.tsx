import { ArrowUpRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import CommunityCard from '@/components/community/CommunityCard'
import { ipc } from '@/lib/ipc'
import { BUGS_URL, FEATURE_REQUEST_URL, SOCIALS } from '@/config/community'

// HELP SECTION — Settings > Help. Three stacked surfaces: the Discord community
// hero + a socials row, a Support card (feature requests + bugs routed to the
// matching Discord channels), and a verbatim FAQ.
//
// Display-only and portable: no electron/fs/sqlite. External links go through
// ipc.openExternal (the same IPC the rest of the app uses); every URL lives in
// config (community.ts), never hardcoded here.

// Restrained external-link button — the shared idiom for socials + support.
function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <button
      type="button"
      onClick={() => void ipc.openExternal(url)}
      className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors duration-150 hover:border-gold hover:text-gold"
    >
      {label}
      <ArrowUpRight size={12} strokeWidth={2.25} />
    </button>
  )
}

// FAQ copy is approved public text — rendered verbatim. Multi-paragraph answers
// are modeled as a string[] so each paragraph gets its own <p>.
const FAQ: ReadonlyArray<{
  section: string
  items: ReadonlyArray<{ q: string; a: readonly string[] }>
}> = [
  {
    section: 'Getting started',
    items: [
      {
        q: `How do I import my trades?`,
        a: [
          `FugaEdge reads CSV (and some XLSX) files exported from your broker. Drop your file onto the Import page and FugaEdge auto-detects the format and brings your trades in. Imports always append - bringing in a new file never overwrites or deletes what's already there, so you can import day-by-day or in batches without losing history.`,
        ],
      },
      {
        q: `Which brokers does FugaEdge support?`,
        a: [
          `Currently: DAS Trader, Webull, Ocean One, TradeZero, Lightspeed, and ThinkorSwim. If your broker isn't listed, you can request it (see Support) - more are being added.`,
        ],
      },
      {
        q: `Do I need a Polygon or FMP API key?`,
        a: [
          `These are optional, and both are completely free. FugaEdge journals your trades fully without them - but adding them lets FugaEdge automatically enrich each trade with extra market data: Polygon supplies price and float data, and FMP (Financial Modeling Prep) supplies float, sector, and industry. Both offer free API keys, and you can add them anytime in Settings > Market data.`,
          `Worth knowing: these keys are only needed in the current desktop beta, because FugaEdge runs on your own computer and fetches market data directly. When FugaEdge becomes a web app, the server will handle all of that - so neither key will matter, and you won't need to set anything up. For now, in the beta, your own free keys are how the enrichment works.`,
        ],
      },
    ],
  },
  {
    section: 'Your data',
    items: [
      {
        q: `Where is my data stored?`,
        a: [
          `Everything lives in a local database file on your own computer. There's no FugaEdge account and no cloud sync - your trades, notes, and settings stay on your machine. You can see the exact location of your database file anytime in Settings > Data & storage. (The only thing that ever leaves your computer is the market-data lookups to Polygon and FMP, if you've added those keys - and that's just the ticker and date being enriched, never your P&L or notes.)`,
        ],
      },
      {
        q: `Is my trading data private?`,
        a: [
          `Yes. FugaEdge stores your journal locally on your device - there's no account, no cloud, and no one else can see your trades. Your actual trading performance never leaves your machine.`,
        ],
      },
      {
        q: `How do I back up my journal?`,
        a: [
          `Settings > Data & storage lets you export your trades and back up your database. Because your data is local, backing up is your responsibility - there's no automatic cloud backup yet.`,
        ],
      },
      {
        q: `What does "Reset journal" do?`,
        a: [
          `It sets your current journal aside as a dated file and starts you fresh. Your old data isn't destroyed - it's saved aside - but recovery is manual, so use it carefully.`,
        ],
      },
    ],
  },
]

export default function HelpSection() {
  return (
    <div className="space-y-5">
      {/* Community — the Discord hero card + a compact socials row */}
      <div className="space-y-3">
        <CommunityCard />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Follow
          </span>
          {SOCIALS.map((s) => (
            <LinkButton key={s.label} label={s.label} url={s.url} />
          ))}
        </div>
      </div>

      {/* Support — feature requests + bugs routed to the matching Discord channels */}
      <Card title="Support" subtitle="Request a feature or report a bug in our Discord.">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <LinkButton label="Feature Request" url={FEATURE_REQUEST_URL} />
            <LinkButton label="Bugs" url={BUGS_URL} />
          </div>
          <p className="text-xs text-fg-tertiary">
            New here? Import your trades from the Import page to get started.
          </p>
        </div>
      </Card>

      {/* FAQ — approved copy, verbatim */}
      <Card title="FAQ" subtitle="Common questions.">
        <div className="space-y-5">
          {FAQ.map((group) => (
            <div key={group.section} className="space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                {group.section}
              </div>
              <div className="divide-y divide-border-subtle">
                {group.items.map((item) => (
                  <div key={item.q} className="py-3 first:pt-0 last:pb-0">
                    <h4 className="text-sm font-semibold text-fg-primary">{item.q}</h4>
                    <div className="mt-1.5 space-y-2">
                      {item.a.map((para, i) => (
                        <p key={i} className="text-sm leading-relaxed text-fg-secondary">
                          {para}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
