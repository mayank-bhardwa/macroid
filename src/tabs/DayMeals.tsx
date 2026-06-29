import { useStore } from '../store/store'
import { planMealGroups } from '../lib/plan'
import { haptic } from '../lib/haptics'
import { IconCheck } from '../components/icons'
import { isToday, isPast } from '../lib/dates'
import type { DailyMeal } from '../types'

// The day's planned meal schedule. Each meal has a single "Ate it" checkbox
// that logs it to the macros — there is no separate "prepared" step.
export function DayMeals({ day, editable }: { day: string; editable: boolean }) {
  const plan = useStore((s) => s.plan)
  const getDayMeals = useStore((s) => s.getDayMeals)
  const toggleEaten = useStore((s) => s.toggleEaten)

  const meals = getDayMeals(day)
  // Past days without a seeded schedule have no meal list — the logged-entries
  // card below still shows whatever was recorded, so render nothing here.
  if (meals == null) return null

  const groups = planMealGroups(plan)
  const renderGroups = [...groups]
  for (const m of meals) {
    if (m.group && !renderGroups.includes(m.group)) renderGroups.push(m.group)
  }

  return (
    <>
      <div className="faint tiny" style={{ margin: '0 4px 8px' }}>
        Tick a meal once you eat it — it logs straight to your macros.
      </div>
      {renderGroups.map((g) => (
        <MealGroup
          key={g}
          title={g}
          meals={meals.filter((m) => m.group === g)}
          editable={editable}
          onEaten={(id) => { toggleEaten(day, id); haptic(10) }}
        />
      ))}

      {!editable ? (
        <div className="faint tiny" style={{ textAlign: 'center', marginTop: 4, marginBottom: 14 }}>
          {isPast(day) ? 'Viewing a past day (read-only)' : 'Upcoming day preview (read-only)'}
        </div>
      ) : !isToday(day) ? (
        <div className="faint tiny" style={{ textAlign: 'center', marginTop: 4, marginBottom: 14 }}>
          Editing yesterday — catch up on anything you missed
        </div>
      ) : null}
    </>
  )
}

function MealGroup({
  title,
  meals,
  editable,
  onEaten,
}: {
  title: string
  meals: DailyMeal[]
  editable: boolean
  onEaten: (id: string) => void
}) {
  if (meals.length === 0) return null
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {meals.map((m) => (
        <div className="list-row" key={m.id} style={{ alignItems: 'flex-start' }}>
          <button
            className={`toggle${m.eaten ? ' on' : ''}`}
            disabled={!editable}
            onClick={() => onEaten(m.id)}
            aria-label="Mark eaten"
          >
            {m.eaten && <IconCheck width={16} height={16} />}
          </button>
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{m.slot}</span>
              <span className="tiny faint">{m.time}</span>
              {m.custom && <span className="badge custom">Custom</span>}
            </div>
            <div
              className="small"
              style={{
                color: m.eaten ? 'var(--text-faint)' : 'var(--text)',
                textDecoration: m.eaten ? 'line-through' : 'none',
              }}
            >
              {m.text}
            </div>
            <div className="tiny faint">P{m.p} · C{m.c} · F{m.f}{m.fb ? ` · Fb${m.fb}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

