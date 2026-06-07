import type { BodyLog, DayType, MacroEntry, Plan, PlanMeal, PlanWeek, State, StockRow, Targets } from '../types'
import { monthKeyOf, isoWeekKey, dayKey, formatShortDate } from './dates'

// Embedded fallback plan — identical in shape to public/plans/2026-06.json.
// Ensures the app works before any plan JSON is fetched.
export const FALLBACK_PLAN: Plan = {
  planId: 'fallback',
  label: 'Default Plan',
  monthKey: 'fallback',
  targets: { protein: 160, carbs: 260, fats: 65, fiber: 35, calories: 2400 },
  mealGroups: ['Morning', 'Evening'],
  trainingDays: [2, 3, 5, 6],
  mealPrepTasks: [
    'Boil & portion 12 eggs for the week',
    'Cook 1.5 kg chicken breast, divide into 6 boxes',
    'Soak & boil 500 g chickpeas / rajma',
    'Pre-cut veggies for stir-fry',
    'Prep overnight oats jars x4',
    'Portion whey + nuts into snack pouches',
  ],
  dailyMeals: {
    training: [
      { slot: 'Breakfast', group: 'Morning', time: '8:00 am', p: 32, c: 45, f: 12, fb: 6, item: '4 egg-white omelette + 2 whole eggs + 2 multigrain toast', ingredients: [{ item: 'Eggs', qty: '6 pcs' }] },
      { slot: 'Snack', group: 'Morning', time: '11:00 am', p: 18, c: 28, f: 6, fb: 4, item: 'Greek yogurt bowl + banana + chia', ingredients: [{ item: 'Greek yogurt', qty: '150 g' }, { item: 'Bananas', qty: '1 pcs' }] },
      { slot: 'Lunch', group: 'Morning', time: '1:30 pm', p: 42, c: 60, f: 14, fb: 9, item: '150 g chicken + 1.5 cup rice + dal + salad', ingredients: [{ item: 'Chicken breast', qty: '150 g' }, { item: 'Rice', qty: '75 g' }, { item: 'Dal / lentils', qty: '30 g' }] },
      { slot: 'Pre-Workout', group: 'Evening', time: '5:00 pm', p: 12, c: 35, f: 4, fb: 5, item: 'Sattu drink + handful dates' },
      { slot: 'Gym Shake', group: 'Evening', time: '7:30 pm', p: 30, c: 12, f: 2, fb: 1, item: '1 scoop whey + 250 ml milk' },
      { slot: 'Dinner', group: 'Evening', time: '9:00 pm', p: 38, c: 40, f: 16, fb: 8, item: 'Paneer bhurji + 3 roti + sauteed greens', ingredients: [{ item: 'Paneer', qty: '100 g' }, { item: 'Mixed vegetables', qty: '150 g' }] },
    ],
    rest: [
      { slot: 'Breakfast', group: 'Morning', time: '8:30 am', p: 28, c: 38, f: 12, fb: 7, item: 'Veggie besan chilla x2 + curd', ingredients: [{ item: 'Curd', qty: '100 g' }, { item: 'Mixed vegetables', qty: '80 g' }] },
      { slot: 'Snack', group: 'Morning', time: '11:30 am', p: 15, c: 18, f: 8, fb: 6, item: 'Roasted chana + handful almonds', ingredients: [{ item: 'Almonds', qty: '20 g' }] },
      { slot: 'Lunch', group: 'Morning', time: '1:30 pm', p: 38, c: 48, f: 14, fb: 11, item: 'Rajma + 1 cup rice + cucumber salad', ingredients: [{ item: 'Rajma', qty: '80 g' }, { item: 'Rice', qty: '60 g' }] },
      { slot: 'Snack', group: 'Evening', time: '5:00 pm', p: 24, c: 14, f: 4, fb: 1, item: '1 scoop whey + 200 ml milk' },
      { slot: 'Dinner', group: 'Evening', time: '8:30 pm', p: 36, c: 32, f: 15, fb: 9, item: 'Grilled tofu/soya + 2 roti + mixed veg', ingredients: [{ item: 'Tofu', qty: '120 g' }, { item: 'Mixed vegetables', qty: '120 g' }] },
    ],
  },
  weeks: [
    {
      key: 'fallback-w1',
      label: 'This Week',
      items: [
        { name: 'Chicken breast', qty: '1.5 kg' },
        { name: 'Eggs', qty: '30 pcs' },
        { name: 'Paneer', qty: '400 g' },
        { name: 'Greek yogurt', qty: '1 kg' },
        { name: 'Rice', qty: '2 kg' },
        { name: 'Mixed vegetables', qty: '3 kg' },
      ],
    },
  ],
  monthlyStock: [
    { item: 'Whey protein', minBuffer: '1 tub', reorderBelow: '1 tub', monthlyNeed: '2 tubs' },
    { item: 'Rolled oats', minBuffer: '500 g', reorderBelow: '500 g', monthlyNeed: '3 kg' },
    { item: 'Rice', minBuffer: '1 kg', reorderBelow: '2 kg', monthlyNeed: '8 kg' },
    { item: 'Cooking oil', minBuffer: '250 ml', reorderBelow: '500 ml', monthlyNeed: '1.5 l' },
    { item: 'Almonds', minBuffer: '100 g', reorderBelow: '200 g', monthlyNeed: '1 kg' },
    { item: 'Peanut butter', minBuffer: '1 jar', reorderBelow: '1 jar', monthlyNeed: '2 jars' },
    { item: 'Dal / lentils', minBuffer: '500 g', reorderBelow: '1 kg', monthlyNeed: '4 kg' },
  ],
}

