// Exercise catalog — static, read-only reference data shared by everyone.
//
// The catalog ships as `public/exercises.json` and is lazy-fetched the first
// time the Workout → Library opens (kept out of the main JS bundle so the diet
// app stays lean). The service worker caches it network-first, so once loaded
// it stays available offline. Routines (per-user, synced) reference exercises
// by `id`, so catalog updates never rewrite a saved routine.

// How a single set of an exercise is recorded — the field that will drive the
// set-logging UI in a later phase.
export type LogType =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'duration'
  | 'reps_only'
  | 'weight_distance'
  | 'duration_distance'

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'
export type Mechanic = 'Compound' | 'Isolation'

// One catalog entry. Field names mirror `public/exercises.json` verbatim so the
// JSON can be typed directly with no mapping layer.
export type Exercise = {
  id: string
  exercise_name: string
  category: string[]
  body_region: string
  primary_muscle: string[]
  secondary_muscle: string[]
  mechanic: Mechanic
  force_type: string
  difficulty: Difficulty
  equipment_needed: string[]
  equipment_category: string
  log_type: LogType
  implement_count: number
  unilateral: boolean
  default_rest_seconds: number | null
  recommended_rep_range: Record<string, string> | null
  how_to_do: string
  form_cues: string[]
  common_mistakes: string[]
}

// Short human label for each log type (used on badges / detail).
export const LOG_TYPE_LABEL: Record<LogType, string> = {
  weight_reps: 'Weight × Reps',
  bodyweight_reps: 'Bodyweight Reps',
  duration: 'Duration',
  reps_only: 'Reps',
  weight_distance: 'Load + Distance',
  duration_distance: 'Time + Distance',
}

let cache: Exercise[] | null = null
let inflight: Promise<Exercise[]> | null = null

// Fetch (and memoise) the catalog. Resolves instantly on subsequent calls.
export function loadExercises(): Promise<Exercise[]> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = fetch('/exercises.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load exercises (${r.status})`)
      return r.json() as Promise<Exercise[]>
    })
    .then((data) => {
      cache = data
      inflight = null
      return data
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight
}
