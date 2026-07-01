import { useMemo, useState } from 'react'
import { Sheet } from '../../components/Sheet'
import {
  LOG_TYPE_LABEL,
  muscleGroupsOf,
  MUSCLE_GROUP_ORDER,
  type Exercise,
  type Difficulty,
} from '../../lib/exercises'

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  Beginner: '#3fb96b',
  Intermediate: '#e0a93f',
  Advanced: '#e0603f',
}

// A compact filter pill. Shows the active value (or a default label) and opens
// a picker sheet when tapped; highlighted while a value is selected.
function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={`filter-pill${active ? ' active' : ''}`} onClick={onClick}>
      {label}
      <span className="filter-caret" aria-hidden>
        ▾
      </span>
    </button>
  )
}

export function ExerciseDetail({ ex }: { ex: Exercise }) {
  const reps = ex.recommended_rep_range
  return (
    <div className="ex-detail">
      <div className="chips" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <span
          className="badge"
          style={{ background: DIFFICULTY_COLOR[ex.difficulty], color: '#0f1115' }}
        >
          {ex.difficulty}
        </span>
        <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-dim)' }}>
          {ex.mechanic}
        </span>
        <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-dim)' }}>
          {LOG_TYPE_LABEL[ex.log_type]}
        </span>
        {ex.unilateral && (
          <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-dim)' }}>
            Unilateral
          </span>
        )}
      </div>

      <p className="small" style={{ lineHeight: 1.5, marginBottom: 14 }}>
        {ex.how_to_do}
      </p>

      <dl className="ex-facts">
        <div>
          <dt>Body region</dt>
          <dd>{ex.body_region}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{ex.category.join(', ')}</dd>
        </div>
        <div>
          <dt>Primary</dt>
          <dd>{ex.primary_muscle.join(', ')}</dd>
        </div>
        {ex.secondary_muscle.length > 0 && (
          <div>
            <dt>Secondary</dt>
            <dd>{ex.secondary_muscle.join(', ')}</dd>
          </div>
        )}
        <div>
          <dt>Equipment</dt>
          <dd>{ex.equipment_needed.join(', ') || ex.equipment_category}</dd>
        </div>
        {ex.default_rest_seconds != null && (
          <div>
            <dt>Rest</dt>
            <dd>{ex.default_rest_seconds}s</dd>
          </div>
        )}
        {reps && (
          <div>
            <dt>Rep range</dt>
            <dd>
              {Object.entries(reps)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ')}
            </dd>
          </div>
        )}
      </dl>

      {ex.form_cues.length > 0 && (
        <div className="ex-section">
          <h3>Form cues</h3>
          <ul>
            {ex.form_cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {ex.common_mistakes.length > 0 && (
        <div className="ex-section">
          <h3>Common mistakes</h3>
          <ul>
            {ex.common_mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// The exercise library. In browse mode (default) tapping a row opens its detail
// sheet. In pick mode (`onToggle` provided) rows become multi-select.
export function Library({
  exercises,
  selection,
  onToggle,
}: {
  exercises: Exercise[]
  selection?: Set<string>
  onToggle?: (id: string) => void
}) {
  const pick = !!onToggle
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [equipment, setEquipment] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<string | null>(null)
  const [detail, setDetail] = useState<Exercise | null>(null)
  const [openFilter, setOpenFilter] = useState<'muscle' | 'equipment' | 'difficulty' | null>(null)

  const { muscles, equipments, groupsByEx } = useMemo(() => {
    const groupsByEx = new Map<string, string[]>()
    const present = new Set<string>()
    for (const e of exercises) {
      const g = muscleGroupsOf(e.primary_muscle)
      groupsByEx.set(e.id, g)
      for (const x of g) present.add(x)
    }
    const rank = (x: string) => {
      const i = MUSCLE_GROUP_ORDER.indexOf(x)
      return i === -1 ? 999 : i
    }
    const muscles = [...present].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    const eq = [...new Set(exercises.map((e) => e.equipment_category))].sort()
    return { muscles, equipments: eq, groupsByEx }
  }, [exercises])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return exercises.filter((e) => {
      if (muscle && !groupsByEx.get(e.id)?.includes(muscle)) return false
      if (equipment && e.equipment_category !== equipment) return false
      if (difficulty && e.difficulty !== difficulty) return false
      if (q) {
        const hay = (
          e.exercise_name +
          ' ' +
          e.primary_muscle.join(' ') +
          ' ' +
          e.category.join(' ')
        ).toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [exercises, query, muscle, equipment, difficulty, groupsByEx])

  const anyActive = !!(muscle || equipment || difficulty)
  const filterDefs: Record<
    'muscle' | 'equipment' | 'difficulty',
    { title: string; value: string | null; set: (v: string | null) => void; options: string[] }
  > = {
    muscle: { title: 'Muscle', value: muscle, set: setMuscle, options: muscles },
    equipment: { title: 'Equipment', value: equipment, set: setEquipment, options: equipments },
    difficulty: {
      title: 'Level',
      value: difficulty,
      set: setDifficulty,
      options: ['Beginner', 'Intermediate', 'Advanced'],
    },
  }
  const activeDef = openFilter ? filterDefs[openFilter] : null

  return (
    <>
      <div className="card">
        <input
          type="search"
          placeholder="Search exercises, muscles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div className="filter-bar">
          <FilterButton
            label={muscle ?? 'Muscle'}
            active={!!muscle}
            onClick={() => setOpenFilter('muscle')}
          />
          <FilterButton
            label={equipment ?? 'Equipment'}
            active={!!equipment}
            onClick={() => setOpenFilter('equipment')}
          />
          <FilterButton
            label={difficulty ?? 'Level'}
            active={!!difficulty}
            onClick={() => setOpenFilter('difficulty')}
          />
          {anyActive && (
            <button
              className="filter-clear"
              onClick={() => {
                setMuscle(null)
                setEquipment(null)
                setDifficulty(null)
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tiny faint" style={{ marginBottom: 4 }}>
          {results.length} exercise{results.length === 1 ? '' : 's'}
        </div>
        {results.length === 0 ? (
          <div className="empty">
            <div className="small">No exercises match those filters.</div>
          </div>
        ) : (
          results.map((ex) => {
            const selected = pick && selection?.has(ex.id)
            return (
              <button
                key={ex.id}
                className="ex-row"
                onClick={() => (pick ? onToggle!(ex.id) : setDetail(ex))}
              >
                {pick && (
                  <span className={`ex-check${selected ? ' on' : ''}`} aria-hidden>
                    {selected ? '✓' : ''}
                  </span>
                )}
                <div className="ex-row-main">
                  <div className="ex-row-name">{ex.exercise_name}</div>
                  <div className="ex-row-sub">
                    {ex.body_region} · {ex.primary_muscle[0] ?? '—'} · {ex.equipment_category}
                  </div>
                </div>
                {!pick && (
                  <span
                    className="badge"
                    style={{
                      background: DIFFICULTY_COLOR[ex.difficulty],
                      color: '#0f1115',
                      flex: '0 0 auto',
                    }}
                  >
                    {ex.difficulty[0]}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>

      {!pick && (
        <Sheet open={detail != null} onClose={() => setDetail(null)} title={detail?.exercise_name}>
          {detail && <ExerciseDetail ex={detail} />}
        </Sheet>
      )}

      <Sheet open={activeDef != null} onClose={() => setOpenFilter(null)} title={activeDef?.title}>
        {activeDef && (
          <div className="filter-options">
            <button
              className={`filter-opt${!activeDef.value ? ' active' : ''}`}
              onClick={() => {
                activeDef.set(null)
                setOpenFilter(null)
              }}
            >
              <span>All</span>
              {!activeDef.value && <span aria-hidden>✓</span>}
            </button>
            {activeDef.options.map((o) => (
              <button
                key={o}
                className={`filter-opt${activeDef.value === o ? ' active' : ''}`}
                onClick={() => {
                  activeDef.set(o)
                  setOpenFilter(null)
                }}
              >
                <span>{o}</span>
                {activeDef.value === o && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  )
}