export const DEFAULT_MEAL_GROUPS = ['Morning', 'Evening']

// Resolve the ordered meal groups for a plan, ensuring any group actually used
// by a meal still appears (appended at the end) so no meal is ever orphaned.
export function planMealGroups(plan: Plan): string[] {
  const ordered = plan.mealGroups && plan.mealGroups.length ? [...plan.mealGroups] : [...DEFAULT_MEAL_GROUPS]
  const seen = new Set(ordered)
  for (const type of ['training', 'rest'] as const) {
    for (const m of plan.dailyMeals[type] ?? []) {
      if (m.group && !seen.has(m.group)) {
        ordered.push(m.group)
        seen.add(m.group)
      }
    }
  }
  return ordered
}

// Backfill missing per-meal fiber (fb) on a plan saved before fiber existed.
// Matches each meal to the factory template by item name (or position) and
// copies its fiber. Returns the same object reference if nothing changed.
export function ensureMealFiber(plan: Plan): Plan {
  const fill = (meals: PlanMeal[] | undefined, factory: PlanMeal[]) => {
    let changed = false
    const out = (meals ?? []).map((m, i) => {
      if (m.fb != null) return m
      changed = true
      const match = factory.find((f) => f.item === m.item) ?? factory[i]
      return { ...m, fb: match?.fb ?? 0 }
    })
    return { out, changed }
  }
  const tr = fill(plan.dailyMeals?.training, FALLBACK_PLAN.dailyMeals.training)
  const rs = fill(plan.dailyMeals?.rest, FALLBACK_PLAN.dailyMeals.rest)
  if (!tr.changed && !rs.changed) return plan
  return { ...plan, dailyMeals: { training: tr.out, rest: rs.out } }
}

export const DEFAULT_RECENT_MEALS = [
  { name: 'Whey shake', protein: 24, carbs: 6, fats: 2, fiber: 1 },
  { name: 'Paneer bhurji', protein: 18, carbs: 8, fats: 14, fiber: 2 },
  { name: 'Soya chunks (100g)', protein: 52, carbs: 33, fats: 1, fiber: 13 },
  { name: 'Curd (1 bowl)', protein: 9, carbs: 12, fats: 4, fiber: 0 },
  { name: 'Roti + sabzi', protein: 8, carbs: 38, fats: 9, fiber: 6 },
  { name: 'Sattu drink', protein: 12, carbs: 28, fats: 3, fiber: 4 },
]

