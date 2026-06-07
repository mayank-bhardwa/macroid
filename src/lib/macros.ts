import type { DayType, MacroEntry, Targets } from '../types'

export function entryCalories(e: MacroEntry): number {
  if (typeof e.calories === 'number' && Number.isFinite(e.calories)) return e.calories
  return e.protein * 4 + e.carbs * 4 + e.fats * 9
}

export type Totals = { protein: number; carbs: number; fats: number; fiber: number; calories: number }

export function sumEntries(entries: MacroEntry[] | undefined): Totals {
  const t: Totals = { protein: 0, carbs: 0, fats: 0, fiber: 0, calories: 0 }
  if (!entries) return t
  for (const e of entries) {
    t.protein += e.protein || 0
    t.carbs += e.carbs || 0
    t.fats += e.fats || 0
    t.fiber += e.fiber || 0
    t.calories += entryCalories(e)
  }
  return t
}

export function deriveCalories(protein: number, carbs: number, fats: number): number {
  return protein * 4 + carbs * 4 + fats * 9
}

export function pct(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(1, value / target)
}

// The single "on target" adherence band used across the app: within ±10% of
// goal. Centralised so the rings, Trends adherence %, and any future AI coaching
// all agree on what counts as on target instead of each picking its own cutoff.
export const ON_TARGET_LOW = 0.9
export const ON_TARGET_HIGH = 1.1

// Whether a value lands inside the on-target band for its goal.
export function isOnTarget(value: number, target: number): boolean {
  if (target <= 0) return false
  const r = value / target
  return r >= ON_TARGET_LOW && r <= ON_TARGET_HIGH
}

export type GoalStatus = 'under' | 'approaching' | 'met' | 'over'

// Ring status classifier, aligned to the shared on-target band so the two never
// drift: on-target ⟺ status is 'approaching' or 'met'; 'over' is just past the
// top of the band.
export function goalStatus(value: number, target: number): GoalStatus {
  if (target <= 0) return 'met'
  const r = value / target
  if (r > ON_TARGET_HIGH) return 'over'
  if (r >= 1) return 'met'
  if (r >= ON_TARGET_LOW) return 'approaching'
  return 'under'
}

export function remainingLabel(value: number, target: number, unit = 'g'): string {
  const diff = Math.round(target - value)
  if (diff > 0) return `${diff}${unit} left`
  if (diff < 0) return `${Math.abs(diff)}${unit} over`
  return 'Goal met'
}

export const EMPTY_TARGETS_LABEL = '—'

// Pick the live goal for a day type: rest days use `rest` when defined,
// otherwise fall back to the training/default `training` set.
export function targetsForType(
  type: DayType,
  training: Targets,
  rest?: Targets,
): Targets {
  return type === 'rest' && rest ? rest : training
}

// Resolve the goal shown for a given day: a per-day stamp (locked when the day
// was first logged) wins; otherwise the live goal for that day's type.
export function effectiveTargets(
  dayKey: string,
  history: Record<string, Targets>,
  training: Targets,
  rest: Targets | undefined,
  type: DayType,
): Targets {
  return history[dayKey] ?? targetsForType(type, training, rest)
}
