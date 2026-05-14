import { ArrowUpRight, Bell, MessageCircle, Sparkles, Users } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { DISCORD_INVITE_URL, hasCommunityLink } from '@/config/community'

// COMMUNITY CARD — shared by Settings and the Onboarding final step.
// Gold left-accent stripe, FugaEdge-tinted body, Discord brand purple
// reserved for the icon stroke only (per the spec). Hides itself when
// the invite URL is empty — single guard at the top.
//
// Click → main process shell.openExternal(URL) via IPC. The handler
// rejects non-http(s) schemes defensively so a stale config can't
// trigger a protocol launch.

interface CommunityCardProps {
  /** Compact variant for the onboarding step (less vertical real estate). */
  compact?: boolean
}

const DISCORD_BLURPLE = '#5865F2'

export default function CommunityCard({ compact = false }: CommunityCardProps) {
  if (!hasCommunityLink()) return null

  const open = () => {
    void ipc.openExternal(DISCORD_INVITE_URL)
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border-subtle border-l-2 border-l-gold bg-bg-2 p-4 shadow-sm sm:flex-row sm:items-stretch sm:gap-4"
    >
      <div className="flex shrink-0 items-start gap-3 sm:flex-col sm:items-center sm:justify-center sm:gap-2 sm:border-r sm:border-border-subtle sm:pr-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg-3"
          style={{ color: DISCORD_BLURPLE }}
          aria-hidden="true"
        >
          <MessageCircle size={20} strokeWidth={2} />
        </span>
        {!compact && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary sm:text-center">
            Community
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-fg-primary">
          Join the FugaEdge community
        </h3>
        <p className="mt-1 text-sm text-fg-secondary">
          Connect with momentum day-traders. Share setups, recaps, and grow
          together.
        </p>
        {!compact && (
          <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-fg-secondary sm:grid-cols-2">
            <Perk Icon={Bell}      text="Share daily trade recaps" />
            <Perk Icon={Sparkles}  text="Get feedback on A+ setups" />
            <Perk Icon={Users}     text="Request features, report bugs" />
            <Perk Icon={MessageCircle} text="Build accountability streaks" />
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={open}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-3 text-[11px] font-semibold uppercase tracking-widest text-accent-ink transition-colors duration-150 hover:bg-gold-hover"
          >
            Open Discord
            <ArrowUpRight size={13} strokeWidth={2.25} />
          </button>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
            opens in your browser
          </span>
        </div>
      </div>
    </div>
  )
}

function Perk({ Icon, text }: { Icon: typeof Bell; text: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <Icon size={11} strokeWidth={2} className="shrink-0 text-gold/80" />
      <span>{text}</span>
    </li>
  )
}
