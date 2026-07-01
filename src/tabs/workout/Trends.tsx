import { useMemo } from 'react'
import { useStore } from '../../store/store'
import { BarChart } from '../../components/BarChart'
import type { BarTooltip } from '../../components/BarChart'
import { formatShortDate, addDays } from '../../lib/dates'
import {
  CONSISTENT_DAYS_PER_WEEK,
  weekStats,
  recentWeekStarts,
  consistencyStreak,
  bestConsistencyStreak,
} from '../../lib/workoutStats'

// How many weeks the consistency chart looks back over.
const WEEKS_SHOWN = 12

export function WorkoutTrends() {
  const sessions = useStore((s) => s.data.workoutSessions)

  const stats = useMemo(() => weekStats(sessions), [sessions])
  const total = Object.keys(sessions).length
  const streak = useMemo(() => consistencyStreak(stats), [stats])
  const best = useMemo(() => bestConsistencyStreak(stats), [stats])

  const weeks = useMemo(() => recentWeekStarts(WEEKS_SHOWN), [])
  const thisWeek = weeks[weeks.length - 1]
  const thisWeekDays = stats.get(thisWeek)?.days ?? 0

  const bars = useMemo(
    () =>
      weeks.map((wk) => {
        const st = stats.get(wk)
        const days = st?.days ?? 0
        const end = addDays(wk, 6)
        const tooltip: BarTooltip = {
          title: `${formatShortDate(wk)} – ${formatShortDate(end)}`,
          subtitle:
            days >= CONSISTENT_DAYS_PER_WEEK
              ? '✅ Consistent week'
              : days > 0
                ? 'Below target'
                : 'No workouts',
          rows: [
            { label: 'Training days', value: `${days}`, color: 'var(--accent)' },
            { label: 'Sessions', value: `${st?.sessions ?? 0}`, color: 'var(--text-faint)' },
            ...(st && st.volume > 0
              ? [{ label: 'Volume', value: `${st.volume.toLocaleString()} kg·reps`, color: 'var(--carbs)' }]
              : []),
          ],
        }
        return {
          label: formatShortDate(wk).split(' ')[1],
          value: days,
          highlight: days >= CONSISTENT_DAYS_PER_WEEK,
          tooltip,
        }
      }),
    [weeks, stats],
  )

  if (total === 0) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">📈</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No workouts yet</div>
          <div className="small">
            Finish a workout from a routine and your consistency trends show up here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ---- Consistency streak hero ---- */}
      <div className="card" style={{ textAlign: 'center', paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>{streak > 0 ? '🔥' : '🌱'}</div>
        <div
          style={{
            fontSize: 46,
            fontWeight: 800,
            color: streak > 0 ? 'var(--accent)' : 'var(--text-faint)',
            lineHeight: 1.1,
            marginTop: 4,
          }}
        >
          {streak}
        </div>
        <div style={{ fontWeight: 700 }}>
          {streak === 1 ? 'week' : 'weeks'} consistent
        </div>
        <div className="tiny faint" style={{ marginTop: 6 }}>
          {CONSISTENT_DAYS_PER_WEEK}+ training days a week keeps the streak alive
        </div>
      </div>

      {/* ---- Key numbers ---- */}
      <div className="card">
        <div className="stat-tiles">
          <div className="stat-tile">
            <div
              className="v"
              style={{ color: thisWeekDays >= CONSISTENT_DAYS_PER_WEEK ? 'var(--ok)' : 'var(--accent)' }}
            >
              {thisWeekDays}
            </div>
            <div className="k">Days this week</div>
          </div>
          <div className="stat-tile">
            <div className="v" style={{ color: 'var(--carbs)' }}>{best}</div>
            <div className="k">Best streak</div>
          </div>
          <div className="stat-tile">
            <div className="v" style={{ color: 'var(--accent)' }}>{total}</div>
            <div className="k">Total workouts</div>
          </div>
        </div>
      </div>

      {/* ---- Weekly training days ---- */}
      <div className="card">
        <div className="card-title">
          <span>Training days · last {WEEKS_SHOWN} weeks</span>
        </div>
        <BarChart bars={bars} goal={CONSISTENT_DAYS_PER_WEEK} color="var(--accent)" height={132} />
        <div className="tiny faint" style={{ marginTop: 10, textAlign: 'center' }}>
          Dashed line marks the {CONSISTENT_DAYS_PER_WEEK}-day consistency goal. Tap a bar for detail.
        </div>
      </div>
    </>
  )
}
