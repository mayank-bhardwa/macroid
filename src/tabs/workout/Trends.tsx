import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/store'
import { BarChart } from '../../components/BarChart'
import type { BarTooltip } from '../../components/BarChart'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { SetFieldInput } from './Routines'
import { formatShortDate, addDays, formatFullDate, dayKey } from '../../lib/dates'
import { SET_FIELDS, SET_FIELD_LABEL, loadExercises, type Exercise, type SetField } from '../../lib/exercises'
import type { LoggedSet, WorkoutSession } from '../../types'
import {
  CONSISTENT_DAYS_PER_WEEK,
  weekStats,
  recentWeekStarts,
  consistencyStreak,
  bestConsistencyStreak,
  sessionVolume,
} from '../../lib/workoutStats'

// How many weeks the consistency chart looks back over.
const WEEKS_SHOWN = 12

// How many past sessions the history list shows.
const HISTORY_SHOWN = 20

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

      <WorkoutHistory />
    </>
  )
}

// Past workouts, newest first. Tapping one opens an editor so a mistyped set
// (or a whole session) can be corrected after the fact.
function WorkoutHistory() {
  const sessions = useStore((s) => s.data.workoutSessions)
  const [editing, setEditing] = useState<WorkoutSession | null>(null)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [byId, setById] = useState<Map<string, Exercise> | null>(null)

  useEffect(() => {
    let alive = true
    loadExercises()
      .then((l) => alive && setById(new Map(l.map((e) => [e.id, e]))))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const sorted = useMemo(
    () => Object.values(sessions).slice().sort((a, b) => b.finishedAt - a.finishedAt),
    [sessions],
  )

  // Match the routine name or any exercise performed in the session, so a lift
  // can be tracked down without opening every workout.
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true
      return s.exercises.some((e) => {
        const name = byId?.get(e.exerciseId)?.exercise_name ?? e.exerciseId
        return name.toLowerCase().includes(q)
      })
    })
  }, [sorted, query, byId])

  const list = showAll || query.trim() ? matched : matched.slice(0, HISTORY_SHOWN)
  const hidden = matched.length - list.length

  if (sorted.length === 0) return null

  return (
    <div className="card">
      <div className="card-title">
        <span>Workout history</span>
        <span className="tiny faint">{matched.length}</span>
      </div>
      <input
        type="search"
        placeholder="Search by routine or exercise…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {list.length === 0 && (
        <div className="tiny faint" style={{ padding: '6px 0' }}>
          No workouts match “{query}”.
        </div>
      )}
      {list.map((s) => {
        const sets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0)
        const vol = sessionVolume(s)
        return (
          <button key={s.id} className="history-row" onClick={() => setEditing(s)}>
            <div className="grow" style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div className="tiny faint">
                {formatShortDate(dayKey(new Date(s.startedAt)))} · {sets} {sets === 1 ? 'set' : 'sets'}
                {vol > 0 ? ` · ${vol.toLocaleString()} kg·reps` : ''}
              </div>
            </div>
            <span className="tiny faint">Edit</span>
          </button>
        )
      })}
      {hidden > 0 && (
        <button className="btn sm block" style={{ marginTop: 4 }} onClick={() => setShowAll(true)}>
          Show {hidden} older {hidden === 1 ? 'workout' : 'workouts'}
        </button>
      )}
      <SessionEditSheet session={editing} byId={byId} onClose={() => setEditing(null)} />
    </div>
  )
}

function SessionEditSheet({
  session,
  byId,
  onClose,
}: {
  session: WorkoutSession | null
  byId: Map<string, Exercise> | null
  onClose: () => void
}) {
  const saveSession = useStore((s) => s.saveSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const toast = useToast()
  const [draft, setDraft] = useState<WorkoutSession | null>(null)

  useEffect(() => {
    setDraft(session ? (JSON.parse(JSON.stringify(session)) as WorkoutSession) : null)
  }, [session])

  const patchSet = (ei: number, si: number, patch: Partial<LoggedSet>) => {
    setDraft((d) => {
      if (!d) return d
      const next = { ...d, exercises: d.exercises.map((e) => ({ ...e, sets: e.sets.slice() })) }
      next.exercises[ei].sets[si] = { ...next.exercises[ei].sets[si], ...patch }
      return next
    })
  }

  const save = () => {
    if (!draft) return
    saveSession(JSON.parse(JSON.stringify(draft)))
    toast.show('Workout updated')
    onClose()
  }

  const remove = () => {
    if (!draft) return
    if (!confirm('Delete this workout? Its sets and records will be removed.')) return
    deleteSession(draft.id)
    toast.show('Workout deleted')
    onClose()
  }

  return (
    <Sheet open={!!session} onClose={onClose} title={draft?.name}>
      {draft && (
        <>
          <div className="tiny faint" style={{ marginBottom: 12 }}>
            {formatFullDate(dayKey(new Date(draft.startedAt)))}
          </div>
          {draft.exercises.map((se, ei) => {
            const ex = byId?.get(se.exerciseId)
            const fields: SetField[] = ex ? SET_FIELDS[ex.log_type] : ['weight', 'reps']
            return (
              <div className="card tight" key={`${se.exerciseId}-${ei}`} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {ex?.exercise_name ?? se.exerciseId}
                </div>
                <div className="set-head">
                  <span className="set-col-n">Set</span>
                  {fields.map((f) => (
                    <span key={f} className="set-col">
                      {SET_FIELD_LABEL[f]}
                    </span>
                  ))}
                </div>
                {se.sets.map((s, si) => (
                  <div className={`set-row${s.warmup ? ' warmup' : ''}`} key={si}>
                    <span className="set-col-n set-num">{s.warmup ? 'W' : si + 1}</span>
                    {fields.map((f) => (
                      <div key={f} className="set-col">
                        <SetFieldInput field={f} set={s} onChange={(p) => patchSet(ei, si, p)} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn primary grow" onClick={save}>
              Save changes
            </button>
            <button className="btn ghost" onClick={remove}>
              Delete
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
