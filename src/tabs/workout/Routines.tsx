import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/store'
import { Library, ExerciseDetail } from './Library'
import { Sheet } from '../../components/Sheet'
import {
  SET_FIELDS,
  SET_FIELD_LABEL,
  loadExercises,
  type Exercise,
  type SetField,
} from '../../lib/exercises'
import { primeAudio } from '../../lib/sound'
import { useBackButton } from '../../lib/useBackButton'
import type {
  Routine,
  RoutineExercise,
  RoutineSet,
  RoutineFolder,
  LoggedSet,
  WorkoutSession,
} from '../../types'
import {
  IconClose,
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconDots,
} from '../../components/icons'

function rid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Sentinel "folder id" for the Ungrouped section's collapse state.
const UNGROUPED = '__ungrouped__'

// A sensible first set for a freshly added exercise, seeded from the catalog's
// recommended rep range / defaults.
function defaultSet(ex: Exercise): RoutineSet {
  const fields = SET_FIELDS[ex.log_type]
  const s: RoutineSet = {}
  if (fields.includes('reps')) {
    const rr = ex.recommended_rep_range
    s.reps = rr ? rr.hypertrophy ?? rr.strength ?? Object.values(rr)[0] ?? '10' : '10'
  }
  if (fields.includes('seconds')) s.seconds = 30
  return s
}

function summarize(routine: Routine, byId: Map<string, Exercise>): string {
  const names = routine.exercises
    .map((re) => byId.get(re.exerciseId)?.exercise_name)
    .filter(Boolean) as string[]
  if (names.length === 0) return 'No exercises'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
}

// ---------- set editor ----------

function SetFieldInput({
  field,
  set,
  placeholder,
  onChange,
}: {
  field: SetField
  set: RoutineSet
  placeholder?: string
  onChange: (patch: Partial<RoutineSet>) => void
}) {
  if (field === 'reps') {
    return (
      <input
        className="set-input"
        inputMode="numeric"
        placeholder={placeholder ?? 'reps'}
        value={set.reps ?? ''}
        onChange={(e) => onChange({ reps: e.target.value })}
      />
    )
  }
  const key = field === 'weight' ? 'weight' : field === 'seconds' ? 'seconds' : 'distance'
  const val = set[key]
  return (
    <input
      className="set-input"
      inputMode="decimal"
      placeholder={placeholder ?? SET_FIELD_LABEL[field]}
      value={val ?? ''}
      onChange={(e) => {
        const n = e.target.value === '' ? undefined : Number(e.target.value)
        onChange({ [key]: Number.isFinite(n as number) ? n : undefined } as Partial<RoutineSet>)
      }}
    />
  )
}

// ---------- session set helpers ----------

// Whether a set carries a usable value for a field (actual entry or fallback).
function setHasField(s: RoutineSet, f: SetField): boolean {
  if (f === 'reps') return !!(s.reps && s.reps.trim())
  return s[f] != null
}

// A set can be marked done only if every required field is either entered now
// or available from the previous session to fall back on.
function canCompleteSet(s: LoggedSet, prevSet: LoggedSet | undefined, fields: SetField[]): boolean {
  return fields.every((f) => setHasField(s, f) || (prevSet ? setHasField(prevSet, f) : false))
}

// Fill any blank fields from the previous session's matching set.
function fillFromPrev(s: LoggedSet, prevSet: LoggedSet | undefined, fields: SetField[]): LoggedSet {
  if (!prevSet) return s
  const out: LoggedSet = { ...s }
  for (const f of fields) {
    if (setHasField(out, f)) continue
    if (f === 'reps') {
      if (prevSet.reps) out.reps = prevSet.reps
    } else {
      const k = f as 'weight' | 'seconds' | 'distance'
      if (prevSet[k] != null) out[k] = prevSet[k]
    }
  }
  return out
}

// Background hint for a session input: the routine's planned target (e.g. a rep
// range), else the previous session's value, else the unit label.
function placeholderFor(
  f: SetField,
  planned: RoutineSet | undefined,
  prevSet: LoggedSet | undefined,
): string {
  if (f === 'reps') {
    if (planned?.reps) return planned.reps
    if (prevSet?.reps) return prevSet.reps
    return 'reps'
  }
  const k = f as 'weight' | 'seconds' | 'distance'
  if (prevSet?.[k] != null) return String(prevSet[k])
  if (planned?.[k] != null) return String(planned[k])
  return SET_FIELD_LABEL[f]
}