// ------------------------------------------------------------------
// AI plan template — a self-describing JSON skeleton a user can hand to
// any AI agent (ChatGPT/Claude/etc.) so it fills in a personalised plan.
// ------------------------------------------------------------------

// Build the weeks for the current calendar month with correct ISO week keys.
// The app matches a week's grocery list by its ISO key, so the AI must NOT
// change these — it only fills the `items` for each.
function currentMonthWeeks(): { key: string; label: string; items: { name: string; qty: string }[] }[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const seen = new Set<string>()
  const weeks: { key: string; label: string; items: { name: string; qty: string }[] }[] = []
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month, day)
    const key = isoWeekKey(date)
    if (seen.has(key)) continue
    seen.add(key)
    const dow = (date.getDay() + 6) % 7 // Mon=0..Sun=6
    const monday = new Date(year, month, day - dow)
    weeks.push({ key, label: `Week of ${formatShortDate(dayKey(monday))}`, items: [] })
  }
  return weeks
}

export const AI_PLAN_INSTRUCTIONS = [
  'You are a sports-nutrition and meal-prep planner. Fill in this Macroid plan template',
  'to match the GOAL described in the "goal" field, then return the COMPLETE JSON object',
  'with the same structure (keep all top-level keys). Return ONLY valid JSON — no prose,',
  'no markdown fences.',
  '',
  'Fill every part of "plan":',
  '- targets: daily macro goals (protein, carbs, fats, fiber in grams; calories in kcal).',
  '  Keep calories ≈ protein*4 + carbs*4 + fats*9 (fiber does not add calories).',
  '- restTargets: OPTIONAL rest-day macro goals (typically lower carbs/calories than',
  '  targets). Same shape as targets. Omit it to use the same goals on rest days.',
  '- mealGroups: ordered meal-time sections shown in the Daily tab (e.g.',
  '  ["Morning", "Afternoon", "Evening"]). Every meal\u2019s "group" MUST be one of these.',
  '- trainingDays: weekday numbers (0=Sun … 6=Sat) that are workout days; the rest use',
  '  the dailyMeals.rest template. E.g. [2,3,5,6] = Tue/Wed/Fri/Sat.',
  '- mealPrepTasks: 4–8 batch-prep tasks for the week.',
  '- dailyMeals.training and dailyMeals.rest: full day schedules (training days have',
  '  more carbs/calories). Each meal needs slot, group (one of mealGroups), time,',
  '  p/c/f/fb grams (fb = fiber), and item (description).',
  '- Each meal SHOULD include an "ingredients" array of { item, qty } that maps to the',
  '  pantry/grocery item names below. The app subtracts these from stock when a meal is',
  '  marked done, so reuse the SAME item names you put in weeks[].items and monthlyStock.',
  '- weeks: the weekly shopping list. KEEP each week\u2019s "key" and "label" exactly as given;',
  '  only fill "items" ([{ name, qty }]).',
  '- monthlyStock: long-term staples. Set "monthlyNeed" to the full quantity used in a',
  '  month — this is important: the app flags an item to REORDER when its remaining stock',
  '  drops below 20% of monthlyNeed. "minBuffer" and "reorderBelow" are optional hints',
  '  (a typical low level and a sensible unit), not the trigger.',
  '',
  'Units: use g, kg, ml, l for measurable items and pcs, scoop, tub, jar, loaf, dozen,',
  'pack, bottle for countable ones (e.g. "1.5 kg", "30 pcs", "1 tub"). Be consistent so',
  'unit math works.',
].join('\n')

const SAMPLE_MEAL = {
  slot: 'Breakfast',
  group: 'Morning',
  time: '8:00 am',
  p: 0,
  c: 0,
  f: 0,
  fb: 0,
  item: '<<meal description>>',
  ingredients: [{ item: '<<must match a grocery / stock item>>', qty: '<<e.g. 100 g>>' }],
}

