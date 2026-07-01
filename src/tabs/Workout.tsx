import { useEffect, useState } from 'react'
import { Library } from './workout/Library'
import { Routines } from './workout/Routines'
import { WorkoutTrends } from './workout/Trends'
import { loadExercises, type Exercise } from '../lib/exercises'

// Workout mode is kept completely separate from the diet/nutrition app.
//
// Three sections, Hevy-style:
//  - Routines: build & manage multi-exercise routines (select from the library,
//    configure sets/reps/rest per exercise).
//  - Exercises: browse/search/filter the shared catalog with a detail view.
//  - Trends: weekly consistency streak + training-day history.

type Section = 'routines' | 'exercises' | 'trends'

export function WorkoutTab() {
  const [section, setSection] = useState<Section>('routines')
  const [all, setAll] = useState<Exercise[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadExercises()
      .then((list) => alive && setAll(list))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load'))
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Couldn’t load exercises</div>
          <div className="small">{error}</div>
        </div>
      </div>
    )
  }

  if (!all) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">🏋️</div>
          <div className="small">Loading exercise library…</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card tight">
        <div className="segmented">
          <button
            className={section === 'routines' ? 'active' : ''}
            onClick={() => setSection('routines')}
          >
            Routines
          </button>
          <button
            className={section === 'exercises' ? 'active' : ''}
            onClick={() => setSection('exercises')}
          >
            Exercises
          </button>
          <button
            className={section === 'trends' ? 'active' : ''}
            onClick={() => setSection('trends')}
          >
            Trends
          </button>
        </div>
      </div>

      {section === 'routines' ? (
        <Routines exercises={all} />
      ) : section === 'exercises' ? (
        <Library exercises={all} />
      ) : (
        <WorkoutTrends />
      )}
    </>
  )
}