function ExerciseBlock({
  re,
  ex,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  re: RoutineExercise
  ex: Exercise
  index: number
  count: number
  onChange: (next: RoutineExercise) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const fields = SET_FIELDS[ex.log_type]

  const setSets = (sets: RoutineSet[]) => onChange({ ...re, sets })

  const addSet = () => {
    const last = re.sets[re.sets.length - 1]
    setSets([...re.sets, last ? { ...last } : defaultSet(ex)])
  }
  const patchSet = (i: number, patch: Partial<RoutineSet>) =>
    setSets(re.sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const removeSet = (i: number) => setSets(re.sets.filter((_, idx) => idx !== i))

  return (
    <div className="routine-ex">
      <div className="routine-ex-head">
        <div className="routine-ex-title">
          <div className="ex-row-name">{ex.exercise_name}</div>
          <div className="ex-row-sub">
            {ex.primary_muscle[0] ?? ex.body_region} · {ex.equipment_category}
          </div>
        </div>
        <button className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
          <IconChevronUp width={18} height={18} />
        </button>
        <button
          className="icon-btn"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label="Move down"
        >
          <IconChevronDown width={18} height={18} />
        </button>
        <button className="icon-btn" onClick={onRemove} aria-label="Remove exercise">
          <IconTrash width={18} height={18} />
        </button>
      </div>

      <input
        className="routine-note"
        placeholder="Add note (optional)…"
        value={re.note ?? ''}
        onChange={(e) => onChange({ ...re, note: e.target.value || undefined })}
      />

      <div className="set-head">
        <span className="set-col-n">Set</span>
        {fields.map((f) => (
          <span key={f} className="set-col">
            {SET_FIELD_LABEL[f]}
          </span>
        ))}
        <span className="set-col-x" />
      </div>

      {re.sets.map((s, i) => {
        const working = re.sets.slice(0, i).filter((x) => !x.warmup).length + 1
        return (
          <div key={i} className={`set-row${s.warmup ? ' warmup' : ''}`}>
            <button
              className="set-col-n set-num"
              onClick={() => patchSet(i, { warmup: !s.warmup })}
              title="Tap to toggle warm-up set"
            >
              {s.warmup ? 'W' : working}
            </button>
            {fields.map((f) => (
              <div key={f} className="set-col">
                <SetFieldInput field={f} set={s} onChange={(p) => patchSet(i, p)} />
              </div>
            ))}
            <button
              className="set-col-x icon-btn"
              onClick={() => removeSet(i)}
              aria-label="Remove set"
              disabled={re.sets.length === 1}
            >
              <IconClose width={15} height={15} />
            </button>
          </div>
        )
      })}

      <div className="routine-ex-foot">
        <button className="btn ghost sm" onClick={addSet}>
          <IconPlus width={15} height={15} /> Add set
        </button>
        <label className="rest-field">
          Rest
          <input
            inputMode="numeric"
            value={re.restSeconds ?? ''}
            placeholder={ex.default_rest_seconds != null ? String(ex.default_rest_seconds) : '—'}
            onChange={(e) => {
              const n = e.target.value === '' ? undefined : Number(e.target.value)
              onChange({ ...re, restSeconds: Number.isFinite(n as number) ? n : undefined })
            }}
          />
          s
        </label>
      </div>
    </div>
  )
}

// ---------- exercise picker (full-screen) ----------

function ExercisePicker({
  exercises,
  existing,
  onCancel,
  onAdd,
}: {
  exercises: Exercise[]
  existing: Set<string>
  onCancel: () => void
  onAdd: (ids: string[]) => void
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set())
  useBackButton(true, onCancel)
  const toggle = (id: string) => {
    if (existing.has(id)) return
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // Merge already-added (locked) + newly selected for the check display.
  const shown = useMemo(() => new Set([...existing, ...selection]), [existing, selection])

  return (
    <div className="settings-overlay">
      <header className="app-header">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel">
          <IconClose width={22} height={22} />
        </button>
        <div className="title">Add exercises</div>
        <button
          className="btn primary sm"
          onClick={() => onAdd([...selection])}
          disabled={selection.size === 0}
        >
          Add{selection.size ? ` (${selection.size})` : ''}
        </button>
      </header>
      <div className="main-scroll" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
        <Library exercises={exercises} selection={shown} onToggle={toggle} />
      </div>
    </div>
  )
}

// ---------- routine builder (full-screen) ----------

function RoutineBuilder({
  exercises,
  byId,
  folders,
  initial,
  onClose,
}: {
  exercises: Exercise[]
  byId: Map<string, Exercise>
  folders: RoutineFolder[]
  initial: Routine
  onClose: () => void
}) {
  const saveRoutine = useStore((s) => s.saveRoutine)
  const deleteRoutine = useStore((s) => s.deleteRoutine)
  const isNew = !useStore((s) => s.data.routines[initial.id])

  const [name, setName] = useState(initial.name)
  const [folderId, setFolderId] = useState<string | undefined>(initial.folderId)
  const [items, setItems] = useState<RoutineExercise[]>(initial.exercises)
  const [picking, setPicking] = useState(false)

  const existingIds = useMemo(() => new Set(items.map((i) => i.exerciseId)), [items])

  const addExercises = (ids: string[]) => {
    const added: RoutineExercise[] = ids
      .map((id) => byId.get(id))
      .filter((e): e is Exercise => !!e)
      .map((e) => ({ exerciseId: e.id, sets: [defaultSet(e)], restSeconds: e.default_rest_seconds ?? undefined }))
    setItems((prev) => [...prev, ...added])
    setPicking(false)
  }

  const updateItem = (i: number, next: RoutineExercise) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? next : it)))
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i))
  const moveItem = (i: number, dir: -1 | 1) =>
    setItems((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const canSave = name.trim().length > 0 && items.length > 0

  const save = () => {
    if (!canSave) return
    saveRoutine({ ...initial, name: name.trim(), folderId, exercises: items })
    onClose()
  }

  const del = () => {
    if (confirm('Delete this routine?')) {
      deleteRoutine(initial.id)
      onClose()
    }
  }

  useBackButton(!picking, onClose)

  if (picking) {
    return (
      <ExercisePicker
        exercises={exercises}
        existing={existingIds}
        onCancel={() => setPicking(false)}
        onAdd={addExercises}
      />
    )
  }

  return (
    <div className="settings-overlay">
      <header className="app-header">
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <IconClose width={22} height={22} />
        </button>
        <div className="title">{isNew ? 'New routine' : 'Edit routine'}</div>
        <button className="btn primary sm" onClick={save} disabled={!canSave}>
          Save
        </button>
      </header>

      <div className="main-scroll" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
        <div className="card">
          <input
            placeholder="Routine name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}
          />
          <div className="tiny faint" style={{ marginBottom: 6 }}>Group</div>
          <div className="chips">
            <button
              className={`chip${!folderId ? ' active' : ''}`}
              onClick={() => setFolderId(undefined)}
            >
              Ungrouped
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className={`chip${folderId === f.id ? ' active' : ''}`}
                onClick={() => setFolderId(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="card">
            <div className="empty">
              <div className="big">📝</div>
              <div className="small">Add exercises to build your routine.</div>
            </div>
          </div>
        ) : (
          items.map((re, i) => {
            const ex = byId.get(re.exerciseId)
            if (!ex) return null
            return (
              <div className="card" key={`${re.exerciseId}-${i}`}>
                <ExerciseBlock
                  re={re}
                  ex={ex}
                  index={i}
                  count={items.length}
                  onChange={(next) => updateItem(i, next)}
                  onRemove={() => removeItem(i)}
                  onMove={(dir) => moveItem(i, dir)}
                />
              </div>
            )
          })
        )}

        <button className="btn block" onClick={() => setPicking(true)} style={{ marginBottom: 12 }}>
          <IconPlus width={18} height={18} /> Add exercises
        </button>

        {!isNew && (
          <button className="btn danger block" onClick={del}>
            <IconTrash width={16} height={16} /> Delete routine
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- live session runner (full-screen) ----------

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Compact "previous performance" string for a logged set.
function formatPrev(set?: LoggedSet): string {
  if (!set) return '—'
  const p: string[] = []
  if (set.weight != null) p.push(`${set.weight}kg`)
  if (set.reps) p.push(set.weight != null ? `× ${set.reps}` : `${set.reps} reps`)
  if (set.seconds != null) p.push(`${set.seconds}s`)
  if (set.distance != null) p.push(`${set.distance}m`)
  return p.length ? p.join(' ') : '—'
}

// ---------- personal records ----------

// Best-ever marks per exercise, used to flag PRs during a live session.
type Bests = { weight: number; volume: number; reps: number; seconds: number; distance: number }
function emptyBests(): Bests {
  return { weight: 0, volume: 0, reps: 0, seconds: 0, distance: 0 }
}
// Parse a performed rep value ("8" -> 8, range "6-12" -> 12) for volume/PR math.
function repsNum(reps?: string): number {
  if (!reps) return 0
  const m = reps.match(/\d+/g)
  return m ? Number(m[m.length - 1]) : 0
}
// Aggregate personal bests per exercise across all saved sessions (warm-ups
// excluded). Set volume = weight × reps.
function computeBests(sessions: Record<string, WorkoutSession>): Map<string, Bests> {
  const map = new Map<string, Bests>()
  for (const s of Object.values(sessions)) {
    for (const se of s.exercises) {
      let b = map.get(se.exerciseId)
      if (!b) {
        b = emptyBests()
        map.set(se.exerciseId, b)
      }
      for (const set of se.sets) {
        if (set.warmup) continue
        const w = set.weight ?? 0
        const r = repsNum(set.reps)
        const vol = w * r
        if (w > b.weight) b.weight = w
        if (vol > b.volume) b.volume = vol
        if (r > b.reps) b.reps = r
        if ((set.seconds ?? 0) > b.seconds) b.seconds = set.seconds ?? 0
        if ((set.distance ?? 0) > b.distance) b.distance = set.distance ?? 0
      }
    }
  }
  return map
}
// PR badge for a completed set vs the historical baseline. 🔥 = best set volume,
// 🏆 = any other record (weight / reps / time / distance).
function prBadge(s: LoggedSet, baseline: Bests, fields: SetField[]): string | null {
  if (!s.done || s.warmup) return null
  const w = s.weight ?? 0
  const r = repsNum(s.reps)
  const vol = w * r
  const volPR = fields.includes('weight') && fields.includes('reps') && vol > 0 && vol > baseline.volume
  const weightPR = fields.includes('weight') && w > 0 && w > baseline.weight
  const repsPR = !fields.includes('weight') && fields.includes('reps') && r > 0 && r > baseline.reps
  const timePR =
    fields.includes('seconds') && !fields.includes('distance') && (s.seconds ?? 0) > baseline.seconds && (s.seconds ?? 0) > 0
  const distPR = fields.includes('distance') && (s.distance ?? 0) > baseline.distance && (s.distance ?? 0) > 0
  if (volPR) return '🔥'
  if (weightPR || repsPR || timePR || distPR) return '🏆'
  return null
}

// Global in-progress workout screen. Reads the single active workout from the
// store so it survives navigation and can be minimized to a banner.
export function WorkoutOverlay() {
  const workout = useStore((s) => s.workout)
  const minimized = useStore((s) => s.workoutMinimized)
  const updateWorkout = useStore((s) => s.updateWorkout)
  const finishWorkout = useStore((s) => s.finishWorkout)
  const discardWorkout = useStore((s) => s.discardWorkout)
  const setMinimized = useStore((s) => s.setWorkoutMinimized)
  const sessionsMap = useStore((s) => s.data.workoutSessions)

  const [byId, setById] = useState<Map<string, Exercise> | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [detailIdx, setDetailIdx] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    loadExercises()
      .then((list) => alive && setById(new Map(list.map((e) => [e.id, e]))))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const routineId = workout?.routineId
  const prevSession = useMemo(() => {
    if (!routineId) return null
    let best: WorkoutSession | null = null
    for (const s of Object.values(sessionsMap)) {
      if (s.routineId === routineId && (!best || s.finishedAt > best.finishedAt)) best = s
    }
    return best
  }, [sessionsMap, routineId])
  const bests = useMemo(() => computeBests(sessionsMap), [sessionsMap])
  const prevByExercise = useMemo(() => {
    const m = new Map<string, LoggedSet[]>()
    if (prevSession) for (const se of prevSession.exercises) if (!m.has(se.exerciseId)) m.set(se.exerciseId, se.sets)
    return m
  }, [prevSession])

  // Device Back minimizes the workout (never discards it).
  useBackButton(!!workout && !minimized, () => setMinimized(true))

  if (!workout || minimized) return null
  const w = workout

  const restOf = (ei: number) =>
    w.exercises[ei].restSeconds ?? byId?.get(w.exercises[ei].exerciseId)?.default_rest_seconds ?? 90
  const elapsed = now - w.startedAt
  const restLeft = w.restEndsAt != null ? Math.max(0, Math.ceil((w.restEndsAt - now) / 1000)) : 0
  const totalSets = w.exercises.reduce((n, e) => n + e.sets.length, 0)
  const doneSets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)

  const patchSet = (ei: number, si: number, patch: Partial<LoggedSet>) =>
    updateWorkout((x) => {
      x.exercises[ei].sets[si] = { ...x.exercises[ei].sets[si], ...patch }
    })
  const startRest = (sec: number) => {
    if (sec > 0)
      updateWorkout((x) => {
        x.restTotal = sec
        x.restEndsAt = Date.now() + sec * 1000
      })
  }
  const bumpRest = (delta: number) =>
    updateWorkout((x) => {
      if (x.restEndsAt != null) x.restEndsAt = Math.max(Date.now() + 1000, x.restEndsAt + delta * 1000)
    })
  const skipRest = () =>
    updateWorkout((x) => {
      x.restEndsAt = null
    })

  const toggleDone = (ei: number, si: number) => {
    primeAudio() // unlock audio within this user gesture so the rest beep plays
    const cur = w.exercises[ei].sets[si]
    if (cur.done) {
      updateWorkout((x) => {
        x.exercises[ei].sets[si] = { ...x.exercises[ei].sets[si], done: false }
      })
      return
    }
    const ex = byId?.get(w.exercises[ei].exerciseId)
    const fields = ex ? SET_FIELDS[ex.log_type] : []
    const prevSet = prevByExercise.get(w.exercises[ei].exerciseId)?.[si]
    if (!canCompleteSet(cur, prevSet, fields)) return
    const filled = { ...fillFromPrev(cur, prevSet, fields), done: true }
    updateWorkout((x) => {
      x.exercises[ei].sets[si] = filled
    })
    startRest(restOf(ei))
  }

  const finish = () => {
    if (doneSets > 0) finishWorkout()
  }
  const discard = () => {
    if (confirm('Discard this workout? Everything logged now will be lost.')) discardWorkout()
  }

  return (
    <div className="settings-overlay">
      <header className="app-header">
        <button className="icon-btn" onClick={() => setMinimized(true)} aria-label="Minimize workout">
          <IconChevronDown width={24} height={24} />
        </button>
        <div className="title">{fmtTime(elapsed)}</div>
        <div className="btn-row">
          <button className="btn danger sm" onClick={discard}>
            Discard
          </button>
          <button className="btn primary sm" onClick={finish} disabled={doneSets === 0}>
            Finish
          </button>
        </div>
      </header>

      <div
        className="main-scroll"
        style={{ paddingBottom: w.restEndsAt != null ? '92px' : 'calc(var(--safe-bottom) + 24px)' }}
      >
        <div className="card tight">
          <div className="tiny faint">{w.name}</div>
          <div className="small" style={{ fontWeight: 700 }}>
            {doneSets} / {totalSets} sets done
          </div>
        </div>

        {!byId ? (
          <div className="card">
            <div className="empty">
              <div className="small">Loading…</div>
            </div>
          </div>
        ) : (
          w.exercises.map((se, ei) => {
            const ex = byId.get(se.exerciseId)
            if (!ex) return null
            const fields = SET_FIELDS[ex.log_type]
            const prev = prevByExercise.get(se.exerciseId)
            const baseline = bests.get(se.exerciseId) ?? emptyBests()
            return (
              <div className="card" key={`${se.exerciseId}-${ei}`}>
                <button className="ex-name-btn" onClick={() => setDetailIdx(ei)}>
                  {ex.exercise_name}
                </button>
                <div className="ex-row-sub" style={{ marginBottom: 8 }}>
                  {ex.primary_muscle[0] ?? ex.body_region} · rest {restOf(ei)}s
                </div>
                <div className="set-head">
                  <span className="set-col-n">Set</span>
                  <span className="set-col-prev">Prev</span>
                  {fields.map((f) => (
                    <span key={f} className="set-col">
                      {SET_FIELD_LABEL[f]}
                    </span>
                  ))}
                  <span className="set-pr" />
                  <span className="set-col-x" />
                </div>
                {se.sets.map((s, si) => {
                  const working = se.sets.slice(0, si).filter((x) => !x.warmup).length + 1
                  const planned = se.planned[si]
                  const prevSet = prev?.[si]
                  const completable = canCompleteSet(s, prevSet, fields)
                  const badge = prBadge(s, baseline, fields)
                  return (
                    <div key={si} className={`set-row${s.done ? ' set-done' : ''}${s.warmup ? ' warmup' : ''}`}>
                      <span className="set-col-n set-num">{s.warmup ? 'W' : working}</span>
                      <span className="set-col-prev">{formatPrev(prevSet)}</span>
                      {fields.map((f) => (
                        <div key={f} className="set-col">
                          <SetFieldInput
                            field={f}
                            set={s}
                            placeholder={placeholderFor(f, planned, prevSet)}
                            onChange={(p) => patchSet(ei, si, p)}
                          />
                        </div>
                      ))}
                      <span className="set-pr" title="Personal record!">
                        {badge}
                      </span>
                      <button
                        className={`set-col-x set-check${s.done ? ' on' : ''}`}
                        disabled={!s.done && !completable}
                        onClick={() => toggleDone(ei, si)}
                        aria-label={s.done ? 'Mark set not done' : 'Mark set done'}
                      >
                        ✓
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {w.restEndsAt != null && (
        <div className="rest-bar">
          <div
            className="rest-progress"
            style={{ width: `${w.restTotal ? (restLeft / w.restTotal) * 100 : 0}%` }}
          />
          <button className="rest-adj" onClick={() => bumpRest(-15)}>
            −15s
          </button>
          <div className="rest-time">{fmtTime(restLeft * 1000)}</div>
          <button className="rest-adj" onClick={() => bumpRest(15)}>
            +15s
          </button>
          <button className="rest-skip" onClick={skipRest}>
            Skip
          </button>
        </div>
      )}

      <Sheet
        open={detailIdx != null}
        onClose={() => setDetailIdx(null)}
        title={detailIdx != null && byId ? byId.get(w.exercises[detailIdx].exerciseId)?.exercise_name : undefined}
      >
        {detailIdx != null &&
          byId &&
          (() => {
            const se = w.exercises[detailIdx]
            const ex = byId.get(se.exerciseId)
            if (!ex) return null
            const b = bests.get(ex.id)
            const weightBased = SET_FIELDS[ex.log_type].includes('weight')
            return (
              <>
                {se.note && (
                  <div className="card tight" style={{ marginBottom: 12 }}>
                    <div className="tiny faint">Note</div>
                    <div className="small">{se.note}</div>
                  </div>
                )}
                {b && (b.weight > 0 || b.volume > 0 || b.reps > 0 || b.seconds > 0) && (
                  <div className="ex-section">
                    <h3>Records</h3>
                    <ul>
                      {weightBased && b.weight > 0 && <li>Heaviest set: {b.weight} kg</li>}
                      {weightBased && b.volume > 0 && <li>Best set volume: {b.volume} (kg×reps)</li>}
                      {!weightBased && b.reps > 0 && <li>Most reps: {b.reps}</li>}
                      {b.seconds > 0 && <li>Longest: {b.seconds}s</li>}
                    </ul>
                  </div>
                )}
                <ExerciseDetail ex={ex} />
              </>
            )
          })()}
      </Sheet>
    </div>
  )
}

// Minimized workout bar shown across the whole app while a workout is active.
export function WorkoutBanner({ raised }: { raised?: boolean }) {
  const workout = useStore((s) => s.workout)
  const minimized = useStore((s) => s.workoutMinimized)
  const setMinimized = useStore((s) => s.setWorkoutMinimized)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!workout || !minimized) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [workout, minimized])

  if (!workout || !minimized) return null
  const resting = workout.restEndsAt != null && workout.restEndsAt > now
  const restLeft = resting ? Math.max(0, Math.ceil((workout.restEndsAt! - now) / 1000)) : 0
  return (
    <button className={`workout-banner${raised ? ' raised' : ''}`} onClick={() => setMinimized(false)}>
      <div className="workout-banner-main">
        <div className="workout-banner-name">{workout.name}</div>
        <div className="tiny faint">Workout in progress — tap to resume</div>
      </div>
      <div className="workout-banner-time">
        {resting ? `Rest ${fmtTime(restLeft * 1000)}` : fmtTime(now - workout.startedAt)}
      </div>
    </button>
  )
}

// ---------- routine card ----------

function relDate(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

function RoutineCard({
  routine,
  byId,
  lastDone,
  onStart,
}: {
  routine: Routine
  byId: Map<string, Exercise>
  lastDone: number | null
  onStart: () => void
}) {
  const total = routine.exercises.reduce((n, e) => n + e.sets.length, 0)
  return (
    <div className="card routine-card">
      <div className="routine-card-body">
        <div className="routine-card-name">{routine.name || 'Untitled routine'}</div>
        <div className="ex-row-sub">{summarize(routine, byId)}</div>
        <div className="tiny faint" style={{ marginTop: 6 }}>
          {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'} · {total} set
          {total === 1 ? '' : 's'}
          {lastDone != null && ` · last ${relDate(lastDone)}`}
        </div>
      </div>
      <button
        className="btn primary block sm routine-start"
        onClick={onStart}
        disabled={routine.exercises.length === 0}
      >
        Start Routine
      </button>
    </div>
  )
}

// ---------- routines list ----------

export function Routines({ exercises }: { exercises: Exercise[] }) {
  const routinesMap = useStore((s) => s.data.routines)
  const foldersMap = useStore((s) => s.data.routineFolders)
  const sessionsMap = useStore((s) => s.data.workoutSessions)
  const saveFolder = useStore((s) => s.saveFolder)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const startWorkout = useStore((s) => s.startWorkout)
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const [editing, setEditing] = useState<Routine | null>(null)
  const [folderForm, setFolderForm] = useState<{ id?: string; name: string } | null>(null)
  const [folderMenu, setFolderMenu] = useState<RoutineFolder | null>(null)
  // Which set of routines the "Edit routine" picker is choosing from.
  const [editPicker, setEditPicker] = useState<{ title: string; routines: Routine[] } | null>(null)
  // Groups are collapsed by default; this holds the ids the user has expanded.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const folders = useMemo(
    () => Object.values(foldersMap).sort((a, b) => a.createdAt - b.createdAt),
    [foldersMap],
  )
  const routines = useMemo(() => Object.values(routinesMap), [routinesMap])

  const lastDoneOf = (routineId: string): number | null => {
    let max: number | null = null
    for (const s of Object.values(sessionsMap)) {
      if (s.routineId === routineId && (max == null || s.finishedAt > max)) max = s.finishedAt
    }
    return max
  }

  const onStart = (r: Routine) => {
    // Only one workout can be active at a time.
    if (!startWorkout(r)) {
      alert('Finish or discard your current workout first.')
    }
  }

  const inFolder = (fid: string | null) =>
    routines
      .filter((r) => (r.folderId ?? null) === fid)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  const ungrouped = inFolder(null)

  const startNewRoutine = (folderId?: string) => {
    const now = Date.now()
    setExpanded((prev) => new Set(prev).add(folderId ?? UNGROUPED))
    setEditing({ id: rid(), name: '', folderId, exercises: [], createdAt: now, updatedAt: now })
  }

  const submitFolder = () => {
    if (!folderForm) return
    const name = folderForm.name.trim()
    if (!name) return
    if (folderForm.id) saveFolder({ ...foldersMap[folderForm.id], name })
    else saveFolder({ id: rid(), name, createdAt: Date.now(), updatedAt: Date.now() })
    setFolderForm(null)
  }

  if (editing) {
    return (
      <RoutineBuilder
        exercises={exercises}
        byId={byId}
        folders={folders}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    )
  }

  const renderCard = (r: Routine) => (
    <RoutineCard
      key={r.id}
      routine={r}
      byId={byId}
      lastDone={lastDoneOf(r.id)}
      onStart={() => onStart(r)}
    />
  )

  const menuList = folderMenu ? inFolder(folderMenu.id) : []
  const ungroupedTitle = folders.length > 0 ? 'Ungrouped' : 'Routines'

  const empty = folders.length === 0 && routines.length === 0

  return (
    <>
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => startNewRoutine()}>
          <IconPlus width={18} height={18} /> New routine
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => setFolderForm({ name: '' })}>
          <IconFolder width={17} height={17} /> New group
        </button>
      </div>

      {empty && (
        <div className="card">
          <div className="empty">
            <div className="big">🏋️</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No routines yet</div>
            <div className="small">
              Create a group (e.g. an Upper/Lower split) and add routines, or start with a single
              routine.
            </div>
          </div>
        </div>
      )}

      {folders.map((f) => {
        const list = inFolder(f.id)
        const isOpen = expanded.has(f.id)
        return (
          <div className="folder" key={f.id}>
            <div className="folder-head">
              <button className="folder-toggle" onClick={() => toggleExpanded(f.id)}>
                {isOpen ? (
                  <IconChevronDown width={16} height={16} />
                ) : (
                  <IconChevronRight width={16} height={16} />
                )}
                <span className="folder-name">{f.name}</span>
                <span className="folder-count">{list.length}</span>
              </button>
              <button className="icon-btn" onClick={() => setFolderMenu(f)} aria-label="Group options">
                <IconDots width={20} height={20} />
              </button>
            </div>
            {isOpen &&
              (list.length === 0 ? (
                <button className="folder-empty" onClick={() => startNewRoutine(f.id)}>
                  <IconPlus width={15} height={15} /> Add routine
                </button>
              ) : (
                list.map(renderCard)
              ))}
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div className="folder">
          <div className="folder-head">
            <button className="folder-toggle" onClick={() => toggleExpanded(UNGROUPED)}>
              {expanded.has(UNGROUPED) ? (
                <IconChevronDown width={16} height={16} />
              ) : (
                <IconChevronRight width={16} height={16} />
              )}
              <span className="folder-name">{ungroupedTitle}</span>
              <span className="folder-count">{ungrouped.length}</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => setEditPicker({ title: ungroupedTitle, routines: ungrouped })}
              aria-label="Edit a routine"
            >
              <IconDots width={20} height={20} />
            </button>
          </div>
          {expanded.has(UNGROUPED) && ungrouped.map(renderCard)}
        </div>
      )}

      {/* Create / rename group */}
      <Sheet
        open={folderForm != null}
        onClose={() => setFolderForm(null)}
        title={folderForm?.id ? 'Rename group' : 'New group'}
      >
        <input
          placeholder="Group name (e.g. Upper/Lower)"
          value={folderForm?.name ?? ''}
          onChange={(e) => setFolderForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
          style={{ marginBottom: 12 }}
          autoFocus
        />
        <button
          className="btn primary block"
          onClick={submitFolder}
          disabled={!folderForm?.name.trim()}
        >
          {folderForm?.id ? 'Save' : 'Create group'}
        </button>
      </Sheet>

      {/* Group actions */}
      <Sheet open={folderMenu != null} onClose={() => setFolderMenu(null)} title={folderMenu?.name}>
        <button
          className="btn block"
          style={{ marginBottom: 8 }}
          onClick={() => {
            const id = folderMenu!.id
            setFolderMenu(null)
            startNewRoutine(id)
          }}
        >
          <IconPlus width={16} height={16} /> Add routine
        </button>
        <button
          className="btn block"
          style={{ marginBottom: 8 }}
          disabled={menuList.length === 0}
          onClick={() => {
            const title = folderMenu!.name
            setFolderMenu(null)
            setEditPicker({ title, routines: menuList })
          }}
        >
          Edit routine
        </button>
        <button
          className="btn block"
          style={{ marginBottom: 8 }}
          onClick={() => {
            setFolderForm({ id: folderMenu!.id, name: folderMenu!.name })
            setFolderMenu(null)
          }}
        >
          Rename group
        </button>
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm('Delete this group? Its routines move to Ungrouped.')) {
              deleteFolder(folderMenu!.id)
              setFolderMenu(null)
            }
          }}
        >
          <IconTrash width={16} height={16} /> Delete group
        </button>
      </Sheet>

      {/* Pick which routine to edit */}
      <Sheet
        open={editPicker != null}
        onClose={() => setEditPicker(null)}
        title={editPicker ? `Edit routine · ${editPicker.title}` : 'Edit routine'}
      >
        {editPicker?.routines.length === 0 ? (
          <div className="small faint">No routines here yet.</div>
        ) : (
          editPicker?.routines.map((r) => (
            <button
              key={r.id}
              className="btn block"
              style={{ marginBottom: 8 }}
              onClick={() => {
                setEditPicker(null)
                setEditing(r)
              }}
            >
              {r.name || 'Untitled routine'}
            </button>
          ))
        )}
      </Sheet>
    </>
  )
}