// Returns the template object (plan skeleton + embedded instructions + goal).
export function buildAiPlanTemplate(): Record<string, unknown> {
  const month = monthKeyOf()
  return {
    $schema: 'macroid-plan/v1',
    instructions: AI_PLAN_INSTRUCTIONS,
    goal: '<<DESCRIBE YOUR GOAL HERE — e.g. "Lean bulk for a 78 kg vegetarian male, ~2800 kcal/day, gym 4x/week, Indian foods, lactose-friendly">>',
    plan: {
      planId: `plan-${month}`,
      label: `${month} plan`,
      monthKey: month,
      targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, calories: 0 },
      restTargets: { protein: 0, carbs: 0, fats: 0, fiber: 0, calories: 0 },
      mealGroups: ['Morning', 'Afternoon', 'Evening'],
      trainingDays: [2, 3, 5, 6],
      mealPrepTasks: ['<<prep task>>'],
      dailyMeals: {
        training: [SAMPLE_MEAL],
        rest: [SAMPLE_MEAL],
      },
      weeks: currentMonthWeeks(),
      monthlyStock: [
        { item: '<<staple>>', minBuffer: '<<e.g. 500 g>>', reorderBelow: '<<e.g. 1 kg>>', monthlyNeed: '<<e.g. 4 kg>>' },
      ],
    },
  }
}

// A ready-to-paste prompt (instructions + the JSON the agent must fill).
export function buildAiPromptText(): string {
  const tpl = buildAiPlanTemplate()
  return `${AI_PLAN_INSTRUCTIONS}\n\nFill in this JSON and return it complete:\n\n${JSON.stringify(tpl, null, 2)}`
}

// Accepts a raw Plan, or the AI template wrapper ({ plan: {...} }), and strips
// any meta keys ($schema, instructions, goal, _*) before validating.
export function normalizeImportedPlan(raw: unknown): Plan {
  return validateAndRepairPlan(raw).plan
}

// ------------------------------------------------------------------
// Validation + repair
// ------------------------------------------------------------------
// Imported/AI-generated plans are untrusted: fields may be missing, wrong-typed,
// or out of range. validateAndRepairPlan coerces what it safely can, fills sane
// defaults, and records a human-readable warning for every fix so the UI can
// show the user what was changed before they confirm the import. It throws only
// when the input is fundamentally unusable (not an object, or no meals at all).

export type PlanValidation = { plan: Plan; warnings: string[] }

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function toStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v
  if (v == null) return fallback
  return String(v)
}

function repairTargets(raw: unknown, warnings: string[]): Targets {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!raw || typeof raw !== 'object') warnings.push('targets missing — filled from defaults')
  const protein = Math.max(0, Math.round(toNum(r.protein, FALLBACK_PLAN.targets.protein)))
  const carbs = Math.max(0, Math.round(toNum(r.carbs, FALLBACK_PLAN.targets.carbs)))
  const fats = Math.max(0, Math.round(toNum(r.fats, FALLBACK_PLAN.targets.fats)))
  const fiber = Math.max(0, Math.round(toNum(r.fiber, FALLBACK_PLAN.targets.fiber)))
  let calories = Math.max(0, Math.round(toNum(r.calories, 0)))
  const derived = protein * 4 + carbs * 4 + fats * 9
  if (calories === 0) {
    calories = derived
    warnings.push('targets.calories missing — derived from macros')
  } else if (derived > 0 && Math.abs(calories - derived) / derived > 0.25) {
    warnings.push(`targets.calories (${calories}) is off from macros (~${derived} kcal)`)
  }
  return { protein, carbs, fats, fiber, calories }
}

