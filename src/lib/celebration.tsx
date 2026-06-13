import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import CelebrationBurst from '@/components/ui/CelebrationBurst'

// v0.2.5 Phase B Session 6 (R1) — app-level celebration. ONE fixed full-
// viewport overlay (portalled to body, z-50 → above page content, below
// modals at z-[60]), fired via fire(). A completion is a page-wide moment
// (XP / level / badge / streak all react), so it owns a page-level burst;
// it's reused as-is by level-ups and equity milestones. Modal-local moments
// (the weekly button) render their OWN CelebrationBurst inside the modal's
// stacking context (an app-level z-50 overlay would sit behind a z-[60] modal).

interface CelebrationContextValue {
  /** Fire the page-level celebration overlay. */
  fire: () => void
}

const CelebrationContext = createContext<CelebrationContextValue>({
  fire: () => {},
})

export function useCelebration(): CelebrationContextValue {
  return useContext(CelebrationContext)
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [trigger, setTrigger] = useState(0)
  const fire = useCallback(() => setTrigger((t) => t + 1), [])

  return (
    <CelebrationContext.Provider value={{ fire }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-50">
          <CelebrationBurst trigger={trigger} />
        </div>,
        document.body,
      )}
    </CelebrationContext.Provider>
  )
}
