import { useMemo, useState } from 'react'
import { useStore } from '../../store/store'
import { Library } from './Library'
import {
  SET_FIELDS,
  SET_FIELD_LABEL,
  type Exercise,
  type SetField,
} from '../../lib/exercises'
import type { Routine, RoutineExercise, RoutineSet } from '../../types'
import {
  IconClose,
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
} from '../../components/icons'

function rid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

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
  onChange,
}: {
  field: SetField
  set: RoutineSet
  onChange: (patch: Partial<RoutineSet>) => void
}) {
  if (field === 'reps') {
    return (
      <input
        className="set-input"
        inputMode="numeric"
        placeholder="reps"
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
      placeholder={SET_FIELD_LABEL[field]}
      value={val ?? ''}
      onChange={(e) => {
        const n = e.target.value === '' ? undefined : Number(e.target.value)
        onChange({ [key]: Number.isFinite(n as number) ? n : undefined } as Partial<RoutineSet>)
      }}
    />
  )
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
  initial,
  onClose,
}: {
  exercises: Exercise[]
  byId: Map<string, Exercise>
  initial: Routine
  onClose: () => void
}) {
  const saveRoutine = useStore((s) => s.saveRoutine)
  const deleteRoutine = useStore((s) => s.deleteRoutine)
  const isNew = !useStore((s) => s.data.routines[initial.id])

  const [name, setName] = useState(initial.name)
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
    saveRoutine({ ...initial, name: name.trim(), exercises: items })
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
            style={{ fontSize: 17, fontWeight: 700 }}
          />
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

// ---------- routines list ----------

export function Routines({ exercises }: { exercises: Exercise[] }) {
  const routinesMap = useStore((s) => s.data.routines)
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])
  const [editing, setEditing] = useState<Routine | null>(null)

  const routines = useMemo(
    () => Object.values(routinesMap).sort((a, b) => b.updatedAt - a.updatedAt),
    [routinesMap],
  )

  const startNew = () => {
    const now = Date.now()
    setEditing({ id: rid(), name: '', exercises: [], createdAt: now, updatedAt: now })
  }

  if (editing) {
    return (
      <RoutineBuilder
        exercises={exercises}
        byId={byId}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <>
      <button className="btn primary block" onClick={startNew} style={{ marginBottom: 12 }}>
        <IconPlus width={18} height={18} /> New routine
      </button>

      {routines.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">🏋️</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No routines yet</div>
            <div className="small">Create a routine and add exercises from the library.</div>
          </div>
        </div>
      ) : (
        routines.map((r) => {
          const total = r.exercises.reduce((n, e) => n + e.sets.length, 0)
          return (
            <button key={r.id} className="card routine-card" onClick={() => setEditing(r)}>
              <div className="routine-card-name">{r.name || 'Untitled routine'}</div>
              <div className="ex-row-sub">{summarize(r, byId)}</div>
              <div className="tiny faint" style={{ marginTop: 6 }}>
                {r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'} · {total} set
                {total === 1 ? '' : 's'}
              </div>
            </button>
          )
        })
      )}
    </>
  )
}
