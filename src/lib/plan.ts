import type { BodyLog, DayType, GroceryUnit, MacroEntry, Plan, PlanGroceryItem, PlanMeal, State, Targets } from '../types'
import { GROCERY_UNITS } from '../types'
import { monthKeyOf } from './dates'
import { parseQty } from './units'

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
  grocery: [
    { name: 'Chicken breast', qty: 6, unit: 'kg' },
    { name: 'Eggs', qty: 120, unit: 'pcs' },
    { name: 'Paneer', qty: 2, unit: 'kg' },
    { name: 'Greek yogurt', qty: 4, unit: 'kg' },
    { name: 'Rice', qty: 8, unit: 'kg' },
    { name: 'Mixed vegetables', qty: 12, unit: 'kg' },
    { name: 'Bananas', qty: 60, unit: 'pcs' },
    { name: 'Rolled oats', qty: 3, unit: 'kg' },
    { name: 'Whey protein', qty: 2, unit: 'packs' },
    { name: 'Almonds', qty: 1, unit: 'kg' },
    { name: 'Peanut butter', qty: 2, unit: 'packs' },
    { name: 'Dal / lentils', qty: 4, unit: 'kg' },
    { name: 'Cooking oil', qty: 2, unit: 'L' },
    { name: 'Multigrain bread', qty: 8, unit: 'packs' },
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

// ------------------------------------------------------------------
// Grocery units + legacy migration
// ------------------------------------------------------------------

const GROCERY_UNIT_SET = new Set<string>(GROCERY_UNITS)

// Map common synonyms / legacy unit tokens onto the supported GroceryUnit set.
const UNIT_ALIASES: Record<string, GroceryUnit> = {
  kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'L', ltr: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
  millilitre: 'ml', milliliter: 'ml',
  pc: 'pcs', piece: 'pcs', pieces: 'pcs', unit: 'pcs', units: 'pcs', loaf: 'pcs', loaves: 'pcs',
  packet: 'packets', sachet: 'sachets', dozens: 'dozen',
  pack: 'packs', jar: 'packs', jars: 'packs', tub: 'packs', tubs: 'packs',
  box: 'packs', boxes: 'packs', scoop: 'packs', scoops: 'packs',
  bottle: 'bottles',
}

// Coerce any unit string (from an import or legacy data) onto a GroceryUnit.
// Unknown units fall back to 'pcs'.
export function coerceGroceryUnit(raw: string | undefined | null): GroceryUnit {
  const u = String(raw ?? '').trim()
  if (GROCERY_UNIT_SET.has(u)) return u as GroceryUnit
  const lower = u.toLowerCase()
  if (GROCERY_UNIT_SET.has(lower)) return lower as GroceryUnit
  return UNIT_ALIASES[lower] ?? 'pcs'
}

type LegacyPlan = {
  grocery?: unknown
  weeks?: { items?: { name?: unknown; qty?: unknown }[] }[]
  monthlyStock?: { item?: unknown; monthlyNeed?: unknown }[]
}

// Split a legacy quantity string like "1.5 kg" / "30 pcs" into a grocery row.
function groceryRowFromQtyString(name: string, qtyStr: string): PlanGroceryItem {
  const parsed = parseQty(qtyStr)
  const qty = parsed && parsed.value > 0 ? Math.round(parsed.value * 100) / 100 : 1
  return { name, qty, unit: coerceGroceryUnit(parsed?.unit) }
}

// Backfill the monthly grocery list on a plan saved before it existed, deriving
// items from the legacy weekly lists + monthly stock staples (dedup by name).
// Returns the same reference when `grocery` is already populated.
export function ensureGrocery(plan: Plan): Plan {
  if (Array.isArray(plan.grocery) && plan.grocery.length) return plan
  const legacy = plan as unknown as LegacyPlan
  const byName = new Map<string, PlanGroceryItem>()
  // Monthly staples carry the truest monthly quantity — take them first.
  for (const s of legacy.monthlyStock ?? []) {
    const name = String(s?.item ?? '').trim()
    if (!name || byName.has(name.toLowerCase())) continue
    byName.set(name.toLowerCase(), groceryRowFromQtyString(name, String(s?.monthlyNeed ?? '')))
  }
  // Then any weekly items not already present (per-week qty is a rough hint).
  for (const w of legacy.weeks ?? []) {
    for (const it of w?.items ?? []) {
      const name = String(it?.name ?? '').trim()
      if (!name || byName.has(name.toLowerCase())) continue
      byName.set(name.toLowerCase(), groceryRowFromQtyString(name, String(it?.qty ?? '')))
    }
  }
  return { ...plan, grocery: [...byName.values()] }
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
  '- grocery: the monthly shopping list — every item to buy for the whole month, with',
  '  the TOTAL quantity needed for the month. Each row is { name, qty, unit } where qty',
  '  is a NUMBER and unit is one of:',
  `  ${GROCERY_UNITS.join(', ')}.`,
  '  Use kg/g for weighed foods, L/ml for liquids, and pcs/packets/sachets/dozen/packs/',
  '  bottles for countable ones. Base the quantities on the meals above × ~30 days, and',
  '  include staples (oats, oil, whey, nuts, etc.). E.g. { "name": "Rice", "qty": 8,',
  '  "unit": "kg" } or { "name": "Eggs", "qty": 120, "unit": "pcs" }.',
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
      grocery: [
        { name: '<<grocery item>>', qty: 0, unit: 'kg' },
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

  // Monthly grocery list ({ name, qty, unit }). Falls back to deriving from a
  // legacy plan's weeks/monthlyStock when `grocery` is absent.
  let grocery: PlanGroceryItem[]
  if (Array.isArray(obj.grocery)) {
    grocery = obj.grocery
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
      .map((g) => ({
        name: toStr(g.name).trim(),
        qty: Math.max(0, Math.round(toNum(g.qty, 0) * 100) / 100),
        unit: coerceGroceryUnit(toStr(g.unit)),
      }))
      .filter((g) => g.name)
    if (grocery.length !== obj.grocery.length) warnings.push('some grocery items were missing a name — skipped')
  } else if (Array.isArray(obj.weeks) || Array.isArray(obj.monthlyStock)) {
    // Legacy plan (pre-grocery): derive the monthly list from its weekly lists
    // and monthly staples via ensureGrocery, which reads those raw fields.
    const legacy = { grocery: [], weeks: obj.weeks, monthlyStock: obj.monthlyStock } as unknown as Plan
    grocery = ensureGrocery(legacy).grocery
    warnings.push('grocery list derived from this plan\u2019s legacy weekly lists')
  } else {
    grocery = []
    if (obj.grocery !== undefined) warnings.push('grocery was not a list — cleared')
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
    grocery,
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
    `Grocery list: ${plan.grocery.length} item${plan.grocery.length === 1 ? '' : 's'}`,
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
    targetHistory,
    morningPrep: guardDict(d.morningPrep) as State['morningPrep'],
    mealPrep: guardDict(d.mealPrep) as State['mealPrep'],
    grocery: guardDict(d.grocery) as State['grocery'],
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
