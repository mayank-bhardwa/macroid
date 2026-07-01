import { useRef, useState } from 'react'
import { useStore } from './store/store'
import { FALLBACK_PLAN, buildAiPlanTemplate, buildAiPromptText, planMealGroups, DEFAULT_MEAL_GROUPS, ensureMealFiber, ensureGrocery, validateAndRepairPlan, summarizePlan, summarizeBackup } from './lib/plan'
import { DEFAULT_TRAINING_DOW } from './lib/daytype'
import { useToast } from './components/Toast'
import { useInstallPrompt } from './lib/install'
import { useBackButton } from './lib/useBackButton'
import { IconClose, IconPlus, IconTrash, IconChevronUp, IconChevronDown } from './components/icons'
import { Sheet } from './components/Sheet'
import { todayKey, addDays } from './lib/dates'
import { GROCERY_UNITS } from './types'
import type { DayType, GroceryUnit, Plan, PlanGroceryItem, PlanMeal, Targets } from './types'

type Section = 'defaults' | 'sync'

export function Settings({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('defaults')
  useBackButton(true, onClose)
  return (
    <div className="settings-overlay">
      <header className="app-header">
        <div className="title">Settings</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <IconClose width={22} height={22} />
        </button>
      </header>
      <div className="main-scroll" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
        <div className="card tight">
          <div className="segmented">
            <button className={section === 'defaults' ? 'active' : ''} onClick={() => setSection('defaults')}>
              Defaults
            </button>
            <button className={section === 'sync' ? 'active' : ''} onClick={() => setSection('sync')}>
              Sync &amp; Data
            </button>
          </div>
        </div>
        {section === 'defaults' ? <DefaultsPanel /> : <SyncDataPanel />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* DEFAULTS                                                            */
/* ------------------------------------------------------------------ */

function DefaultsPanel() {
  return (
    <>
      <p className="small faint" style={{ margin: '0 4px 12px' }}>
        Factory defaults → your custom plan → your logged records. Editing defaults never touches
        records you&apos;ve already logged.
      </p>
      <TargetsEditor />
      <MealGroupsEditor />
      <TrainingDaysEditor />
      <MealTemplatesEditor />
      <GroceryEditor />
      <ResetEverything />
    </>
  )
}

function useActivePlan(): Plan {
  const custom = useStore((s) => s.customPlan)
  return ensureGrocery(ensureMealFiber(custom ?? FALLBACK_PLAN))
}

// Prompt asking when a freshly saved default should take effect: today,
// tomorrow, or a chosen start date. `onApply` receives the start dayKey.
function ApplyFromSheet({
  open,
  onClose,
  onApply,
  what,
}: {
  open: boolean
  onClose: () => void
  onApply: (startDay: string) => void
  what: string
}) {
  const [date, setDate] = useState(todayKey())
  const pick = (day: string) => {
    onApply(day)
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Apply ${what} from`}>
      <p className="small faint" style={{ marginTop: 0 }}>
        Choose when the updated {what} takes effect. Days before the start date keep their current
        schedule; logged entries are never changed.
      </p>
      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className="btn primary grow" onClick={() => pick(todayKey())}>Today</button>
        <button className="btn grow" onClick={() => pick(addDays(todayKey(), 1))}>Tomorrow</button>
      </div>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="lbl">Or pick a start date</span>
        <input type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="btn-row">
        <button className="btn primary grow" disabled={!date} onClick={() => date && pick(date)}>
          Apply from selected date
        </button>
        <button className="btn ghost" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  )
}

function TargetsEditor() {
  const plan = useActivePlan()
  const setTargets = useStore((s) => s.setTargets)
  const setTargetsFrom = useStore((s) => s.setTargetsFrom)
  const saveCustomPlan = useStore((s) => s.saveCustomPlan)
  const toast = useToast()
  const [which, setWhich] = useState<DayType>('training')
  const planTargets = (w: DayType): Targets =>
    w === 'rest' ? plan.restTargets ?? plan.targets : plan.targets
  const [t, setT] = useState<Targets>(planTargets('training'))
  const [applyOpen, setApplyOpen] = useState(false)

  const switchTo = (w: DayType) => {
    setWhich(w)
    setT(planTargets(w))
  }

  const save = () => {
    if (which === 'rest') saveCustomPlan({ ...plan, restTargets: t })
    else saveCustomPlan({ ...plan, targets: t })
    setTargets(t, which, true)
    toast.show(`${which === 'rest' ? 'Rest' : 'Training'}-day targets saved`)
    setApplyOpen(true)
  }
  const resetFactory = () => {
    const factory = which === 'rest' ? FALLBACK_PLAN.restTargets ?? FALLBACK_PLAN.targets : FALLBACK_PLAN.targets
    setT(factory)
    setTargets(factory, which, true)
    toast.show('Targets reset to factory')
  }

  return (
    <div className="card">
      <div className="card-title">Macro targets</div>
      <p className="small faint" style={{ marginTop: 0 }}>
        Set separate goals for training and rest days. Rest-day goals apply automatically on rest
        days; leave them equal to skip cycling.
      </p>
      <div className="segmented" style={{ marginBottom: 12 }}>
        <button className={which === 'training' ? 'active' : ''} onClick={() => switchTo('training')}>
          Training day
        </button>
        <button className={which === 'rest' ? 'active' : ''} onClick={() => switchTo('rest')}>
          Rest day
        </button>
      </div>
      <div className="grid-2">
        {(['protein', 'carbs', 'fats', 'fiber', 'calories'] as (keyof Targets)[]).map((k) => (
          <label className="field" key={k}>
            <span className="lbl">{k[0].toUpperCase() + k.slice(1)}{k === 'calories' ? ' (kcal)' : ' (g)'}</span>
            <input
              type="number"
              inputMode="numeric"
              value={t[k] ?? 0}
              onChange={(e) => setT({ ...t, [k]: Number(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn primary grow" onClick={save}>
          Save targets
        </button>
        <button className="btn ghost" onClick={resetFactory}>Reset</button>
      </div>
      <ApplyFromSheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        what={`${which === 'rest' ? 'rest' : 'training'}-day macro targets`}
        onApply={(startDay) => setTargetsFrom(t, startDay, which)}
      />
    </div>
  )
}

function MealGroupsEditor() {
  const plan = useActivePlan()
  const saveCustomPlan = useStore((s) => s.saveCustomPlan)
  const applyDefaultsFrom = useStore((s) => s.applyDefaultsFrom)
  const toast = useToast()
  const [groups, setGroups] = useState<string[]>(planMealGroups(plan))
  const [applyOpen, setApplyOpen] = useState(false)

  const move = (i: number, dir: -1 | 1) => {
    setGroups((gs) => {
      const next = [...gs]
      const j = i + dir
      if (j < 0 || j >= next.length) return gs
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const save = () => {
    const cleaned: string[] = []
    const seen = new Set<string>()
    for (const g of groups) {
      const name = g.trim()
      if (!name || seen.has(name.toLowerCase())) continue
      cleaned.push(name)
      seen.add(name.toLowerCase())
    }
    if (cleaned.length === 0) {
      toast.show('Add at least one group')
      return
    }
    // Re-home any meal whose group no longer exists onto the first group so it
    // is never hidden from the Today tab.
    const remap = (meals: typeof plan.dailyMeals.training) =>
      meals.map((m) => (cleaned.includes(m.group) ? m : { ...m, group: cleaned[0] }))
    saveCustomPlan({
      ...plan,
      mealGroups: cleaned,
      dailyMeals: {
        training: remap(plan.dailyMeals.training),
        rest: remap(plan.dailyMeals.rest),
      },
    })
    setGroups(cleaned)
    toast.show('Meal groups saved')
    setApplyOpen(true)
  }

  const resetFactory = () => {
    setGroups([...DEFAULT_MEAL_GROUPS])
    saveCustomPlan({ ...plan, mealGroups: [...DEFAULT_MEAL_GROUPS] })
    toast.show('Meal groups reset')
  }

  return (
    <div className="card">
      <div className="card-title">Meal time groups</div>
      <p className="small faint" style={{ marginTop: 0 }}>
        These are the sections meals are grouped under in the Today tab (e.g. Morning, Afternoon,
        Evening). Order here sets the order shown.
      </p>
      {groups.map((g, i) => (
        <div className="row" key={i} style={{ marginBottom: 8, gap: 6 }}>
          <input
            className="grow"
            value={g}
            placeholder="e.g. Afternoon"
            onChange={(e) => setGroups((gs) => gs.map((x, idx) => (idx === i ? e.target.value : x)))}
          />
          <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
            <IconChevronUp width={18} height={18} />
          </button>
          <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === groups.length - 1} aria-label="Move down">
            <IconChevronDown width={18} height={18} />
          </button>
          <button className="icon-btn" onClick={() => setGroups((gs) => gs.filter((_, idx) => idx !== i))} aria-label="Remove">
            <IconTrash width={18} height={18} />
          </button>
        </div>
      ))}
      <button className="btn sm block" style={{ marginBottom: 12 }} onClick={() => setGroups((gs) => [...gs, ''])}>
        <IconPlus width={16} height={16} /> Add group
      </button>
      <div className="btn-row">
        <button className="btn primary grow" onClick={save}>Save groups</button>
        <button className="btn ghost" onClick={resetFactory}>Reset</button>
      </div>
      <ApplyFromSheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        what="meal groups"
        onApply={(startDay) => applyDefaultsFrom(startDay, 'meals')}
      />
    </div>
  )
}

const WEEKDAYS: { i: number; label: string }[] = [
  { i: 1, label: 'Mon' },
  { i: 2, label: 'Tue' },
  { i: 3, label: 'Wed' },
  { i: 4, label: 'Thu' },
  { i: 5, label: 'Fri' },
  { i: 6, label: 'Sat' },
  { i: 0, label: 'Sun' },
]

function TrainingDaysEditor() {
  const plan = useActivePlan()
  const saveCustomPlan = useStore((s) => s.saveCustomPlan)
  const applyDefaultsFrom = useStore((s) => s.applyDefaultsFrom)
  const toast = useToast()
  const sortDays = (ds: number[]) => [...ds].sort((a, b) => a - b)
  const [days, setDays] = useState<number[]>(() => sortDays(plan.trainingDays ?? DEFAULT_TRAINING_DOW))
  const [applyOpen, setApplyOpen] = useState(false)

  const toggle = (i: number) =>
    setDays((ds) => sortDays(ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))

  const save = () => {
    saveCustomPlan({ ...plan, trainingDays: sortDays(days) })
    toast.show('Workout days saved')
    setApplyOpen(true)
  }
  const resetFactory = () => {
    const factory = sortDays(DEFAULT_TRAINING_DOW)
    setDays(factory)
    saveCustomPlan({ ...plan, trainingDays: factory })
    toast.show('Workout days reset')
  }

  return (
    <div className="card">
      <div className="card-title">Workout days</div>
      <p className="small faint" style={{ marginTop: 0 }}>
        Pick which weekdays are training days — these seed the training meal template; the rest use
        the rest-day template. One-off swaps on the Today tab still override this.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {WEEKDAYS.map((d) => {
          const on = days.includes(d.i)
          return (
            <button
              key={d.i}
              className={`btn sm ${on ? 'primary' : 'ghost'}`}
              aria-pressed={on}
              onClick={() => toggle(d.i)}
            >
              {d.label}
            </button>
          )
        })}
      </div>
      <div className="btn-row">
        <button className="btn primary grow" onClick={save}>Save workout days</button>
        <button className="btn ghost" onClick={resetFactory}>Reset</button>
      </div>      <ApplyFromSheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        what="meal groups"
        onApply={(startDay) => applyDefaultsFrom(startDay, 'meals')}
      />      <ApplyFromSheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        what="workout days"
        onApply={(startDay) => applyDefaultsFrom(startDay, 'meals')}
      />
    </div>
  )
}

function MealTemplatesEditor() {
  const plan = useActivePlan()
  const saveCustomPlan = useStore((s) => s.saveCustomPlan)
  const applyDefaultsFrom = useStore((s) => s.applyDefaultsFrom)
  const toast = useToast()
  const groups = planMealGroups(plan)
  const [type, setType] = useState<'training' | 'rest'>('training')
  const [meals, setMeals] = useState<PlanMeal[]>(plan.dailyMeals[type])
  const [applyOpen, setApplyOpen] = useState(false)

  // keep local list in sync when switching type
  const switchType = (next: 'training' | 'rest') => {
    setType(next)
    setMeals(plan.dailyMeals[next])
  }

  const update = (i: number, patch: Partial<PlanMeal>) => {
    setMeals((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }
  const remove = (i: number) => setMeals((ms) => ms.filter((_, idx) => idx !== i))
  const add = () =>
    setMeals((ms) => [...ms, { slot: 'Snack', group: groups[groups.length - 1] ?? 'Evening', time: '4:00 pm', p: 0, c: 0, f: 0, fb: 0, item: '' }])

  const save = () => {
    const next: Plan = { ...plan, dailyMeals: { ...plan.dailyMeals, [type]: meals } }
    saveCustomPlan(next)
    toast.show(`${type} template saved`)
    setApplyOpen(true)
  }
  const resetFactory = () => {
    const factory = FALLBACK_PLAN.dailyMeals[type]
    setMeals(factory)
    saveCustomPlan({ ...plan, dailyMeals: { ...plan.dailyMeals, [type]: factory } })
    toast.show(`${type} template reset to factory`)
  }

  return (
    <div className="card">
      <div className="card-title">Daily meal templates</div>
      <div className="segmented" style={{ marginBottom: 12 }}>
        <button className={type === 'training' ? 'active' : ''} onClick={() => switchType('training')}>Training</button>
        <button className={type === 'rest' ? 'active' : ''} onClick={() => switchType('rest')}>Rest</button>
      </div>
      {meals.map((m, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
          <div className="grid-2">
            <label className="field" style={{ marginBottom: 8 }}>
              <span className="lbl">Slot</span>
              <input value={m.slot} onChange={(e) => update(i, { slot: e.target.value })} />
            </label>
            <label className="field" style={{ marginBottom: 8 }}>
              <span className="lbl">Time</span>
              <input value={m.time} onChange={(e) => update(i, { time: e.target.value })} />
            </label>
          </div>
          <div className="segmented" style={{ marginBottom: 8 }}>
            {groups.map((g) => (
              <button key={g} className={m.group === g ? 'active' : ''} onClick={() => update(i, { group: g })}>{g}</button>
            ))}
          </div>
          <label className="field" style={{ marginBottom: 8 }}>
            <span className="lbl">Description</span>
            <input value={m.item} onChange={(e) => update(i, { item: e.target.value })} />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field grow" style={{ marginBottom: 0 }}>
              <span className="lbl">P</span>
              <input type="number" inputMode="numeric" value={m.p} onChange={(e) => update(i, { p: Number(e.target.value) || 0 })} />
            </label>
            <label className="field grow" style={{ marginBottom: 0 }}>
              <span className="lbl">C</span>
              <input type="number" inputMode="numeric" value={m.c} onChange={(e) => update(i, { c: Number(e.target.value) || 0 })} />
            </label>
            <label className="field grow" style={{ marginBottom: 0 }}>
              <span className="lbl">F</span>
              <input type="number" inputMode="numeric" value={m.f} onChange={(e) => update(i, { f: Number(e.target.value) || 0 })} />
            </label>
            <label className="field grow" style={{ marginBottom: 0 }}>
              <span className="lbl">Fb</span>
              <input type="number" inputMode="numeric" value={m.fb ?? 0} onChange={(e) => update(i, { fb: Number(e.target.value) || 0 })} />
            </label>
            <button className="icon-btn" onClick={() => remove(i)} aria-label="Remove meal" style={{ marginTop: 14 }}>
              <IconTrash width={18} height={18} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn sm block" style={{ marginBottom: 12 }} onClick={add}>
        <IconPlus width={16} height={16} /> Add meal row
      </button>
      <div className="btn-row">
        <button className="btn primary grow" onClick={save}>Save template</button>
        <button className="btn ghost" onClick={resetFactory}>Reset</button>
      </div>
      <ApplyFromSheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        what={`${type} meals`}
        onApply={(startDay) => applyDefaultsFrom(startDay, 'meals')}
      />
    </div>
  )
}

function GroceryEditor() {
  const plan = useActivePlan()
  const saveCustomPlan = useStore((s) => s.saveCustomPlan)
  const toast = useToast()
  const [rows, setRows] = useState<PlanGroceryItem[]>(plan.grocery)

  const update = (i: number, patch: Partial<PlanGroceryItem>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const save = () => {
    const cleaned = rows
      .map((r) => ({ name: r.name.trim(), qty: Math.max(0, r.qty), unit: r.unit }))
      .filter((r) => r.name)
    saveCustomPlan({ ...plan, grocery: cleaned })
    setRows(cleaned)
    toast.show('Grocery list saved')
  }
  const resetFactory = () => {
    setRows(FALLBACK_PLAN.grocery)
    saveCustomPlan({ ...plan, grocery: FALLBACK_PLAN.grocery })
    toast.show('Grocery list reset')
  }

  return (
    <div className="card">
      <div className="card-title">Monthly grocery list</div>
      <p className="small faint" style={{ marginTop: 0 }}>
        The default shopping list seeded into the Grocery tab each month — every item to buy with the
        quantity needed for the month. After editing, tap “Reset to plan list” in the Grocery tab to
        refresh the current month.
      </p>
      {rows.map((r, i) => (
        <div className="row" key={i} style={{ marginBottom: 8, gap: 6 }}>
          <input
            className="grow"
            value={r.name}
            placeholder="Item"
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            style={{ width: 64 }}
            value={r.qty}
            aria-label="Quantity"
            onChange={(e) => update(i, { qty: Number(e.target.value) || 0 })}
          />
          <select
            value={r.unit}
            aria-label="Unit"
            style={{ width: 88 }}
            onChange={(e) => update(i, { unit: e.target.value as GroceryUnit })}
          >
            {GROCERY_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} aria-label="Remove">
            <IconTrash width={18} height={18} />
          </button>
        </div>
      ))}
      <button className="btn sm block" style={{ marginBottom: 12 }} onClick={() => setRows((rs) => [...rs, { name: '', qty: 1, unit: 'kg' }])}>
        <IconPlus width={16} height={16} /> Add item
      </button>
      <div className="btn-row">
        <button className="btn primary grow" onClick={save}>Save grocery list</button>
        <button className="btn ghost" onClick={resetFactory}>Reset</button>
      </div>
    </div>
  )
}

function ResetEverything() {
  const resetEverything = useStore((s) => s.resetEverything)
  const toast = useToast()
  return (
    <div className="card">
      <div className="card-title">Danger zone</div>
      <button
        className="btn danger block"
        onClick={() => {
          if (window.confirm('Reset EVERYTHING? This restores all defaults and re-seeds the current day and month. Logged records will be cleared.')) {
            resetEverything()
            toast.show('Everything reset to defaults')
          }
        }}
      >
        Reset everything
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SYNC & DATA                                                        */
/* ------------------------------------------------------------------ */

function SyncDataPanel() {
  return (
    <>
      <AccountCard />
      <PlanJsonCard />
      <BackupCard />
      <InstallCard />
    </>
  )
}

function AccountCard() {
  const auth = useStore((s) => s.auth)
  const register = useStore((s) => s.register)
  const login = useStore((s) => s.login)
  const logout = useStore((s) => s.logout)
  const setAutoSync = useStore((s) => s.setAutoSync)
  const syncNow = useStore((s) => s.syncNow)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncMessage = useStore((s) => s.syncMessage)
  const lastSyncAt = useStore((s) => s.lastSyncAt)
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.show(ok)
    } catch (e) {
      toast.show((e as Error).message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (auth) {
    return (
      <div className="card">
        <div className="card-title">Account</div>
        <div className="list-row">
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{auth.user.email}</div>
            <div className="tiny faint">
              {syncStatus === 'syncing' ? 'Syncing…' : syncMessage || (lastSyncAt ? `Last sync ${new Date(lastSyncAt).toLocaleTimeString()}` : 'Signed in')}
            </div>
          </div>
        </div>
        <div className="list-row">
          <span className="grow">Auto-sync</span>
          <button className={`switch${auth.autoSync ? ' on' : ''}`} onClick={() => setAutoSync(!auth.autoSync)} aria-label="Toggle auto-sync" />
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn primary grow" disabled={busy} onClick={() => run(() => syncNow(), 'Synced')}>
            Sync now
          </button>
          <button className="btn danger" disabled={busy} onClick={() => run(() => logout(), 'Signed out')}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">Account &amp; cloud sync</div>
      <p className="small faint" style={{ marginTop: 0 }}>
        Optional. The app works fully offline without an account. Sign in to sync across devices.
      </p>
      <label className="field">
        <span className="lbl">Email</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span className="lbl">Password (min 8 chars)</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="field">
        <span className="lbl">API base URL (optional)</span>
        <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="same-origin by default" />
      </label>
      <div className="btn-row">
        <button className="btn primary grow" disabled={busy || !email || password.length < 8} onClick={() => run(() => login(email.trim(), password, apiBase.trim() || undefined), 'Signed in')}>
          Sign in
        </button>
        <button className="btn grow" disabled={busy || !email || password.length < 8} onClick={() => run(() => register(email.trim(), password, apiBase.trim() || undefined), 'Account created')}>
          Register
        </button>
      </div>
    </div>
  )
}

function ConfirmImportSheet({
  open,
  onClose,
  title,
  summary,
  warnings,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  summary: string[]
  warnings: string[]
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="small" style={{ marginBottom: 12 }}>
        {summary.map((s, i) => (
          <div key={i} className="faint" style={{ marginBottom: 3 }}>{s}</div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="card tight" style={{ borderColor: 'var(--warn)', marginBottom: 12 }}>
          <div className="small" style={{ color: 'var(--warn)', fontWeight: 700, marginBottom: 6 }}>
            {warnings.length} issue{warnings.length > 1 ? 's' : ''} auto-fixed
          </div>
          {warnings.map((w, i) => (
            <div key={i} className="tiny faint" style={{ marginBottom: 3 }}>• {w}</div>
          ))}
        </div>
      )}
      <div className="btn-row">
        <button className="btn primary grow" onClick={onConfirm}>{confirmLabel}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

function PlanJsonCard() {
  const importPlan = useStore((s) => s.importPlan)
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ plan: Plan; warnings: string[] } | null>(null)

  const onFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text())
      // Guard: a local-backup file ({ version, data }) is not a plan. Without
      // this, plan validation would "repair" it into an empty factory plan and
      // silently discard the user's logs. Steer them to the right importer.
      if (raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' && !raw.dailyMeals && !raw.plan) {
        toast.show('That looks like a backup file — use Local backup → Import JSON instead')
        return
      }
      const { plan, warnings } = validateAndRepairPlan(raw)
      setPending({ plan, warnings })
    } catch (e) {
      toast.show((e as Error).message || 'Invalid plan file')
    }
  }

  const confirmImport = () => {
    if (!pending) return
    importPlan(pending.plan)
    toast.show('Plan imported')
    setPending(null)
  }

  const downloadTemplate = () => {
    const blob = new Blob([JSON.stringify(FALLBACK_PLAN, null, 2)], { type: 'application/json' })
    triggerDownload(blob, 'macroid-plan-template.json')
  }

  const downloadAiTemplate = () => {
    const blob = new Blob([JSON.stringify(buildAiPlanTemplate(), null, 2)], { type: 'application/json' })
    triggerDownload(blob, 'macroid-ai-plan-template.json')
  }

  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildAiPromptText())
      toast.show('AI prompt copied to clipboard')
    } catch {
      toast.show('Could not copy — try the download instead')
    }
  }

  return (
    <div className="card">
      <div className="card-title">Plan JSON</div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />
      <p className="small faint" style={{ marginTop: 0 }}>
        Build a plan with AI: download the template (or copy the prompt), describe your goal in the
        <code> goal </code> field, let any AI agent fill it, then import the result here.
      </p>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <button className="btn primary grow" onClick={downloadAiTemplate}>AI template</button>
        <button className="btn grow" onClick={copyAiPrompt}>Copy AI prompt</button>
      </div>
      <div className="btn-row">
        <button className="btn grow" onClick={() => fileRef.current?.click()}>Import plan</button>
        <button className="btn grow" onClick={downloadTemplate}>Current plan</button>
      </div>
      <ConfirmImportSheet
        open={!!pending}
        onClose={() => setPending(null)}
        title="Import this plan?"
        summary={pending ? summarizePlan(pending.plan) : []}
        warnings={pending?.warnings ?? []}
        confirmLabel="Import plan"
        onConfirm={confirmImport}
      />
    </div>
  )
}

function BackupCard() {
  const exportState = useStore((s) => s.exportState)
  const importState = useStore((s) => s.importState)
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ text: string; summary: string[]; warnings: string[] } | null>(null)

  const doExport = () => {
    const blob = new Blob([exportState()], { type: 'application/json' })
    triggerDownload(blob, `macroid-backup-${todayKey()}.json`)
  }
  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { data?: unknown; customPlan?: unknown }
      if (!parsed || typeof parsed !== 'object' || !parsed.data) {
        throw new Error('Not a Macroid backup file')
      }
      const { summary, warnings } = summarizeBackup(parsed)
      setPending({ text, summary, warnings })
    } catch (e) {
      toast.show((e as Error).message || 'Invalid backup')
    }
  }
  const confirmImport = () => {
    if (!pending) return
    try {
      importState(pending.text)
      toast.show('Backup imported')
    } catch (e) {
      toast.show((e as Error).message || 'Invalid backup')
    }
    setPending(null)
  }

  return (
    <div className="card">
      <div className="card-title">Local backup</div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />
      <div className="btn-row">
        <button className="btn grow" onClick={doExport}>Export JSON</button>
        <button className="btn grow" onClick={() => fileRef.current?.click()}>Import JSON</button>
      </div>
      <ConfirmImportSheet
        open={!!pending}
        onClose={() => setPending(null)}
        title="Restore this backup?"
        summary={pending?.summary ?? []}
        warnings={pending?.warnings ?? []}
        confirmLabel="Restore backup"
        onConfirm={confirmImport}
      />
    </div>
  )
}

function InstallCard() {
  const { canInstall, promptInstall, installed } = useInstallPrompt()
  const toast = useToast()

  // iOS Safari never fires `beforeinstallprompt` — install there is always the
  // manual Share → Add to Home Screen flow, so the native button won't appear.
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      // iPadOS reports as Mac but has touch.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  // Install requires a secure context. A plain-HTTP LAN address such as
  // http://192.168.x.x:5173 silently disables it — only HTTPS or localhost work.
  const secure = typeof window === 'undefined' ? true : window.isSecureContext

  return (
    <div className="card">
      <div className="card-title">Install app</div>
      {installed ? (
        <div className="small faint">Macroid is installed and running standalone. 🎉</div>
      ) : (
        <>
          {canInstall && (
            <button
              className="btn primary block"
              onClick={async () => {
                const ok = await promptInstall()
                if (!ok) toast.show('Install dismissed')
              }}
              style={{ marginBottom: 10 }}
            >
              Install Macroid
            </button>
          )}
          {!secure && (
            <div className="small" style={{ color: 'var(--warn)', marginBottom: 8 }}>
              This page isn’t on a secure origin, so the browser won’t offer install.
              Open it over <b>HTTPS</b> (e.g. a forwarded tunnel URL) or <b>localhost</b> —
              a plain <code>http://…:5173</code> address is blocked.
            </div>
          )}
          {!canInstall && (
            <div className="small faint">
              {isIOS ? (
                <>
                  <b>iPhone / iPad (Safari):</b> tap the <b>Share</b> icon, then{' '}
                  <b>Add to Home Screen</b>. (Safari has no install button — this is the only way.)
                </>
              ) : (
                <>
                  <b>Android (Chrome):</b> ⋮ menu → <b>Install app</b> / <b>Add to Home screen</b>.<br />
                  <b>iPhone (Safari):</b> Share → Add to Home Screen.<br />
                  {secure && 'If you don’t see the button yet, reload once so the service worker can register.'}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
