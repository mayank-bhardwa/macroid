import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/store'
import { Library } from './Library'
import { Sheet } from '../../components/Sheet'
import {
  SET_FIELDS,
  SET_FIELD_LABEL,
  type Exercise,
  type SetField,
} from '../../lib/exercises'
import type {
  Routine,
  RoutineExercise,
  RoutineSet,
  RoutineFolder,
  SessionExercise,
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

function SessionRunner({
  routine,
  byId,
  prevSession,
  onClose,
}: {
  routine: Routine
  byId: Map<string, Exercise>
  prevSession: WorkoutSession | null
  onClose: () => void
}) {
  const saveSession = useStore((s) => s.saveSession)
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [restTotal, setRestTotal] = useState(0)
  const [exs, setExs] = useState<SessionExercise[]>(() =>
    routine.exercises.map((re) => ({
      exerciseId: re.exerciseId,
      // Actuals start blank — planned targets show as input placeholders instead.
      sets: re.sets.map((s) => ({ warmup: s.warmup, done: false })),
    })),
  )

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  // Auto-dismiss the rest bar when the countdown elapses.
  useEffect(() => {
    if (restEndsAt != null && now >= restEndsAt) setRestEndsAt(null)
  }, [now, restEndsAt])

  const elapsed = now - startedAt
  const restLeft = restEndsAt != null ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : 0

  // Per-exercise rest, aligned with routine.exercises order: routine override →
  // catalog default → 90s fallback.
  const restSecs = useMemo(
    () =>
      routine.exercises.map(
        (re) => re.restSeconds ?? byId.get(re.exerciseId)?.default_rest_seconds ?? 90,
      ),
    [routine, byId],
  )

  // Last session's sets per exercise, for the "Prev" column.
  const prevByExercise = useMemo(() => {
    const m = new Map<string, LoggedSet[]>()
    if (prevSession) for (const se of prevSession.exercises) if (!m.has(se.exerciseId)) m.set(se.exerciseId, se.sets)
    return m
  }, [prevSession])

  const startRest = (sec: number) => {
    if (sec > 0) {
      setRestTotal(sec)
      setRestEndsAt(Date.now() + sec * 1000)
    }
  }
  const bumpRest = (delta: number) =>
    setRestEndsAt((prev) => (prev != null ? Math.max(Date.now() + 1000, prev + delta * 1000) : prev))

  const totalSets = exs.reduce((n, e) => n + e.sets.length, 0)
  const doneSets = exs.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)

  const patchSet = (ei: number, si: number, patch: Partial<LoggedSet>) =>
    setExs((prev) =>
      prev.map((e, i) =>
        i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : { ...s, ...patch })) },
      ),
    )
  const toggleDone = (ei: number, si: number) => {
    const cur = exs[ei].sets[si]
    if (cur.done) {
      setExs((prev) =>
        prev.map((e, i) =>
          i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : { ...s, done: false })) },
        ),
      )
      return
    }
    const ex = byId.get(exs[ei].exerciseId)
    const fields = ex ? SET_FIELDS[ex.log_type] : []
    const prevSet = prevByExercise.get(exs[ei].exerciseId)?.[si]
    // Guard: with no previous to borrow from, every required field must be set.
    if (!canCompleteSet(cur, prevSet, fields)) return
    const filled = { ...fillFromPrev(cur, prevSet, fields), done: true }
    setExs((prev) =>
      prev.map((e, i) =>
        i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : filled)) },
      ),
    )
    // Marking a set done kicks off that exercise's rest timer (Hevy-style).
    startRest(restSecs[ei])
  }

  const finish = () => {
    saveSession({
      id: rid(),
      routineId: routine.id,
      name: routine.name,
      startedAt,
      finishedAt: Date.now(),
      exercises: exs,
    })
    onClose()
  }
  const cancel = () => {
    if (doneSets === 0 || confirm('Discard this workout? Logged sets will be lost.')) onClose()
  }

  return (
    <div className="settings-overlay">
      <header className="app-header">
        <button className="icon-btn" onClick={cancel} aria-label="Cancel workout">
          <IconClose width={22} height={22} />
        </button>
        <div className="title">{fmtTime(elapsed)}</div>
        <button className="btn primary sm" onClick={finish} disabled={doneSets === 0}>
          Finish
        </button>
      </header>

      <div
        className="main-scroll"
        style={{ paddingBottom: restEndsAt != null ? '92px' : 'calc(var(--safe-bottom) + 24px)' }}
      >
        <div className="card tight">
          <div className="tiny faint">{routine.name}</div>
          <div className="small" style={{ fontWeight: 700 }}>
            {doneSets} / {totalSets} sets done
          </div>
        </div>

        {exs.map((se, ei) => {
          const ex = byId.get(se.exerciseId)
          if (!ex) return null
          const fields = SET_FIELDS[ex.log_type]
          const prev = prevByExercise.get(se.exerciseId)
          return (
            <div className="card" key={`${se.exerciseId}-${ei}`}>
              <div className="ex-row-name">{ex.exercise_name}</div>
              <div className="ex-row-sub" style={{ marginBottom: 8 }}>
                {ex.primary_muscle[0] ?? ex.body_region} · rest {restSecs[ei]}s
              </div>
              <div className="set-head">
                <span className="set-col-n">Set</span>
                <span className="set-col-prev">Prev</span>
                {fields.map((f) => (
                  <span key={f} className="set-col">
                    {SET_FIELD_LABEL[f]}
                  </span>
                ))}
                <span className="set-col-x" />
              </div>
              {se.sets.map((s, si) => {
                const working = se.sets.slice(0, si).filter((x) => !x.warmup).length + 1
                const planned = routine.exercises[ei]?.sets[si]
                const prevSet = prev?.[si]
                const completable = canCompleteSet(s, prevSet, fields)
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
        })}
      </div>

      {restEndsAt != null && (
        <div className="rest-bar">
          <div
            className="rest-progress"
            style={{ width: `${restTotal ? (restLeft / restTotal) * 100 : 0}%` }}
          />
          <button className="rest-adj" onClick={() => bumpRest(-15)}>
            −15s
          </button>
          <div className="rest-time">{fmtTime(restLeft * 1000)}</div>
          <button className="rest-adj" onClick={() => bumpRest(15)}>
            +15s
          </button>
          <button className="rest-skip" onClick={() => setRestEndsAt(null)}>
            Skip
          </button>
        </div>
      )}
    </div>
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
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const [editing, setEditing] = useState<Routine | null>(null)
  const [running, setRunning] = useState<Routine | null>(null)
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

  const prevSessionOf = (routineId: string): WorkoutSession | null => {
    let best: WorkoutSession | null = null
    for (const s of Object.values(sessionsMap)) {
      if (s.routineId === routineId && (!best || s.finishedAt > best.finishedAt)) best = s
    }
    return best
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

  if (running) {
    return <SessionRunner routine={running} byId={byId} prevSession={prevSessionOf(running.id)} onClose={() => setRunning(null)} />
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
      onStart={() => setRunning(r)}
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
