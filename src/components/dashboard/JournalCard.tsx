import { useNavigate } from 'react-router-dom'
import { NotebookPen, ArrowRight } from 'lucide-react'

// JOURNAL CARD — a thin, static navigational card to the Journal page. Purely
// presentational: an icon, copy, and a navigate — no data fetch, no hook. Took
// over the journal affordance the Today's Session monolith used to carry (its
// "Open journal" / "Add journal entry" buttons). NotebookPen is the app's
// journal icon (the same one those buttons used); the footer button mirrors the
// EdgeIQ debrief card's "View Full" idiom.
export default function JournalCard() {
  const navigate = useNavigate()

  return (
    <section aria-label="Journal" className="card-premium flex flex-col gap-3 p-4">
      {/* Header — icon */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-3 text-gold">
          <NotebookPen size={15} strokeWidth={2} />
        </span>
      </div>

      {/* Body — title + sub-line */}
      <div className="flex-1">
        <h2 className="text-base font-semibold text-fg-primary">Journal</h2>
        <p className="mt-1 text-sm text-fg-secondary">Review, reflect, and improve.</p>
      </div>

      {/* Footer — open the Journal page */}
      <button
        type="button"
        onClick={() => navigate('/journal')}
        className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-1 text-xs font-semibold text-fg-secondary transition-colors duration-150 ease-out-soft hover:bg-bg-2 hover:text-fg-primary"
      >
        Open journal
        <ArrowRight size={14} strokeWidth={2.25} />
      </button>
    </section>
  )
}
