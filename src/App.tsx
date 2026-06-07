import { useEffect, useState } from 'react'
import { useStore } from './store/store'
import { AuthScreen } from './Auth'
import { MacrosTab } from './tabs/Macros'
import { TrendsTab } from './tabs/Trends'
import { PrepTab } from './tabs/Prep'
import { GroceryTab } from './tabs/Grocery'
import { Settings } from './Settings'
import {
  IconMacros,
  IconTrends,
  IconPrep,
  IconGrocery,
  IconGear,
} from './components/icons'

type Tab = 'macros' | 'trends' | 'prep' | 'grocery'

const TABS: { id: Tab; label: string; Icon: typeof IconMacros }[] = [
  { id: 'macros', label: 'Macros', Icon: IconMacros },
  { id: 'prep', label: 'Prep', Icon: IconPrep },
  { id: 'trends', label: 'Trends', Icon: IconTrends },
  { id: 'grocery', label: 'Grocery', Icon: IconGrocery },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('macros')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const init = useStore((s) => s.init)
  const auth = useStore((s) => s.auth)
  const syncStatus = useStore((s) => s.syncStatus)
  const [macrosDay, setMacrosDay] = useState<string | null>(null)

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
        <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <IconGear width={22} height={22} />
        </button>
      </header>

      <main className="main-scroll">
        {tab === 'macros' && (
          <MacrosTab externalDay={macrosDay} onConsumeExternalDay={() => setMacrosDay(null)} />
        )}
        {tab === 'trends' && <TrendsTab onJump={(d) => { setMacrosDay(d); setTab('macros') }} />}
        {tab === 'prep' && <PrepTab />}
        {tab === 'grocery' && <GroceryTab />}
      </main>

      {!settingsOpen && (
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
