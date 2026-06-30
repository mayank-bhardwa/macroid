import { useMemo, useState } from 'react'
import { Sheet } from '../../components/Sheet'
import {
  LOG_TYPE_LABEL,
  type Exercise,
  type Difficulty,
} from '../../lib/exercises'

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  Beginner: '#3fb96b',
  Intermediate: '#e0a93f',
  Advanced: '#e0603f',
}

// A horizontal chip row with a leading "All" option. Selecting "All" clears the
// filter (value === null).
function FilterRow({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <div className="chips">
      <button
        className={`chip${value === null ? ' active' : ''}`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {options.map((o) => (
        <button
          key={o}
          className={`chip${value === o ? ' active' : ''}`}
          onClick={() => onChange(value === o ? null : o)}
        >
          {o}
        </button>
      ))}
    </div>
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
  const [region, setRegion] = useState<string | null>(null)
  const [equipment, setEquipment] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<string | null>(null)
  const [detail, setDetail] = useState<Exercise | null>(null)

  const { regions, equipments } = useMemo(() => {
    const r = [...new Set(exercises.map((e) => e.body_region))].sort()
    const eq = [...new Set(exercises.map((e) => e.equipment_category))].sort()
    return { regions: r, equipments: eq }
  }, [exercises])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return exercises.filter((e) => {
      if (region && e.body_region !== region) return false
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
  }, [exercises, query, region, equipment, difficulty])

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
        <FilterRow options={regions} value={region} onChange={setRegion} />
        <div style={{ height: 8 }} />
        <FilterRow options={equipments} value={equipment} onChange={setEquipment} />
        <div style={{ height: 8 }} />
        <FilterRow
          options={['Beginner', 'Intermediate', 'Advanced']}
          value={difficulty}
          onChange={setDifficulty}
        />
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
    </>
  )
}
