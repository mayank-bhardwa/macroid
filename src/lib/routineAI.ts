import type { Routine, RoutineExercise, RoutineFolder, RoutineSet } from '../types'

// The exercise catalog is committed to the public repo, so any AI assistant can
// fetch it by URL to look up real exercise ids.
export const EXERCISE_LIBRARY_URL =
  'https://raw.githubusercontent.com/mayank-bhardwa/macroid/main/public/exercises.json'

function rid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const AI_ROUTINE_INSTRUCTIONS = [
  'You are a strength & conditioning coach. Build workout ROUTINES that match the GOAL in',
  'the "goal" field, then return the COMPLETE JSON object with the same top-level structure.',
  'Return ONLY valid JSON — no prose, no markdown fences.',
  '',
  'EXERCISES: you MUST use exercises from the Macroid exercise library at the URL in the',
  '"exerciseLibrary" field — fetch it. Reference each exercise by its exact "id"',
  '(e.g. "barbell-bench-press"). Do NOT invent ids. Each library entry has fields like',
  'body_region, primary_muscle, equipment_category, mechanic, difficulty and log_type —',
  'pick exercises whose fields fit your intent and the available equipment.',
  '',
  'Fill "routines" (create as many as the split needs):',
  '- name: the routine name (e.g. "Upper A", "Push Day").',
  '- group: OPTIONAL. Routines that share a group name are placed together in that folder',
  '  (e.g. an "Upper / Lower Split" holding Upper A / Lower A / Upper B / Lower B). Omit for',
  '  ungrouped routines.',
  '- exercises: an ORDERED list. Each item has:',
  '  - exerciseId: an id copied from the library.',
  '  - sets: ordered planned sets. Each set is { "reps": "8" } or a range { "reps": "6-10" }',
  '    (reps is a STRING). Mark warm-up sets with "warmup": true. For time-based moves use',
  '    { "seconds": 45 } instead of reps. Do NOT include weight — the user fills that while',
  '    training.',
  '  - restSeconds: OPTIONAL rest between sets; omit to use the exercise\u2019s own default.',
  '  - note: OPTIONAL short coaching cue.',
  '',
  'Keep it realistic: about 4\u20138 exercises per routine and 2\u20134 working sets each, and start',
  'compound lifts with a warm-up set.',
].join('\n')

// The template object the AI must fill and return.
export function buildAiRoutineTemplate(): Record<string, unknown> {
  return {
    $schema: 'macroid-routines/v1',
    instructions: AI_ROUTINE_INSTRUCTIONS,
    goal:
      '<<DESCRIBE YOUR GOAL — e.g. "4-day upper/lower split for an intermediate lifter, barbell + dumbbell + machines, hypertrophy focus, ~60 min sessions">>',
    exerciseLibrary: EXERCISE_LIBRARY_URL,
    routines: [
      {
        name: 'Upper A',
        group: 'Upper / Lower Split',
        exercises: [
          {
            exerciseId: '<<exercise-id-from-library>>',
            sets: [{ reps: '6-8', warmup: true }, { reps: '6-8' }, { reps: '6-8' }],
            restSeconds: 120,
            note: '',
          },
        ],
      },
    ],
  }
}

// A ready-to-paste prompt (instructions + the JSON to fill).
export function buildAiRoutinePromptText(): string {
  const tpl = buildAiRoutineTemplate()
  return `${AI_ROUTINE_INSTRUCTIONS}\n\nExercise library: ${EXERCISE_LIBRARY_URL}\n\nFill in this JSON and return it complete:\n\n${JSON.stringify(
    tpl,
    null,
    2,
  )}`
}

export type RoutinesImport = { folders: RoutineFolder[]; routines: Routine[]; warnings: string[] }

