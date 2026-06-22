import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import PageShell from './components/layout/PageShell'
import Skeleton from './components/ui/Skeleton'
import Dashboard from './pages/Dashboard'

// Dashboard is the landing route — eager. The remaining eight pages are
// lazy-loaded so the cold-launch JS bundle is just chrome + dashboard.
// Each chunk is fetched the first time its route is visited; subsequent
// visits are warm.
const Trades    = lazy(() => import('./pages/Trades'))
const Calendar  = lazy(() => import('./pages/Calendar'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Intelligence = lazy(() => import('./pages/Intelligence'))
const Playbook  = lazy(() => import('./pages/Playbook'))
const Journal   = lazy(() => import('./pages/Journal'))
const Import    = lazy(() => import('./pages/Import'))
const Profile   = lazy(() => import('./pages/Profile'))
const Settings  = lazy(() => import('./pages/Settings'))

function RouteFallback() {
  // Skeletons sized close to the most common page shape so the swap doesn't
  // jolt the layout. Renders inside the AppLayout outlet.
  return (
    <PageShell>
      <div className="space-y-4">
        <Skeleton className="h-9 w-[280px]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px]" />
          ))}
        </div>
        <Skeleton className="h-[260px]" />
      </div>
    </PageShell>
  )
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trades"    element={<Lazy><Trades /></Lazy>} />
        <Route path="/calendar"  element={<Lazy><Calendar /></Lazy>} />
        <Route path="/analytics" element={<Lazy><Analytics /></Lazy>} />
        <Route path="/intelligence" element={<Lazy><Intelligence /></Lazy>} />
        <Route path="/playbook"  element={<Lazy><Playbook /></Lazy>} />
        <Route path="/journal"   element={<Lazy><Journal /></Lazy>} />
        <Route path="/import"    element={<Lazy><Import /></Lazy>} />
        <Route path="/profile"   element={<Lazy><Profile /></Lazy>} />
        <Route path="/settings"  element={<Lazy><Settings /></Lazy>} />
      </Route>
    </Routes>
  )
}