function repairMeal(raw: unknown, idx: number, type: string, groups: string[], warnings: string[]): PlanMeal | null {
  if (!raw || typeof raw !== 'object') {
    warnings.push(`${type} meal #${idx + 1} was not an object — skipped`)
    return null
  }
  const r = raw as Record<string, unknown>
  const item = toStr(r.item).trim()
  if (!item) {
    warnings.push(`${type} meal #${idx + 1} has no description — skipped`)
    return null
  }
  let group = toStr(r.group).trim()
  if (!group || !groups.includes(group)) {
    const fallback = groups[0]
    if (group) warnings.push(`${type} meal "${item}": group "${group}" not in mealGroups — moved to "${fallback}"`)
    group = fallback
  }
  let ingredients: PlanMeal['ingredients']
  if (Array.isArray(r.ingredients)) {
    ingredients = r.ingredients
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
      .map((g) => ({ item: toStr(g.item).trim(), qty: toStr(g.qty).trim() }))
      .filter((g) => g.item)
  }
  return {
    slot: toStr(r.slot, 'Meal').trim() || 'Meal',
    group,
    time: toStr(r.time).trim(),
    p: Math.max(0, Math.round(toNum(r.p, 0))),
    c: Math.max(0, Math.round(toNum(r.c, 0))),
    f: Math.max(0, Math.round(toNum(r.f, 0))),
    fb: Math.max(0, Math.round(toNum(r.fb, 0))),
    item,
    ingredients: ingredients && ingredients.length ? ingredients : undefined,
  }
}

export function validateAndRepairPlan(raw: unknown): PlanValidation {
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('File is not a valid plan object')
  }
  let obj = raw as Record<string, unknown>
  // Unwrap the AI template wrapper ({ plan: {...} }).
  if (obj.plan && typeof obj.plan === 'object' && !Array.isArray(obj.plan)) {
    obj = obj.plan as Record<string, unknown>
  }

  // Meal groups first — meals are validated against them.
  let mealGroups: string[]
  if (Array.isArray(obj.mealGroups) && obj.mealGroups.length) {
    mealGroups = obj.mealGroups.map((g) => toStr(g).trim()).filter(Boolean)
    if (!mealGroups.length) {
      mealGroups = [...DEFAULT_MEAL_GROUPS]
      warnings.push('mealGroups was empty — using defaults')
    }
  } else {
    mealGroups = [...DEFAULT_MEAL_GROUPS]
    warnings.push('mealGroups missing — using defaults (Morning, Evening)')
  }

  // Daily meals — the one part we cannot fully invent.
  const rawDaily = (obj.dailyMeals && typeof obj.dailyMeals === 'object' ? obj.dailyMeals : {}) as Record<string, unknown>
  const repairDayList = (list: unknown, type: 'training' | 'rest'): PlanMeal[] => {
    if (!Array.isArray(list)) {
      warnings.push(`dailyMeals.${type} missing — copied from factory plan`)
      return FALLBACK_PLAN.dailyMeals[type].map((m) => ({ ...m }))
    }
    const out = list.map((m, i) => repairMeal(m, i, type, mealGroups, warnings)).filter((m): m is PlanMeal => m != null)
    if (!out.length) {
      warnings.push(`dailyMeals.${type} had no usable meals — copied from factory plan`)
      return FALLBACK_PLAN.dailyMeals[type].map((m) => ({ ...m }))
    }
    return out
  }
  const training = repairDayList(rawDaily.training, 'training')
  const rest = repairDayList(rawDaily.rest, 'rest')

  // Training days (weekday numbers 0–6).
  let trainingDays: number[] | undefined
  if (obj.trainingDays === undefined) {
    trainingDays = undefined
  } else if (Array.isArray(obj.trainingDays)) {
    const seen = new Set<number>()
    for (const v of obj.trainingDays) {
      const n = Math.round(toNum(v, -1))
      if (n >= 0 && n <= 6) seen.add(n)
    }
    trainingDays = [...seen].sort((a, b) => a - b)
    if (trainingDays.length !== (obj.trainingDays as unknown[]).length) {
      warnings.push('trainingDays had invalid weekday numbers — kept only 0–6')
    }
  } else {
    warnings.push('trainingDays was not a list — using factory default')
    trainingDays = undefined
  }

  // Meal-prep tasks.
  let mealPrepTasks: string[]
  if (Array.isArray(obj.mealPrepTasks)) {
    mealPrepTasks = obj.mealPrepTasks.map((t) => toStr(t).trim()).filter(Boolean)
  } else {
    mealPrepTasks = []
    if (obj.mealPrepTasks !== undefined) warnings.push('mealPrepTasks was not a list — cleared')
  }

  // Weeks (shopping lists).
  let weeks: PlanWeek[]
  if (Array.isArray(obj.weeks)) {
    weeks = obj.weeks
      .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
      .map((w) => ({
        key: toStr(w.key).trim(),
        label: toStr(w.label).trim() || 'Week',
        items: Array.isArray(w.items)
          ? w.items
              .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
              .map((it) => ({ name: toStr(it.name).trim(), qty: toStr(it.qty).trim() }))
              .filter((it) => it.name)
          : [],
      }))
      .filter((w) => w.key)
    if (weeks.length !== obj.weeks.length) warnings.push('some weeks were missing a key — skipped')
  } else {
    weeks = []
    if (obj.weeks !== undefined) warnings.push('weeks was not a list — cleared')
  }

  // Monthly stock staples.
  let monthlyStock: StockRow[]
  if (Array.isArray(obj.monthlyStock)) {
    monthlyStock = obj.monthlyStock
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({
        item: toStr(s.item).trim(),
        minBuffer: toStr(s.minBuffer).trim(),
        reorderBelow: toStr(s.reorderBelow).trim(),
        monthlyNeed: toStr(s.monthlyNeed).trim(),
      }))
      .filter((s) => s.item)
  } else {
    monthlyStock = []
    if (obj.monthlyStock !== undefined) warnings.push('monthlyStock was not a list — cleared')
  }

  const month = monthKeyOf()
  const plan: Plan = {
    planId: toStr(obj.planId).trim() || `plan-${month}`,
    label: toStr(obj.label).trim() || `${month} plan`,
    monthKey: toStr(obj.monthKey).trim() || month,
    targets: repairTargets(obj.targets, warnings),
    restTargets: obj.restTargets !== undefined ? repairTargets(obj.restTargets, warnings) : undefined,
    mealPrepTasks,
    mealGroups,
    trainingDays,
    dailyMeals: { training, rest },
    weeks,
    monthlyStock,
  }
  return { plan, warnings }
}

