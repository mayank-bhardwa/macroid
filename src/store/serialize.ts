import type { State, Plan, MacroEntry } from '../types'

export type SyncRecord = {
  collection: string
  scope: string
  recId: string
  data: unknown
  updatedAt: number
  deleted?: boolean
}

export type Change = SyncRecord

// Identity of the synced active plan record (a mutable singleton document).
export const PLAN_COLLECTION = 'plan'
export const PLAN_SCOPE = ''
export const PLAN_REC_ID = 'active'

// Result of applying incoming changes: the next state plus the (possibly
// updated) active plan.
export type ApplyResult = { state: State; plan: Plan | null; planChanged: boolean }

// Map for which State key each collection corresponds to. These are flat
// dictionaries keyed by a single scope (day/week/month/foodId) whose whole
// value is one sync record. `macroLog` is handled separately because it is
// re-grained to one record PER ENTRY (see recordsFromState/applyChanges).
const COLLECTION_TO_KEY: Record<string, keyof State> = {
  water: 'water',
  targetHistory: 'targetHistory',
  morningPrep: 'morningPrep',
  dayOverride: 'dayOverrides',
  mealPrep: 'mealPrep',
  weeklyGrocery: 'weeklyGroceries',
  monthlyGrocery: 'monthlyGroceries',
  food: 'foods',
  bodyLog: 'bodyLogs',
}

// Build the logical list of records from State (without timestamps).
// Returns map keyed by `${collection}|${scope}|${recId}` -> data.
export function recordsFromState(
  state: State,
  plan?: Plan | null,
): Map<string, { collection: string; scope: string; recId: string; data: unknown }> {
  const out = new Map<string, { collection: string; scope: string; recId: string; data: unknown }>()
  const add = (collection: string, scope: string, recId: string, data: unknown) => {
    out.set(`${collection}|${scope}|${recId}`, { collection, scope, recId, data })
  }

  // Singletons (meta)
  add('meta', '', 'targets', state.targets)
  if (state.restTargets) add('meta', '', 'restTargets', state.restTargets)
  add('recentMeal', '', 'all', state.recentMeals)
  // Active plan is synced only once the user has a custom plan; the built-in
  // fallback / static monthly defaults stay local until edited.
  if (plan) add(PLAN_COLLECTION, PLAN_SCOPE, PLAN_REC_ID, plan)

  // Macro logs: one record PER ENTRY (scope = day, recId = entry id) so that
  // concurrent edits to different entries on the same day merge cleanly under
  // Last-Write-Wins instead of one device's whole-day array clobbering another.
  for (const day of Object.keys(state.macroLogs)) {
    for (const entry of state.macroLogs[day] ?? []) {
      add('macroLog', day, entry.id, entry)
    }
  }

  for (const [collection, key] of Object.entries(COLLECTION_TO_KEY)) {
    const dict = (state[key] as Record<string, unknown>) ?? {}
    for (const scope of Object.keys(dict)) {
      const val = dict[scope]
      if (val === undefined) continue
      add(collection, scope, scope, val)
    }
  }
  return out
}

// Reconstruct a State patch by applying incoming (non-deleted/deleted) changes.
export function applyChanges(base: State, changes: Change[], basePlan: Plan | null = null): ApplyResult {
  // Deep-ish clone of the dictionaries we mutate.
  const next: State = {
    targets: base.targets,
    restTargets: base.restTargets,
    recentMeals: base.recentMeals,
    macroLogs: { ...base.macroLogs },
    water: { ...base.water },
    targetHistory: { ...base.targetHistory },
    morningPrep: { ...base.morningPrep },
    mealPrep: { ...base.mealPrep },
    weeklyGroceries: { ...base.weeklyGroceries },
    monthlyGroceries: { ...base.monthlyGroceries },
    dayOverrides: { ...base.dayOverrides },
    foods: { ...(base.foods ?? {}) },
    bodyLogs: { ...(base.bodyLogs ?? {}) },
  }

  let plan = basePlan
  let planChanged = false

  for (const c of changes) {
    if (c.collection === 'meta' && c.recId === 'targets') {
      if (!c.deleted && c.data) next.targets = c.data as State['targets']
      continue
    }
    if (c.collection === 'meta' && c.recId === 'restTargets') {
      if (c.deleted) next.restTargets = undefined
      else if (c.data) next.restTargets = c.data as State['restTargets']
      continue
    }
    if (c.collection === 'recentMeal') {
      if (!c.deleted && Array.isArray(c.data)) next.recentMeals = c.data as State['recentMeals']
      continue
    }
    if (c.collection === PLAN_COLLECTION) {
      if (c.deleted) {
        plan = null
        planChanged = true
      } else if (c.data) {
        plan = c.data as Plan
        planChanged = true
      }
      continue
    }
    if (c.collection === 'macroLog') {
      const day = c.scope
      const arr = next.macroLogs[day] ? [...next.macroLogs[day]] : []
      if (Array.isArray(c.data)) {
        // Legacy whole-day record (pre re-grain) — replace the day wholesale.
        if (c.deleted) delete next.macroLogs[day]
        else next.macroLogs[day] = c.data as MacroEntry[]
        continue
      }
      if (c.deleted) {
        const filtered = arr.filter((e) => e.id !== c.recId)
        if (filtered.length) next.macroLogs[day] = filtered
        else delete next.macroLogs[day]
      } else if (c.data) {
        const entry = c.data as MacroEntry
        const idx = arr.findIndex((e) => e.id === entry.id)
        if (idx >= 0) arr[idx] = entry
        else arr.push(entry)
        next.macroLogs[day] = arr
      }
      continue
    }
    const key = COLLECTION_TO_KEY[c.collection]
    if (!key) continue
    const dict = next[key] as Record<string, unknown>
    if (c.deleted) {
      delete dict[c.scope]
    } else {
      dict[c.scope] = c.data
    }
  }
  return { state: next, plan, planChanged }
}

// Stable JSON stringify for hashing (sorts object keys).
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])).join(',') + '}'
}

// Fast non-cryptographic hash (FNV-1a) of a string.
export function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16)
}
