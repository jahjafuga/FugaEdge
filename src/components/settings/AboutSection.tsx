import { useAppVersion } from '@/lib/useAppVersion'
import Card from '@/components/ui/Card'
import signatureUrl from '@/assets/signaturejahja.png'

// ABOUT SECTION — Settings > About. The founder story + signature, replacing the
// old version chip (the version is preserved as a subtle line at the bottom).
//
// Pure presentation: no direct electron/sqlite/ipc imports. The version comes
// from useAppVersion, the codebase's portable version hook (it falls back to
// "dev" off-Electron), so this survives the future web port. The signature PNG
// is pure black on transparent, invisible on the dark UI, so it is inverted to
// display as clean white.

const PARAGRAPHS: readonly string[] = [
  `I trade small-cap momentum. Before any of this, my journal was a Notion page and a paper notebook sitting next to my keyboard. Screenshots lived in one place, my notes in another, and the numbers nowhere in particular. I could flip through all of it at the end of a week and still not know the one thing I wanted to know: was I getting better, or just getting lucky?`,
  `I looked at the polished journals built for this. They could tell me. But every time I added up what they cost over a year, I kept asking myself the same question. Why am I paying this much? And more than that, what am I getting back for it? The honest answer was: not much that fit me. I was paying a premium for a wide, general tool that treated a small-cap momentum trader and a long-term options seller as the same person, when we are not the same at all.`,
  `That is the thing I kept circling. There is a difference between a tool that does everything and a tool that does your thing.`,
  `Think about a kitchen. You can buy the drawer full of clever gadgets that each do a little, or you can reach for the one chef's knife that does the work beautifully because it was made for exactly that. Think about your own health. You could see a doctor who treats a bit of everything, or the specialist who sees only your condition, all day, every day, and recognizes in two minutes what would take someone else an hour. Think about a suit off the rack against one cut to your own shoulders. Both are suits. Only one disappears the moment you put it on, because it was made for you and nothing else.`,
  `That is what I wanted for my trading. Not a wide journal I had to bend to fit, but a narrow one that already understood the way I trade before I typed a single thing into it.`,
  `So one weekend I started building it. Just for me, just to stop losing track of my own trades. I posted a screenshot in the DTSM community almost without thinking, and people wanted to try it. Then they started telling me what was missing. What would make it click. What they had always wished their own journal did and never got. Somewhere in there it stopped being a thing I made for myself and became a thing we were making together.`,
  `I owe that to a handful of people. To Brendan, who runs DTSM and gave the whole thing a home and a push when it was barely anything. To Dave, who has shaped this app more than almost anyone, trade by trade and report by report. To Edwin, who handed over his Webull files so the import could meet real traders where they are. To Neo, whose ideas kept turning into features. To John, to Pete, and to everyone in the community who used something rough, told me the truth about it, and made it sharper.`,
  `FugaEdge is built around one way of trading: the small-cap momentum approach I learned from Ross Cameron and the DTSM community. It speaks that language out of the box. The setups, the metrics, the discipline that separates a clean day from one you give back. That was always the point. A serious journal for a specific kind of trader, built in the open, and shaped by the people who use it.`,
]

export default function AboutSection() {
  const version = useAppVersion()
  return (
    <Card>
      <article className="mx-auto max-w-[66ch] py-2">
        <h2 className="text-xl font-semibold tracking-tight text-fg-primary">
          Why FugaEdge exists
        </h2>

        <div className="mt-5 space-y-4 text-[15px] leading-[1.7] text-fg-secondary">
          {PARAGRAPHS.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {/* Sign-off. The source PNG is pure black on transparent; invert(1)
            renders it clean white on the near-black surface, alpha preserved. */}
        <img
          src={signatureUrl}
          alt="Jahja's signature"
          className="mt-8 h-auto w-[210px] opacity-90"
          style={{ filter: 'invert(1)' }}
        />

        {/* Version preserved, subtle. */}
        <div className="mt-8 border-t border-border-subtle pt-4 font-mono text-[11px] text-fg-muted">
          FugaEdge v{version}
        </div>
      </article>
    </Card>
  )
}