// Short human-readable summary of a plan for an import-confirmation dialog.
export function summarizePlan(plan: Plan): string[] {
  const t = plan.targets
  const lines = [
    `Label: ${plan.label}`,
    `Targets: ${t.calories} kcal · P${t.protein} C${t.carbs} F${t.fats} Fb${t.fiber}`,
  ]
  if (plan.restTargets) {
    const r = plan.restTargets
    lines.push(`Rest-day targets: ${r.calories} kcal · P${r.protein} C${r.carbs} F${r.fats} Fb${r.fiber}`)
  }
  lines.push(
    `Meals: ${plan.dailyMeals.training.length} training / ${plan.dailyMeals.rest.length} rest`,
    `Meal groups: ${(plan.mealGroups ?? DEFAULT_MEAL_GROUPS).join(', ')}`,
    `Shopping weeks: ${plan.weeks.length} · Pantry staples: ${plan.monthlyStock.length}`,
  )
  return lines
}

// Quietly coerce a per-day goal stamp into a Targets without surfacing per-day
// warnings (there can be hundreds). Missing macros become 0 rather than factory
// values so a malformed stamp never invents nutrition; calories derive when 0.
function coerceTargets(raw: unknown): Targets {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const protein = Math.max(0, Math.round(toNum(r.protein, 0)))
  const carbs = Math.max(0, Math.round(toNum(r.carbs, 0)))
  const fats = Math.max(0, Math.round(toNum(r.fats, 0)))
  const fiber = Math.max(0, Math.round(toNum(r.fiber, 0)))
  let calories = Math.max(0, Math.round(toNum(r.calories, 0)))
  if (calories === 0) calories = protein * 4 + carbs * 4 + fats * 9
  return { protein, carbs, fats, fiber, calories }
}