// Validate/repair an AI (or hand-written) routines bundle against the catalog.
// Unknown exercise ids are dropped (with a warning); groups are derived from the
// per-routine "group" name.
export function validateAndRepairRoutines(raw: unknown, validIds: Set<string>): RoutinesImport {
  const warnings: string[] = []
  const root = raw as { routines?: unknown } | unknown[]
  const arr: unknown[] = Array.isArray(root)
    ? root
    : Array.isArray((root as { routines?: unknown })?.routines)
      ? ((root as { routines: unknown[] }).routines)
      : []
  if (arr.length === 0) {
    warnings.push('No "routines" array found in the file.')
    return { folders: [], routines: [], warnings }
  }

  const now = Date.now()
  const folderByName = new Map<string, RoutineFolder>()
  const routines: Routine[] = []
  let droppedEx = 0

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const exercisesRaw = Array.isArray(r.exercises) ? r.exercises : []
    const exercises: RoutineExercise[] = []

    for (const eItem of exercisesRaw) {
      if (!eItem || typeof eItem !== 'object') continue
      const e = eItem as Record<string, unknown>
      const id = typeof e.exerciseId === 'string' ? e.exerciseId.trim() : ''
      if (!validIds.has(id)) {
        if (id) droppedEx++
        continue
      }
      const setsRaw = Array.isArray(e.sets) ? e.sets : []
      const sets: RoutineSet[] = []
      for (const sItem of setsRaw) {
        const set: RoutineSet = {}
        if (sItem && typeof sItem === 'object') {
          const s = sItem as Record<string, unknown>
          if (typeof s.reps === 'string' && s.reps.trim()) set.reps = s.reps.trim()
          else if (typeof s.reps === 'number' && Number.isFinite(s.reps)) set.reps = String(s.reps)
          if (typeof s.weight === 'number' && Number.isFinite(s.weight)) set.weight = s.weight
          if (typeof s.seconds === 'number' && Number.isFinite(s.seconds)) set.seconds = s.seconds
          if (typeof s.distance === 'number' && Number.isFinite(s.distance)) set.distance = s.distance
          if (s.warmup === true) set.warmup = true
        }
        sets.push(set)
      }
      const re: RoutineExercise = { exerciseId: id, sets: sets.length ? sets : [{}] }
      if (typeof e.restSeconds === 'number' && Number.isFinite(e.restSeconds) && e.restSeconds > 0) {
        re.restSeconds = Math.round(e.restSeconds)
      }
      if (typeof e.note === 'string' && e.note.trim()) re.note = e.note.trim()
      exercises.push(re)
    }

    if (exercises.length === 0) {
      if (name) warnings.push(`Skipped "${name}" — no valid exercises.`)
      continue
    }

    let folderId: string | undefined
    const groupName = typeof r.group === 'string' ? r.group.trim() : ''
    if (groupName) {
      const key = groupName.toLowerCase()
      let f = folderByName.get(key)
      if (!f) {
        f = { id: rid(), name: groupName, createdAt: now, updatedAt: now }
        folderByName.set(key, f)
      }
      folderId = f.id
    }

    routines.push({
      id: rid(),
      name: name || 'Imported routine',
      folderId,
      exercises,
      createdAt: now,
      updatedAt: now,
    })
  }

  if (droppedEx > 0) {
    warnings.push(`${droppedEx} exercise${droppedEx === 1 ? '' : 's'} skipped (unknown id).`)
  }
  return { folders: [...folderByName.values()], routines, warnings }
}

export function summarizeRoutines(imp: RoutinesImport): string[] {
  const out: string[] = []
  if (imp.folders.length) {
    out.push(`${imp.folders.length} group${imp.folders.length === 1 ? '' : 's'}: ${imp.folders.map((f) => f.name).join(', ')}`)
  }
  out.push(`${imp.routines.length} routine${imp.routines.length === 1 ? '' : 's'}`)
  for (const r of imp.routines) out.push(`• ${r.name} — ${r.exercises.length} exercise${r.exercises.length === 1 ? '' : 's'}`)
  return out
}
