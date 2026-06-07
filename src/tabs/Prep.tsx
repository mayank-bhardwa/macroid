import { useState } from 'react'
import { useStore } from '../store/store'
import { haptic } from '../lib/haptics'
import { IconCheck } from '../components/icons'
import { isoWeekKey } from '../lib/dates'
import { DailyTab } from './Daily'

// Combined preparation hub: daily meal checklist and weekly batch prep are the
// same activity at two cadences, so they live under one tab with a toggle.
export function PrepTab() {
  const [scope, setScope] = useState<'daily' | 'weekly'>('daily')
  return (
    <>
      <div className="card tight" style={{ marginBottom: 14 }}>
        <div className="segmented">
          <button className={scope === 'daily' ? 'active' : ''} onClick={() => setScope('daily')}>
            Daily
          </button>
          <button className={scope === 'weekly' ? 'active' : ''} onClick={() => setScope('weekly')}>
            Weekly
          </button>
        </div>
      </div>
      {scope === 'daily' ? <DailyTab /> : <WeeklyPrep />}
    </>
  )
}

function WeeklyPrep() {
  const getWeekTasks = useStore((s) => s.getWeekTasks)
  const toggleTask = useStore((s) => s.toggleTask)
  // re-render on data change
  useStore((s) => s.data.mealPrep)

  // Weekly prep is a single list for the current week. The task list itself is
  // defined on the plan (Settings → Weekly prep tasks) and is version-history
  // tracked: updating it archives the prior plan version on sync.
  const week = isoWeekKey()
  const tasks = getWeekTasks(week)
  const done = tasks.filter((t) => t.done).length

  return (
    <div className="card">
      <div className="card-title">
        Meal-prep tasks
        <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {done}/{tasks.length}
        </span>
      </div>
      {tasks.length === 0 && <div className="faint small">No tasks for this week.</div>}
      {tasks.map((t) => (
        <div className="list-row" key={t.id}>
          <button
            className={`toggle${t.done ? ' on' : ''}`}
            onClick={() => { toggleTask(week, t.id); haptic(8) }}
            aria-label="Toggle task"
          >
            {t.done && <IconCheck width={16} height={16} />}
          </button>
          <span
            className="grow small"
            style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--text-faint)' : 'var(--text)' }}
          >
            {t.text}
          </span>
        </div>
      ))}
      <div className="faint tiny" style={{ marginTop: 12 }}>
        Edit your weekly prep tasks in Settings → Weekly prep tasks.
      </div>
    </div>
  )
}

export function buildWeekOptions(
  planWeeks: { key: string; label: string }[],
  currentWeek: string,
): { key: string; label: string }[] {
  const map = new Map<string, string>()
  for (const w of planWeeks) map.set(w.key, w.label)
  if (!map.has(currentWeek)) map.set(currentWeek, 'This week')
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.key.localeCompare(b.key))
}