// Shallow-clone a value into a string-keyed dict, or {} when it isn't an object.
function guardDict(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

// Coerce one untrusted log entry into a clean MacroEntry, or null to drop it.
function repairEntry(raw: unknown, day: string, warnings: string[]): MacroEntry | null {
  if (!raw || typeof raw !== 'object') {
    warnings.push(`Dropped a malformed log entry on ${day}`)
    return null
  }
  const r = raw as Record<string, unknown>
  const id = toStr(r.id).trim()
  const name = toStr(r.name).trim()
  if (!id || !name) {
    warnings.push(`Dropped a log entry with no id or name on ${day}`)
    return null
  }
  const e: MacroEntry = {
    id,
    name,
    protein: Math.max(0, toNum(r.protein, 0)),
    carbs: Math.max(0, toNum(r.carbs, 0)),
    fats: Math.max(0, toNum(r.fats, 0)),
  }
  const fiber = toNum(r.fiber, NaN)
  if (Number.isFinite(fiber)) e.fiber = Math.max(0, fiber)
  const calories = toNum(r.calories, NaN)
  if (Number.isFinite(calories)) e.calories = Math.max(0, calories)
  if (r.fromMeal === true) e.fromMeal = true
  const tag = toStr(r.tag).trim()
  if (tag) e.tag = tag
  if (r.source === 'user' || r.source === 'plan' || r.source === 'ai') e.source = r.source
  const conf = toNum(r.confidence, NaN)
  if (Number.isFinite(conf)) e.confidence = Math.min(1, Math.max(0, conf))
  if (r.verified === true) e.verified = true
  if (typeof r.foodId === 'string') e.foodId = r.foodId
  const qty = toNum(r.qty, NaN)
  if (Number.isFinite(qty) && qty > 0) e.qty = qty
  return e
}

// Coerce one untrusted body check-in into a clean BodyLog, or null to drop it.
function repairBodyLogRec(raw: unknown, day: string): BodyLog | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const at = toNum(r.at, NaN)
  const out: BodyLog = { day, at: Number.isFinite(at) ? at : Date.now() }
  const fields = ['weight', 'bodyFat', 'waist', 'chest', 'hips', 'arms', 'thighs', 'neck'] as const
  let any = false
  for (const f of fields) {
    const v = toNum(r[f], NaN)
    if (Number.isFinite(v) && v > 0) {
      out[f] = v
      any = true
    }
  }
  const note = toStr(r.note).trim()
  if (note) out.note = note
  return any || note ? out : null
}

export type StateValidation = { state: State; warnings: string[] }

