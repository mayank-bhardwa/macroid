import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { Ring } from '../components/Ring'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { haptic } from '../lib/haptics'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconMinus,
  IconWater,
  IconTrash,
  IconCheck,
  IconDaily,
  IconBox,
  IconSwap,
} from '../components/icons'
import {
  sumEntries,
  goalStatus,
  effectiveTargets,
  entryCalories,
  deriveCalories,
} from '../lib/macros'
import { resolveFoodMacros, scaleMacros, roundMacros, isRecipe } from '../lib/food'
import { effectiveDayType } from '../lib/daytype'
import { BODY_FIELDS, MEASURE_FIELDS, emptyForm, formFromLog, round1 } from '../lib/body'
import type { FormState } from '../lib/body'
import {
  todayKey,
  addDays,
  formatDayLabel,
  formatFullDate,
  formatShortDate,
  isToday,
  isPast,
  weekDays,
  weekdayLong,
} from '../lib/dates'
import type { BodyLog, DailyMeal, DayType, Food, MacroEntry } from '../types'

const WATER_GOAL = 8

export function MacrosTab({
  externalDay,
  onConsumeExternalDay,
}: {
  externalDay: string | null
  onConsumeExternalDay: () => void
}) {
  const [day, setDay] = useState(todayKey())
  const [review, setReview] = useState<MacroEntry | null>(null)
  const data = useStore((s) => s.data)
  const plan = useStore((s) => s.plan)
  const targets = data.targets
  const addMeal = useStore((s) => s.addMeal)
  const deleteMeal = useStore((s) => s.deleteMeal)
  const verifyMeal = useStore((s) => s.verifyMeal)
  const setWater = useStore((s) => s.setWater)
  const getDayMeals = useStore((s) => s.getDayMeals)
  const toggleEaten = useStore((s) => s.toggleEaten)
  const logFood = useStore((s) => s.logFood)
  const swapDayTypeWith = useStore((s) => s.swapDayTypeWith)
  const resetDayType = useStore((s) => s.resetDayType)
  const toast = useToast()

  useEffect(() => {
    if (externalDay) {
      setDay(externalDay)
      onConsumeExternalDay()
    }
  }, [externalDay, onConsumeExternalDay])

  const editable = isToday(day)
  const entries = data.macroLogs[day] ?? []
  const totals = sumEntries(entries)
  const dayType = effectiveDayType(day, data.dayOverrides, plan.trainingDays)
  const eff = effectiveTargets(day, data.targetHistory, targets, data.restTargets, dayType.type)
  const water = data.water[day] ?? 0
  const preparedMeals = (getDayMeals(day) ?? []).filter((m) => m.done)

  // Celebration: fire once when protein/calorie goal first reached on active day.
  const celebratedRef = useRef<{ day: string; protein: boolean; calories: boolean }>({
    day,
    protein: false,
    calories: false,
  })
  useEffect(() => {
    // Reset baseline when switching days (don't fire on load/switch).
    celebratedRef.current = {
      day,
      protein: totals.protein >= eff.protein,
      calories: totals.calories >= eff.calories,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  useEffect(() => {
    const c = celebratedRef.current
    if (c.day !== day) return
    if (!c.protein && totals.protein >= eff.protein && eff.protein > 0) {
      c.protein = true
      toast.show('Protein goal hit! 💪', { celebrate: true })
    }
    if (!c.calories && totals.calories >= eff.calories && eff.calories > 0) {
      c.calories = true
      toast.show('Calorie goal reached! 🔥', { celebrate: true })
    }
  }, [totals.protein, totals.calories, eff.protein, eff.calories, day, toast])

  return (
    <>
      <DateStepper
        day={day}
        onChange={setDay}
        type={dayType.type}
        overridden={dayType.overridden}
        dayOverrides={data.dayOverrides}
        trainingDays={plan.trainingDays}
        onSwap={(other) => {
          swapDayTypeWith(day, other)
          haptic(12)
          toast.show(`Swapped with ${weekdayLong(other)}`)
        }}
        onReset={() => {
          resetDayType(day)
          haptic(10)
        }}
      />

      {/* Rings */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'center', marginBottom: 14 }}>
          <Ring
            value={totals.calories}
            target={eff.calories}
            size={150}
            stroke={13}
            color="var(--calories)"
            label="Calories"
            unit=" kcal"
            status={goalStatus(totals.calories, eff.calories)}
            center
          />
        </div>
        <div className="grid-4">
          <Ring value={totals.protein} target={eff.protein} color="var(--protein)" label="Protein" status={goalStatus(totals.protein, eff.protein)} />
          <Ring value={totals.carbs} target={eff.carbs} color="var(--carbs)" label="Carbs" status={goalStatus(totals.carbs, eff.carbs)} />
          <Ring value={totals.fats} target={eff.fats} color="var(--fats)" label="Fats" status={goalStatus(totals.fats, eff.fats)} />
          <Ring value={totals.fiber} target={eff.fiber ?? 0} color="var(--fiber)" label="Fiber" status={goalStatus(totals.fiber, eff.fiber ?? 0)} />
        </div>
      </div>

      <WaterCard
        glasses={water}
        editable={editable}
        onChange={(n) => {
          setWater(day, n)
          haptic(8)
        }}
      />

      <PreparedMeals
        meals={preparedMeals}
        editable={editable}
        onEaten={(id) => {
          toggleEaten(day, id)
          haptic(10)
        }}
      />

      <QuickAdd
        editable={editable}
        onAdd={(rm) => {
          const e = addMeal(day, {
            name: rm.name,
            protein: rm.protein,
            carbs: rm.carbs,
            fats: rm.fats,
            fiber: rm.fiber,
            calories: rm.calories,
          })
          haptic(10)
          toast.show(`Added ${rm.name}`, {
            actionLabel: 'Undo',
            onAction: () => deleteMeal(day, e.id),
          })
        }}
      />

      <FoodLogCard
        editable={editable}
        onLog={(foodId, qty) => {
          const e = logFood(day, foodId, qty)
          if (!e) return
          haptic(10)
          toast.show(`Logged ${e.name}`, {
            actionLabel: 'Undo',
            onAction: () => deleteMeal(day, e.id),
          })
        }}
      />

      <div className="btn-row" style={{ marginBottom: 14 }}>
        <AddMealCard
          editable={editable}
          onAdd={(m) => {
            const e = addMeal(day, m)
            haptic(10)
            toast.show(`Logged ${m.name}`, {
              actionLabel: 'Undo',
              onAction: () => deleteMeal(day, e.id),
            })
          }}
        />
        <BodyCheckInCard editable={editable} />
      </div>

      {/* Logged entries */}
      <div className="card">
        <div className="card-title">{isToday(day) ? "Today's log" : 'Logged'}</div>
        <div className="faint tiny" style={{ marginBottom: 8 }}>
          Everything counted toward your rings — prepared meals you've eaten, Quick Adds, and manual entries.
        </div>
        {entries.length === 0 ? (
          <div className="faint small">No meals logged for this day.</div>
        ) : (
          entries.map((e) => (
            <div className="list-row" key={e.id}>
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {e.name}{' '}
                  {e.tag && <span className="badge training" style={{ marginLeft: 4 }}>{e.tag}</span>}
                  {e.source === 'ai' && (
                    <button
                      type="button"
                      className={`badge badge-btn ${e.verified ? 'ai-ok' : 'ai'}`}
                      style={{ marginLeft: 4 }}
                      onClick={() => setReview(e)}
                      aria-label="Review AI estimate"
                    >
                      {e.verified ? 'AI ✓' : `AI${typeof e.confidence === 'number' ? ' ' + Math.round(e.confidence * 100) + '%' : ''}`}
                    </button>
                  )}
                </div>
                <div className="tiny faint">
                  {Math.round(entryCalories(e))} kcal · P{e.protein} C{e.carbs} F{e.fats}{e.fiber ? ` · Fb${e.fiber}` : ''}
                </div>
              </div>
              {editable && (
                <button className="icon-btn" onClick={() => deleteMeal(day, e.id)} aria-label="Delete">
                  <IconTrash width={18} height={18} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <Sheet open={!!review} onClose={() => setReview(null)} title="AI estimate">
        {review && (
          <>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{review.name}</div>
            <div className="small faint" style={{ marginTop: 4 }}>
              {Math.round(entryCalories(review))} kcal · P{review.protein} C{review.carbs} F{review.fats}{review.fiber ? ` · Fb${review.fiber}` : ''}
            </div>
            {typeof review.confidence === 'number' && (
              <div className="small" style={{ marginTop: 8, color: 'var(--text-faint)' }}>
                Model confidence: <b style={{ color: 'var(--text)' }}>{Math.round(review.confidence * 100)}%</b>
              </div>
            )}
            <p className="tiny faint" style={{ marginTop: 8 }}>
              {review.verified
                ? 'You’ve verified this AI estimate.'
                : 'This entry was estimated by AI. Confirm it looks right, or remove it.'}
            </p>
            {editable ? (
              <div className="btn-row" style={{ marginTop: 12 }}>
                {!review.verified && (
                  <button
                    className="btn primary grow"
                    onClick={() => {
                      verifyMeal(day, review.id)
                      haptic(10)
                      toast.show('AI estimate verified')
                      setReview(null)
                    }}
                  >
                    <IconCheck width={16} height={16} /> Looks good
                  </button>
                )}
                <button
                  className="btn danger grow"
                  onClick={() => {
                    deleteMeal(day, review.id)
                    setReview(null)
                  }}
                >
                  <IconTrash width={16} height={16} /> Remove
                </button>
              </div>
            ) : (
              <p className="tiny faint" style={{ marginTop: 12 }}>This day is locked — switch to today to verify or remove.</p>
            )}
          </>
        )}
      </Sheet>
    </>
  )
}

function PreparedMeals({
  meals,
  editable,
  onEaten,
}: {
  meals: DailyMeal[]
  editable: boolean
  onEaten: (id: string) => void
}) {
  if (meals.length === 0) return null
  return (
    <div className="card">
      <div className="card-title">Prepared meals</div>
      <div className="faint tiny" style={{ marginBottom: 8 }}>
        Mark items as eaten to log them to your macros.
      </div>
      {meals.map((m) => (
        <div className="list-row" key={m.id}>
          <button
            className={`toggle${m.eaten ? ' on' : ''}`}
            disabled={!editable}
            onClick={() => onEaten(m.id)}
            aria-label="Mark eaten"
          >
            {m.eaten && <IconCheck width={16} height={16} />}
          </button>
          <div className="grow">
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: m.eaten ? 'var(--text-faint)' : 'var(--text)',
              }}
            >
              {m.slot}: {m.text}
            </div>
            <div className="tiny faint">
              P{m.p} · C{m.c} · F{m.f}{m.fb ? ` · Fb${m.fb}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DateStepper({
  day,
  onChange,
  type,
  overridden,
  dayOverrides,
  trainingDays,
  onSwap,
  onReset,
}: {
  day: string
  onChange: (d: string) => void
  type: DayType
  overridden: boolean
  dayOverrides: Record<string, DayType>
  trainingDays?: number[]
  onSwap: (other: string) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const swappable = !isPast(day)
  // The other days of the same Mon–Sun week, with their resolved type.
  const others = weekDays(day)
    .filter((k) => k !== day)
    .map((k) => ({ key: k, type: effectiveDayType(k, dayOverrides, trainingDays).type }))

  return (
    <div className="card tight" style={{ marginBottom: 14 }}>
      <div className="stepper">
        <button className="round-btn" onClick={() => onChange(addDays(day, -1))} aria-label="Previous day">
          <IconChevronLeft width={20} height={20} />
        </button>
        <button className="col grow" style={{ alignItems: 'center' }} onClick={() => onChange(todayKey())}>
          <div className="label">{isToday(day) ? 'Today' : formatDayLabel(day)}</div>
          <div className="tiny faint">{isToday(day) ? formatFullDate(day) : `${formatFullDate(day)} · ${isPast(day) ? 'read-only' : 'upcoming'}`}</div>
        </button>
        <button
          className="round-btn"
          onClick={() => onChange(addDays(day, 1))}
          aria-label="Next day"
          disabled={isToday(day)}
        >
          <IconChevronRight width={20} height={20} />
        </button>
      </div>

      <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
        <button
          className={`badge ${type} badge-btn`}
          disabled={!swappable}
          onClick={() => swappable && setOpen(true)}
        >
          {type === 'training' ? 'Training day' : 'Rest day'}
          {swappable && <IconSwap width={13} height={13} style={{ marginLeft: 4 }} />}
        </button>
        {overridden && <span className="badge swapped">swapped</span>}
      </div>

      {!isToday(day) && (
        <button className="btn sm block" style={{ marginTop: 10 }} onClick={() => onChange(todayKey())}>
          <IconDaily width={16} height={16} /> Jump to today
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Swap day type">
        <p className="small faint" style={{ marginTop: 0 }}>
          {weekdayLong(day)} is a {type === 'training' ? 'training' : 'rest'} day. Pick another day
          this week to exchange types with — meals and macro goals move with the type.
        </p>
        <div className="col" style={{ gap: 8 }}>
          {others.map(({ key, type: otherType }) => {
            const sameType = otherType === type
            const past = isPast(key)
            const disabled = sameType || past
            return (
              <button
                key={key}
                className="list-row"
                disabled={disabled}
                style={{ opacity: disabled ? 0.45 : 1, textAlign: 'left', width: '100%' }}
                onClick={() => {
                  onSwap(key)
                  setOpen(false)
                }}
              >
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{weekdayLong(key)}</div>
                  <div className="tiny faint">{formatShortDate(key)}{past ? ' · past' : ''}</div>
                </div>
                <span className={`badge ${otherType}`}>
                  {otherType === 'training' ? 'Training' : 'Rest'}
                </span>
              </button>
            )
          })}
        </div>
        {overridden && (
          <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => { onReset(); setOpen(false) }}>
            Reset to default
          </button>
        )}
        <p className="tiny faint" style={{ marginTop: 12, marginBottom: 0 }}>
          Only opposite-type days in this week can be swapped.
        </p>
      </Sheet>
    </div>
  )
}

function WaterCard({
  glasses,
  editable,
  onChange,
}: {
  glasses: number
  editable: boolean
  onChange: (n: number) => void
}) {
  const pips = Array.from({ length: Math.max(WATER_GOAL, glasses) }, (_, i) => i < glasses)
  return (
    <div className="card">
      <div className="card-title">
        <span className="row" style={{ gap: 6 }}>
          <IconWater width={16} height={16} /> Water
        </span>
        <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {glasses} / {WATER_GOAL} · {(glasses * 250)} ml
        </span>
      </div>
      <div className="row between">
        <button className="round-btn" disabled={!editable || glasses <= 0} onClick={() => onChange(glasses - 1)} aria-label="Less water">
          <IconMinus width={20} height={20} />
        </button>
        <div className="row grow" style={{ flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
          {pips.map((on, i) => (
            <div
              key={i}
              style={{
                width: 16,
                height: 24,
                borderRadius: 5,
                background: on ? 'var(--calories)' : 'var(--bg-2)',
                border: '1px solid var(--border)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
        <button className="round-btn" disabled={!editable || glasses >= 16} onClick={() => onChange(glasses + 1)} aria-label="More water">
          <IconPlus width={20} height={20} />
        </button>
      </div>
    </div>
  )
}

function QuickAdd({
  editable,
  onAdd,
}: {
  editable: boolean
  onAdd: (rm: { name: string; protein: number; carbs: number; fats: number; fiber?: number; calories?: number }) => void
}) {
  const recents = useStore((s) => s.data.recentMeals)
  if (recents.length === 0) return null
  return (
    <div className="card">
      <div className="card-title">Quick add</div>
      <div className="chips">
        {recents.map((r, i) => (
          <button key={i} className="chip" disabled={!editable} onClick={() => onAdd(r)}>
            {r.name}
            <span className="chip-sub">P{r.protein} C{r.carbs} F{r.fats}{r.fiber ? ` Fb${r.fiber}` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function FoodLogCard({
  editable,
  onLog,
}: {
  editable: boolean
  onLog: (foodId: string, qty: number) => void
}) {
  const foods = useStore((s) => s.data.foods)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Food | null>(null)
  const [qty, setQty] = useState('1')

  const all = Object.values(foods)
  const byId = useMemo(() => new Map(Object.entries(foods)), [foods])
  const list = all
    .filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const close = () => {
    setOpen(false)
    setSelected(null)
    setQuery('')
    setQty('1')
  }

  if (all.length === 0) return null

  const n = Number(qty) || 0
  const preview = selected ? roundMacros(scaleMacros(resolveFoodMacros(selected, byId), n > 0 ? n : 1)) : null

  return (
    <>
      <button className="btn block" disabled={!editable} onClick={() => setOpen(true)} style={{ marginBottom: 14 }}>
        <IconBox width={18} height={18} /> Log from my foods
      </button>
      <Sheet open={open} onClose={close} title={selected ? selected.name : 'Log from foods'}>
        {!selected ? (
          <>
            {all.length > 5 && (
              <input
                className="grow"
                placeholder="Search foods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ marginBottom: 10 }}
                autoFocus
              />
            )}
            {list.length === 0 ? (
              <div className="faint small">No matches.</div>
            ) : (
              list.map((food) => {
                const m = roundMacros(resolveFoodMacros(food, byId))
                return (
                  <button key={food.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setSelected(food)}>
                    <div className="grow">
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {food.name}{' '}
                        {isRecipe(food) && <span className="badge training" style={{ marginLeft: 4 }}>Recipe</span>}
                      </div>
                      <div className="tiny faint">
                        {food.serving ? `${food.serving} · ` : ''}{m.calories} kcal · P{m.protein} C{m.carbs} F{m.fats}{m.fiber ? ` · Fb${m.fiber}` : ''}
                      </div>
                    </div>
                    <IconChevronRight width={18} height={18} />
                  </button>
                )
              })
            )}
          </>
        ) : (
          <>
            <label className="field">
              <span className="lbl">Servings{selected.serving ? ` (1 = ${selected.serving})` : ''}</span>
              <input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
            </label>
            {preview && (
              <div className="card tight" style={{ marginBottom: 12 }}>
                <div className="tiny faint">This logs</div>
                <div className="small" style={{ fontWeight: 600 }}>
                  {preview.calories} kcal · P{preview.protein} C{preview.carbs} F{preview.fats}{preview.fiber ? ` · Fb${preview.fiber}` : ''}
                </div>
              </div>
            )}
            <div className="btn-row">
              <button
                className="btn primary grow"
                disabled={n <= 0}
                onClick={() => {
                  onLog(selected.id, n)
                  close()
                }}
              >
                Log {selected.name}
              </button>
              <button className="btn ghost" onClick={() => setSelected(null)}>Back</button>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}

function AddMealCard({
  editable,
  onAdd,
}: {
  editable: boolean
  onAdd: (m: { name: string; protein: number; carbs: number; fats: number; fiber?: number; calories?: number }) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [p, setP] = useState('')
  const [c, setC] = useState('')
  const [f, setF] = useState('')
  const [fb, setFb] = useState('')
  const [cal, setCal] = useState('')

  const reset = () => {
    setName('')
    setP('')
    setC('')
    setF('')
    setFb('')
    setCal('')
  }
  const valid = name.trim() && p !== '' && c !== '' && f !== ''
  const derived = deriveCalories(Number(p) || 0, Number(c) || 0, Number(f) || 0)

  return (
    <>
      <button className="btn primary grow" disabled={!editable} onClick={() => setOpen(true)}>
        <IconPlus width={18} height={18} /> Log a meal
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log a meal">
        <label className="field">
          <span className="lbl">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken & rice" autoFocus />
        </label>
        <div className="grid-3">
          <label className="field">
            <span className="lbl">Protein (g)</span>
            <input type="number" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} />
          </label>
          <label className="field">
            <span className="lbl">Carbs (g)</span>
            <input type="number" inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} />
          </label>
          <label className="field">
            <span className="lbl">Fats (g)</span>
            <input type="number" inputMode="numeric" value={f} onChange={(e) => setF(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="lbl">Fiber (g · optional)</span>
          <input type="number" inputMode="numeric" value={fb} onChange={(e) => setFb(e.target.value)} />
        </label>
        <label className="field">
          <span className="lbl">Calories (optional · derived {derived} kcal)</span>
          <input type="number" inputMode="numeric" value={cal} onChange={(e) => setCal(e.target.value)} placeholder={`${derived}`} />
        </label>
        <button
          className="btn primary block"
          disabled={!valid}
          onClick={() => {
            onAdd({
              name: name.trim(),
              protein: Number(p) || 0,
              carbs: Number(c) || 0,
              fats: Number(f) || 0,
              fiber: fb !== '' ? Number(fb) : undefined,
              calories: cal !== '' ? Number(cal) : undefined,
            })
            reset()
            setOpen(false)
          }}
        >
          Log meal
        </button>
      </Sheet>
    </>
  )
}

function BodyCheckInCard({ editable }: { editable: boolean }) {
  const bodyLogs = useStore((s) => s.data.bodyLogs)
  const logBody = useStore((s) => s.logBody)
  const deleteBody = useStore((s) => s.deleteBody)

  const today = todayKey()
  const todayEntry = bodyLogs[today]
  const [open, setOpen] = useState(false)
  const [showMeasures, setShowMeasures] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)

  // Most recent check-ins first.
  const entries = useMemo(
    () => Object.values(bodyLogs).sort((a, b) => b.day.localeCompare(a.day)),
    [bodyLogs],
  )

  const openSheet = () => {
    setForm(todayEntry ? formFromLog(todayEntry) : emptyForm())
    setShowMeasures(todayEntry ? MEASURE_FIELDS.some((f) => typeof todayEntry[f.key] === 'number') : false)
    setOpen(true)
  }

  const save = () => {
    const num = (s: string) => {
      const n = parseFloat(s)
      return Number.isFinite(n) && n > 0 ? n : undefined
    }
    logBody(today, {
      weight: num(form.weight),
      bodyFat: num(form.bodyFat),
      waist: num(form.waist),
      chest: num(form.chest),
      hips: num(form.hips),
      arms: num(form.arms),
      thighs: num(form.thighs),
      neck: num(form.neck),
      note: form.note.trim() || undefined,
    })
    setOpen(false)
  }

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Short "75kg · 14% bf · waist 80" summary line for a check-in row.
  const summarize = (log: BodyLog): string => {
    const parts: string[] = []
    for (const f of BODY_FIELDS) {
      const v = log[f.key]
      if (typeof v === 'number') parts.push(f.key === 'weight' ? `${round1(v)}${f.unit}` : `${f.label} ${round1(v)}${f.unit}`)
    }
    return parts.join(' · ')
  }

  return (
    <>
      <button className="btn grow" onClick={openSheet} disabled={!editable}>
        {todayEntry ? <IconCheck width={18} height={18} /> : <IconPlus width={18} height={18} />} Body check-in
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Body check-in">
        <p className="tiny faint" style={{ marginTop: 0 }}>
          One check-in per day{todayEntry ? ' — updating today’s entry' : ''}. Leave fields blank to skip them.
        </p>
        <div className="grid-2">
          <label className="field">
            <span className="lbl">Weight (kg)</span>
            <input type="number" inputMode="decimal" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="e.g. 74.5" />
          </label>
          <label className="field">
            <span className="lbl">Body fat (%)</span>
            <input type="number" inputMode="decimal" value={form.bodyFat} onChange={(e) => set('bodyFat', e.target.value)} placeholder="optional" />
          </label>
        </div>

        <button className="btn sm ghost block" style={{ marginTop: 4 }} onClick={() => setShowMeasures((v) => !v)}>
          {showMeasures ? 'Hide measurements' : 'Add measurements (cm)'}
        </button>
        {showMeasures && (
          <div className="grid-2" style={{ marginTop: 8 }}>
            {MEASURE_FIELDS.map((f) => (
              <label className="field" key={f.key}>
                <span className="lbl">{f.label} ({f.unit})</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder="optional"
                />
              </label>
            ))}
          </div>
        )}

        <label className="field" style={{ marginTop: 8 }}>
          <span className="lbl">Note</span>
          <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="optional — e.g. morning, fasted" />
        </label>

        <button className="btn primary block" style={{ marginTop: 10 }} onClick={save}>Save check-in</button>

        {entries.length > 0 && (
          <div className="body-log-list" style={{ marginTop: 16 }}>
            {entries.slice(0, 6).map((log) => (
              <div className="list-row" key={log.day}>
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {summarize(log) || '—'}
                    {isToday(log.day) && <span className="badge training" style={{ marginLeft: 6 }}>Today</span>}
                  </div>
                  <div className="tiny faint">{formatFullDate(log.day)}{log.note ? ` · ${log.note}` : ''}</div>
                </div>
                {isToday(log.day) && (
                  <button className="icon-btn" onClick={() => deleteBody(log.day)} aria-label="Delete today's entry">
                    <IconTrash width={18} height={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  )
}

