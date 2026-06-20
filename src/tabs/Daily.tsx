import { useState } from 'react'
import { useStore } from '../store/store'
import { effectiveDayType } from '../lib/daytype'
import { planMealGroups, DEFAULT_MEAL_GROUPS } from '../lib/plan'
import { Sheet } from '../components/Sheet'
import { haptic } from '../lib/haptics'
import {
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconPlus,
} from '../components/icons'
import {
  todayKey,
  addDays,
  formatDayLabel,
  formatFullDate,
  isToday,
  isEditableDay,
  isPast,
} from '../lib/dates'
import type { DailyMeal } from '../types'

export function DailyTab() {
  const [day, setDay] = useState(todayKey())
  const data = useStore((s) => s.data)
  const plan = useStore((s) => s.plan)
  const getDayMeals = useStore((s) => s.getDayMeals)
  const togglePrepared = useStore((s) => s.togglePrepared)
  const addCustomMeal = useStore((s) => s.addCustomMeal)

  const editable = isEditableDay(day)
  const meals = getDayMeals(day)
  const { type, overridden } = effectiveDayType(day, data.dayOverrides, plan.trainingDays)

  // Configured groups, plus any group present on this day's meals that isn't
  // in the plan (so a renamed/removed group never hides logged meals).
  const groups = planMealGroups(plan)
  const renderGroups = [...groups]
  if (meals) {
    for (const m of meals) {
      if (m.group && !renderGroups.includes(m.group)) renderGroups.push(m.group)
    }
  }
  const customMealGroups = groups.length ? groups : DEFAULT_MEAL_GROUPS

  return (
    <>
      <div className="card tight" style={{ marginBottom: 14 }}>
        <div className="stepper">
          <button className="round-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
            <IconChevronLeft width={20} height={20} />
          </button>
          <button className="col grow" style={{ alignItems: 'center' }} onClick={() => setDay(todayKey())}>
            <div className="label">{isToday(day) ? 'Today' : formatDayLabel(day)}</div>
            <div className="tiny faint" style={{ marginTop: 1 }}>{formatFullDate(day)}</div>
            <div className="row tiny" style={{ gap: 6, marginTop: 3 }}>
              <span className={`badge ${type}`}>{type === 'training' ? 'Training day' : 'Rest day'}</span>
              {overridden && <span className="badge swapped">swapped</span>}
            </div>
          </button>
          <button className="round-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
            <IconChevronRight width={20} height={20} />
          </button>
        </div>
      </div>

      {meals == null ? (
        <div className="card">
          <div className="empty">
            <div className="big">📭</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No record for this day</div>
            <div className="small">Past days without logged data stay empty.</div>
          </div>
        </div>
      ) : (
        <>
          {renderGroups.map((g) => (
            <MealGroup
              key={g}
              title={g}
              meals={meals.filter((m) => m.group === g)}
              editable={editable}
              onPrepared={(id) => { togglePrepared(day, id); haptic(10) }}
            />
          ))}

          <AddCustomMeal editable={editable} groups={customMealGroups} onAdd={(m) => addCustomMeal(day, m)} />
          {!editable ? (
            <div className="faint tiny" style={{ textAlign: 'center', marginTop: 4 }}>
              {isPast(day) ? 'Viewing a past day (read-only)' : 'Upcoming day preview (read-only)'}
            </div>
          ) : !isToday(day) ? (
            <div className="faint tiny" style={{ textAlign: 'center', marginTop: 4 }}>
              Editing yesterday — catch up on anything you missed
            </div>
          ) : null}
        </>
      )}
    </>
  )
}

function MealGroup({
  title,
  meals,
  editable,
  onPrepared,
}: {
  title: string
  meals: DailyMeal[]
  editable: boolean
  onPrepared: (id: string) => void
}) {
  if (meals.length === 0) return null
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {meals.map((m) => (
        <div className="list-row" key={m.id} style={{ alignItems: 'flex-start' }}>
          <button
            className={`toggle${m.done ? ' on' : ''}`}
            disabled={!editable}
            onClick={() => onPrepared(m.id)}
            aria-label="Mark prepared"
          >
            {m.done && <IconCheck width={16} height={16} />}
          </button>
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{m.slot}</span>
              <span className="tiny faint">{m.time}</span>
              {m.custom && <span className="badge custom">Custom</span>}
              {m.eaten && <span className="badge training">Eaten</span>}
            </div>
            <div className="small" style={{ color: m.done ? 'var(--text-faint)' : 'var(--text)', textDecoration: m.done ? 'line-through' : 'none' }}>
              {m.text}
            </div>
            <div className="tiny faint">P{m.p} · C{m.c} · F{m.f}{m.fb ? ` · Fb${m.fb}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AddCustomMeal({
  editable,
  groups,
  onAdd,
}: {
  editable: boolean
  groups: string[]
  onAdd: (m: { slot: string; time: string; text: string; p: number; c: number; f: number; fb: number; group: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [slot, setSlot] = useState('Snack')
  const [time, setTime] = useState('4:00 pm')
  const [text, setText] = useState('')
  const [group, setGroup] = useState<string>(groups[groups.length - 1] ?? 'Evening')
  const [p, setP] = useState('')
  const [c, setC] = useState('')
  const [f, setF] = useState('')
  const [fb, setFb] = useState('')

  return (
    <>
      <button className="btn block" disabled={!editable} onClick={() => setOpen(true)} style={{ marginBottom: 14 }}>
        <IconPlus width={18} height={18} /> Add custom meal
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add custom meal">
        <div className="grid-2">
          <label className="field">
            <span className="lbl">Slot</span>
            <input value={slot} onChange={(e) => setSlot(e.target.value)} />
          </label>
          <label className="field">
            <span className="lbl">Time</span>
            <input value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="lbl">Group</span>
          <div className="segmented">
            {groups.map((g) => (
              <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>{g}</button>
            ))}
          </div>
        </label>
        <label className="field">
          <span className="lbl">Description</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Boiled eggs + toast" />
        </label>
        <div className="grid-4">
          <label className="field"><span className="lbl">P (g)</span><input type="number" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} /></label>
          <label className="field"><span className="lbl">C (g)</span><input type="number" inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} /></label>
          <label className="field"><span className="lbl">F (g)</span><input type="number" inputMode="numeric" value={f} onChange={(e) => setF(e.target.value)} /></label>
          <label className="field"><span className="lbl">Fb (g)</span><input type="number" inputMode="numeric" value={fb} onChange={(e) => setFb(e.target.value)} /></label>
        </div>
        <div className="faint tiny" style={{ marginBottom: 10 }}>Custom meals are marked prepared and eaten, and logged to your macros right away.</div>
        <button
          className="btn primary block"
          disabled={!text.trim()}
          onClick={() => {
            onAdd({ slot, time, text: text.trim(), group, p: Number(p) || 0, c: Number(c) || 0, f: Number(f) || 0, fb: Number(fb) || 0 })
            setText('')
            setP(''); setC(''); setF(''); setFb('')
            setOpen(false)
          }}
        >
          Add to schedule
        </button>
      </Sheet>
    </>
  )
}
