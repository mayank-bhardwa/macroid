import { useEffect, useState } from 'react'
import { useStore } from './store/store'
import { AuthScreen } from './Auth'
import { TodayTab } from './tabs/Today'
import { TrendsTab } from './tabs/Trends'
import { GroceryTab } from './tabs/Grocery'
import { WorkoutTab } from './tabs/Workout'
import { Settings } from './Settings'
import {
  IconMacros,
  IconGrocery,
  IconGear,
} from './components/icons'

type Tab = 'today' | 'grocery'
type AppMode = 'diet' | 'workout' | 'trends'

const TABS: { id: Tab; label: string; Icon: typeof IconMacros }[] = [
  { id: 'today', label: 'Today', Icon: IconMacros },
  { id: 'grocery', label: 'Grocery', Icon: IconGrocery },
]

export default function App() {
  // Top-level Diet/Workout/Trends mode — a pure UI preference (localStorage
  // only), so it never touches diet data or sync. Diet mode is the existing app.
  const [mode, setMode] = useState<AppMode>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('macroid:mode') : null
    return stored === 'workout' || stored === 'trends' ? stored : 'diet'
  })
  const [tab, setTab] = useState<Tab>('today')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const init = useStore((s) => s.init)
  const auth = useStore((s) => s.auth)
  const syncStatus = useStore((s) => s.syncStatus)
  const [macrosDay, setMacrosDay] = useState<string | null>(null)

  const selectMode = (m: AppMode) => {
    setMode(m)
    try {
      localStorage.setItem('macroid:mode', m)
    } catch {
      /* storage unavailable — keep in-memory */
    }
  }

  useEffect(() => {
    init()
  }, [init])

  // Hard auth gate: nothing in the app is reachable without a session.
  if (!auth) return <AuthScreen />

  const titleSuffix =
    syncStatus === 'syncing' ? '·' : syncStatus === 'error' ? '!' : ''

  return (
    <>
      <header className="app-header">
        <div className="title">
          Macro<b>id</b>
          {titleSuffix && (
            <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> {titleSuffix}</span>
          )}
        </div>
        <div className="mode-switch" role="tablist" aria-label="Section">
          <button
            role="tab"
            aria-selected={mode === 'diet'}
            className={mode === 'diet' ? 'active' : ''}
            onClick={() => selectMode('diet')}
          >
            Diet
          </button>
          <button
            role="tab"
            aria-selected={mode === 'workout'}
            className={mode === 'workout' ? 'active' : ''}
            onClick={() => selectMode('workout')}
          >
            Workout
          </button>
          <button
            role="tab"
            aria-selected={mode === 'trends'}
            className={mode === 'trends' ? 'active' : ''}
            onClick={() => selectMode('trends')}
          >
            Trends
          </button>
        </div>
        <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <IconGear width={22} height={22} />
        </button>
      </header>

      <main className="main-scroll">
        {mode === 'diet' && (
          <>
            {tab === 'today' && (
              <TodayTab externalDay={macrosDay} onConsumeExternalDay={() => setMacrosDay(null)} />
            )}
            {tab === 'grocery' && <GroceryTab />}
          </>
        )}
        {mode === 'trends' && (
          <TrendsTab
            onJump={(d) => {
              setMacrosDay(d)
              setTab('today')
              selectMode('diet')
            }}
          />
        )}
        {mode === 'workout' && <WorkoutTab />}
      </main>

      {mode === 'diet' && !settingsOpen && (
        <nav className="bottom-nav">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
