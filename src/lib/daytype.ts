import type { DayType, DailyMeal, Plan } from '../types'
import { dateFromKey } from './dates'

// Factory default training days: Tue, Wed, Fri, Sat. Rest: Sun, Mon, Thu.
// Exposed so the Settings UI can offer a "reset to default" action.
export const DEFAULT_TRAINING_DOW = [2, 3, 5, 6]

// Resolve the configured set of training weekdays. `undefined` falls back to the
// factory default; an empty array is respected (every day becomes a rest day).
function resolveTrainingDow(trainingDays?: number[]): Set<number> {
  return new Set(trainingDays ?? DEFAULT_TRAINING_DOW)
}

export function defaultDayType(key: string, trainingDays?: number[]): DayType {
  return resolveTrainingDow(trainingDays).has(dateFromKey(key).getDay()) ? 'training' : 'rest'
}

export function effectiveDayType(
  key: string,
  overrides: Record<string, DayType>,
  trainingDays?: number[],
): { type: DayType; overridden: boolean } {
  const ov = overrides[key]
  if (ov) return { type: ov, overridden: ov !== defaultDayType(key, trainingDays) }
  return { type: defaultDayType(key, trainingDays), overridden: false }
}

// Deterministic seed of a day's meals from the plan. Template ids are positional
// (tpl-0, tpl-1, ...) so the same day seeded on two devices produces identical ids.
export function seedDay(key: string, plan: Plan, overrides: Record<string, DayType>): DailyMeal[] {
  const { type } = effectiveDayType(key, overrides, plan.trainingDays)
  const templates = plan.dailyMeals[type] || []
  return templates.map((m, i) => ({
    id: `tpl-${i}`,
    slot: m.slot,
    group: m.group,
    time: m.time,
    text: m.item,
    p: m.p,
    c: m.c,
    f: m.f,
    fb: m.fb,
    packed: false,
    source: 'plan' as const,
    ingredients: m.ingredients ? m.ingredients.map((g) => ({ ...g })) : undefined,
  }))
}