// Imported/AI-generated backups are untrusted: fields may be missing, the wrong
// type, or out of range. validateAndRepairState mirrors validateAndRepairPlan —
// it coerces what it safely can (numbers stay numbers, junk entries are dropped),
// fills the dictionaries the app expects, and records a human-readable warning
// for anything it had to fix. It throws only when the data is fundamentally
// unusable (not an object). This is what guards the macro/calorie maths from a
// hand-edited file slipping string values into the totals.
export function validateAndRepairState(raw: unknown): StateValidation {
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Backup data is not a valid object')
  }
  const d = raw as Partial<State> & Record<string, unknown>

  // Live goals — repairTargets always returns a usable set (fills sane defaults).
  const targets = repairTargets(d.targets, warnings)
  const restTargets = d.restTargets !== undefined ? repairTargets(d.restTargets, warnings) : undefined

  // Macro logs: one array of entries per day; coerce numbers, drop junk.
  const macroLogs: Record<string, MacroEntry[]> = {}
  if (d.macroLogs && typeof d.macroLogs === 'object' && !Array.isArray(d.macroLogs)) {
    const rawLogs = d.macroLogs as Record<string, unknown>
    for (const day of Object.keys(rawLogs)) {
      const list = rawLogs[day]
      if (!Array.isArray(list)) {
        warnings.push(`Log for ${day} was not a list — skipped`)
        continue
      }
      const entries = list
        .map((e) => repairEntry(e, day, warnings))
        .filter((e): e is MacroEntry => e != null)
      if (entries.length) macroLogs[day] = entries
    }
  } else if (d.macroLogs !== undefined) {
    warnings.push('macroLogs was not an object — cleared')
  }

  // Per-day goal stamps.
  const targetHistory: Record<string, Targets> = {}
  const rawHist = guardDict(d.targetHistory)
  for (const day of Object.keys(rawHist)) targetHistory[day] = coerceTargets(rawHist[day])

  // Water (whole glasses 0–16; drop zero).
  const water: Record<string, number> = {}
  const rawWater = guardDict(d.water)
  for (const day of Object.keys(rawWater)) {
    const g = Math.max(0, Math.min(16, Math.round(toNum(rawWater[day], 0))))
    if (g > 0) water[day] = g
  }

  // Body check-ins.
  const bodyLogs: Record<string, BodyLog> = {}
  const rawBody = guardDict(d.bodyLogs)
  for (const day of Object.keys(rawBody)) {
    const log = repairBodyLogRec(rawBody[day], day)
    if (log) bodyLogs[day] = log
  }

  // Day overrides (training/rest only).
  const dayOverrides: Record<string, DayType> = {}
  const rawOv = guardDict(d.dayOverrides)
  for (const day of Object.keys(rawOv)) {
    const v = rawOv[day]
    if (v === 'training' || v === 'rest') dayOverrides[day] = v
  }

  // Recent meals (name required, macros coerced).
  let recentMeals: State['recentMeals'] = []
  const rawRecent = d.recentMeals as unknown
  if (Array.isArray(rawRecent)) {
    recentMeals = rawRecent
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map((m) => {
        const fiber = toNum(m.fiber, NaN)
        const calories = toNum(m.calories, NaN)
        return {
          name: toStr(m.name).trim(),
          protein: Math.max(0, toNum(m.protein, 0)),
          carbs: Math.max(0, toNum(m.carbs, 0)),
          fats: Math.max(0, toNum(m.fats, 0)),
          fiber: Number.isFinite(fiber) ? Math.max(0, fiber) : undefined,
          calories: Number.isFinite(calories) ? Math.max(0, calories) : undefined,
        }
      })
      .filter((m) => m.name)
  } else if (rawRecent !== undefined) {
    warnings.push('recentMeals was not a list — cleared')
  }

  const state: State = {
    targets,
    restTargets,
    macroLogs,
    water,
    targetHistory,
    morningPrep: guardDict(d.morningPrep) as State['morningPrep'],
    mealPrep: guardDict(d.mealPrep) as State['mealPrep'],
    weeklyGroceries: guardDict(d.weeklyGroceries) as State['weeklyGroceries'],
    monthlyGroceries: guardDict(d.monthlyGroceries) as State['monthlyGroceries'],
    dayOverrides,
    recentMeals,
    foods: guardDict(d.foods) as State['foods'],
    bodyLogs,
  }
  return { state, warnings }
}

// Summary + warnings for a local-backup file ({ data, customPlan }) shown in the
// import-confirmation dialog. Validates any embedded custom plan so the user is
// warned before restoring.
export function summarizeBackup(parsed: { data?: unknown; customPlan?: unknown }): {
  summary: string[]
  warnings: string[]
} {
  const warnings: string[] = []
  const data = (parsed.data && typeof parsed.data === 'object' ? parsed.data : {}) as Partial<State>
  const logs = data.macroLogs ?? {}
  const loggedDays = Object.keys(logs).length
  const totalEntries = Object.values(logs).reduce(
    (n, list) => n + (Array.isArray(list) ? list.length : 0),
    0,
  )
  const summary = [
    `Logged days: ${loggedDays} (${totalEntries} entries)`,
    `Water tracked: ${Object.keys(data.water ?? {}).length} days`,
    `Recent meals: ${(data.recentMeals ?? []).length}`,
    parsed.customPlan ? 'Includes a custom plan' : 'No custom plan',
    'Restoring merges into your current data — logged entries are combined (nothing you logged is removed) and the newer body check-in wins per day.',
  ]
  if (parsed.customPlan) {
    try {
      const res = validateAndRepairPlan(parsed.customPlan)
      warnings.push(...res.warnings.map((w) => `Plan: ${w}`))
    } catch {
      warnings.push('Custom plan in this backup is unusable and will be skipped')
    }
  }
  return { summary, warnings }
}
