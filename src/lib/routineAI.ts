import type { Routine, RoutineExercise, RoutineFolder, RoutineSet } from '../types'
import type { Exercise } from './exercises'

// The exercise catalog is committed to the public repo, so any AI assistant can
// fetch it by URL to look up real exercise ids.
export const EXERCISE_LIBRARY_URL =
  'https://raw.githubusercontent.com/mayank-bhardwa/macroid/main/public/exercises.json'

function rid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const AI_ROUTINE_INSTRUCTIONS = [
  'You are an expert strength & conditioning and physique coach. Your job is to design a',
  'workout program the user will import into the Macroid app.',
  '',
  'STEP 1 — INTERVIEW FIRST. Do NOT output any JSON yet. Ask the user a short, friendly set',
  'of questions and WAIT for their answers (ask brief follow-ups only if something is',
  'unclear). Cover:',
  '- Main goal: fat loss, muscle gain, body recomposition, strength, or endurance.',
  '- Current condition & experience: beginner / intermediate / advanced, how they train now,',
  '  and (optional) rough bodyweight/height.',
  '- Injuries, pain points, or movements to avoid.',
  '- Weekly commitment: how many days per week, and how long per session.',
  '- Equipment available: full gym, dumbbells only, home/bodyweight, bands, etc.',
  '- Preferences/dislikes and cardio tolerance.',
  'Keep it to a handful of clear questions — do not overwhelm them.',
  '',
  'STEP 2 — After you have the answers, design the program and return ONLY the JSON object',
  'below (no prose, no markdown fences), keeping the same structure.',
  '',
  'EXERCISES: the complete Macroid exercise library is listed at the END of this message',
  '(grouped by body region, one per line as "id \u2014 Name (equipment)"). You MUST use only ids',
  'that appear in that list, copied EXACTLY character-for-character. Never invent, guess,',
  'shorten, re-order or reformat an id \u2014 e.g. it is "cable-triceps-pushdown", not',
  '"cable-tricep-pushdown", and "barbell-back-squat", not "barbell-squat". If you cannot find',
  'an exact name match, pick the closest exercise that IS in the list. Match each exercise to',
  'the user\u2019s goal and available equipment.',
  '',
  'STRUCTURE each routine as a full session:',
  '1. WARM-UP: 1\u20133 mobility / activation / light-cardio moves (library category Warm-Up,',
  '   Mobility or Activation) — usually timed, e.g. { "seconds": 40 }.',
  '2. MAIN WORK: the compound and accessory lifts for the day.',
  '3. COOL-DOWN: 1\u20132 stretching / flexibility moves (category Flexibility or Recovery),',
  '   usually { "seconds": 30 } holds.',
  '',
  'DETAILS:',
  '- Warm-up SETS: on the first heavy compound for a muscle group, add 1\u20132 ramp-up sets',
  '  marked "warmup": true before the working sets.',
  '- REST: set "restSeconds" to fit the effort — ~120\u2013180s for heavy compounds, ~60\u201390s for',
  '  accessories, ~20\u201345s (or omit) for mobility/stretching. Adjust per exercise.',
  '- NOTES: use the "note" field to coach — suggest a starting load, rep target, tempo or RPE,',
  '  or a hold time. E.g. "Start ~RPE 7; add load when you reach the top of the range" or',
  '  "Hold 30s each side". Do NOT put actual weight in the sets — the user logs that while',
  '  training; reps are targets written as a STRING ("8" or a range "6-10").',
  '- Match volume, rep ranges and rest to the goal: higher reps + shorter rest for fat',
  '  loss/endurance, moderate reps for hypertrophy/recomp, lower reps + longer rest for',
  '  strength. Match the number of routines to the days/week they committed to, and group',
  '  a multi-day split under one "group" name (e.g. Upper A / Lower A / Upper B / Lower B).',
].join('\n')

// The template object the AI must fill and return AFTER the interview.
export function buildAiRoutineTemplate(): Record<string, unknown> {
  return {
    $schema: 'macroid-routines/v1',
    goal: '<<one-line summary of the agreed goal, level and weekly schedule (you fill this after the interview)>>',
    exerciseLibrary: EXERCISE_LIBRARY_URL,
    routines: [
      {
        name: 'Full Body A',
        group: 'Beginner Full Body',
        exercises: [
          {
            exerciseId: '<<warm-up / mobility exercise id>>',
            sets: [{ seconds: 40 }],
            note: 'Warm-up — easy pace to raise the heart rate',
          },
          {
            exerciseId: '<<main compound lift id>>',
            sets: [{ reps: '8', warmup: true }, { reps: '6-8' }, { reps: '6-8' }, { reps: '6-8' }],
            restSeconds: 150,
            note: 'Start ~RPE 7; add load when you hit the top of the range',
          },
          {
            exerciseId: '<<accessory exercise id>>',
            sets: [{ reps: '10-12' }, { reps: '10-12' }],
            restSeconds: 75,
            note: 'Controlled tempo, 2s down',
          },
          {
            exerciseId: '<<stretch / flexibility exercise id>>',
            sets: [{ seconds: 30 }],
            note: 'Cool-down — hold, breathe, each side',
          },
        ],
      },
    ],
  }
}

// A compact, id-first listing of the whole catalog, grouped by body region, so
// the AI can pick real ids without fetching anything.
export function buildExerciseCatalogText(exercises: Exercise[]): string {
  const byRegion = new Map<string, Exercise[]>()
  for (const e of exercises) {
    const region = e.body_region || 'Other'
    if (!byRegion.has(region)) byRegion.set(region, [])
    byRegion.get(region)!.push(e)
  }
  const regions = [...byRegion.keys()].sort()
  const blocks = regions.map((region) => {
    const list = byRegion
      .get(region)!
      .slice()
      .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name))
    const lines = list.map((e) => `- ${e.id} \u2014 ${e.exercise_name} (${e.equipment_category})`)
    return `## ${region}\n${lines.join('\n')}`
  })
  return blocks.join('\n\n')
}

// A ready-to-paste prompt (instructions + the JSON to fill after the interview).
// Pass the loaded catalog to embed the real id list; without it, the prompt
// falls back to just linking the library URL.
export function buildAiRoutinePromptText(exercises?: Exercise[]): string {
  const tpl = buildAiRoutineTemplate()
  const library =
    exercises && exercises.length
      ? `\n\n===== EXERCISE LIBRARY (${exercises.length} exercises \u2014 copy these ids verbatim) =====\n${buildExerciseCatalogText(
          exercises,
        )}`
      : `\n\nExercise library: ${EXERCISE_LIBRARY_URL}`
  return `${AI_ROUTINE_INSTRUCTIONS}\n\nStart by interviewing me. Once you have my answers, return the plan as JSON in exactly this shape:\n\n${JSON.stringify(
    tpl,
    null,
    2,
  )}${library}`
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
