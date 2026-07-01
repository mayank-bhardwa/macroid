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

// Which input fields a single set exposes, per log type. Drives the routine
// set editor (and, later, the live logging UI).
export type SetField = 'weight' | 'reps' | 'seconds' | 'distance'

export const SET_FIELDS: Record<LogType, SetField[]> = {
  weight_reps: ['weight', 'reps'],
  bodyweight_reps: ['reps'],
  reps_only: ['reps'],
  duration: ['seconds'],
  weight_distance: ['weight', 'distance'],
  duration_distance: ['seconds', 'distance'],
}

export const SET_FIELD_LABEL: Record<SetField, string> = {
  weight: 'kg',
  reps: 'reps',
  seconds: 'sec',
  distance: 'm',
}

// Map the catalog's 65 granular `primary_muscle` strings onto a tidy set of
// muscle groups for the library's Muscle filter (e.g. "Biceps Brachii",
// "Brachialis" → Biceps). First matching rule wins, so order matters.
const MUSCLE_RULES: [RegExp, string][] = [
  [/tricep/, 'Triceps'],
  [/bicep|brachialis/, 'Biceps'],
  [/forearm|brachioradialis/, 'Forearms'],
  [/delt|rotator cuff|scapular|shoulder/, 'Shoulders'],
  [/pec|chest/, 'Chest'],
  [/lat|latissimus/, 'Lats'],
  [/trap/, 'Traps'],
  [/thoracic|mid-back|upper back/, 'Upper Back'],
  [/spinal erector|lower back|\bspine/, 'Lower Back'],
  [/quad/, 'Quads'],
  [/hamstring/, 'Hamstrings'],
  [/glute/, 'Glutes'],
  [/calf|calve|gastrocnemius|soleus/, 'Calves'],
  [/adductor/, 'Adductors'],
  [/hip|iliotibial/, 'Hip Flexors'],
  [/oblique|abdominal|rectus|core/, 'Abs'],
  [/neck/, 'Neck'],
  [/cardio/, 'Cardio'],
  [/full body/, 'Full Body'],
]

// Preferred display order for the Muscle filter (groups not listed sort last).
export const MUSCLE_GROUP_ORDER = [
  'Chest', 'Lats', 'Upper Back', 'Traps', 'Lower Back', 'Shoulders',
  'Biceps', 'Triceps', 'Forearms', 'Abs', 'Quads', 'Hamstrings', 'Glutes',
  'Calves', 'Adductors', 'Hip Flexors', 'Neck', 'Cardio', 'Full Body', 'Other',
]

function classifyMuscle(raw: string): string {
  const m = raw.toLowerCase()
  for (const [re, group] of MUSCLE_RULES) if (re.test(m)) return group
  return 'Other'
}

// The distinct muscle groups an exercise primarily trains.
export function muscleGroupsOf(primaryMuscles: string[]): string[] {
  return [...new Set(primaryMuscles.map(classifyMuscle))]
}

let cache: Exercise[] | null = null
let byId: Map<string, Exercise> | null = null
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
      byId = new Map(data.map((e) => [e.id, e]))
      inflight = null
      return data
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight
}

// Synchronous lookup by id once the catalog has loaded; null before then.
export function getExercise(id: string): Exercise | null {
  return byId?.get(id) ?? null
}
