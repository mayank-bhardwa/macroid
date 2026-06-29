export type Targets = {
  protein: number
  carbs: number
  fats: number
  fiber: number
  calories: number
}

export type Ingredient = {
  item: string
  qty: string
}

export type PlanMeal = {
  slot: string
  group: string
  time: string
  p: number
  c: number
  f: number
  fb?: number
  item: string
  ingredients?: Ingredient[]
}

// Units a grocery quantity can be measured in. Mass (kg/g), volume (L/ml) and
// a few count-style units (pieces, packets, sachets, …). The Grocery UI offers
// these as a fixed chooser; imported plans are coerced onto this set.
export const GROCERY_UNITS = [
  'kg',
  'g',
  'L',
  'ml',
  'pcs',
  'packets',
  'sachets',
  'dozen',
  'packs',
  'bottles',
] as const

export type GroceryUnit = (typeof GROCERY_UNITS)[number]

// One line of the plan's monthly grocery template (the quantity needed for the
// whole month). Seeds the Grocery tab's shopping list.
export type PlanGroceryItem = {
  name: string
  qty: number
  unit: GroceryUnit
}

// Where a logged entry or seeded meal originated. `undefined` is treated as
// 'user' for backwards-compat with records saved before provenance existed.
//  - 'user'   hand-entered by the person
//  - 'plan'   seeded from the active plan template
//  - 'ai'     produced by an AI feature (photo log, agent) — usually an estimate
export type EntrySource = 'user' | 'plan' | 'ai'

export type Plan = {
  planId: string
  label: string
  monthKey: string
  // Training-day macro goals (the default goal). `targets` is kept as the
  // primary set for backwards-compat; rest days use `restTargets` when present.
  targets: Targets
  // Optional rest-day macro goals (typically lower carbs/calories). When absent,
  // rest days fall back to `targets`.
  restTargets?: Targets
  mealPrepTasks: string[]
  // Ordered list of meal-time groups (e.g. Morning, Afternoon, Evening).
  // Optional for backwards-compat; defaults to ['Morning', 'Evening'].
  mealGroups?: string[]
  // Weekday numbers (0=Sun … 6=Sat) that count as training/workout days.
  // Optional for backwards-compat; `undefined` falls back to the factory
  // default (Tue/Wed/Fri/Sat). An empty array means every day is a rest day.
  trainingDays?: number[]
  dailyMeals: {
    training: PlanMeal[]
    rest: PlanMeal[]
  }
  // Monthly grocery template — the plain shopping list with a per-month quantity
  // for each item. Seeds the Grocery tab.
  grocery: PlanGroceryItem[]
}

export type MacroEntry = {
  id: string
  name: string
  protein: number
  carbs: number
  fats: number
  fiber?: number
  calories?: number
  fromMeal?: boolean
  tag?: string
  // Provenance of this entry. Defaults to 'user' when absent.
  source?: EntrySource
  // AI confidence (0–1) when source === 'ai'; omitted otherwise.
  confidence?: number
  // Set once the user has reviewed and accepted an AI-estimated entry. Only
  // meaningful when source === 'ai'.
  verified?: boolean
  // Soft reference to the catalog food/recipe this entry was logged from.
  // The macro values above are a snapshot taken at log time, so editing or
  // deleting the referenced food never rewrites logged history.
  foodId?: string
  // Number of servings logged from that food (the macros are already scaled).
  qty?: number
}

export type DailyMeal = {
  id: string
  slot: string
  group: string
  time: string
  text: string
  p: number
  c: number
  f: number
  fb?: number
  done?: boolean // prepared / cooked (Daily tab)
  packed?: boolean
  eaten?: boolean // consumed — logs macros (Macros tab)
  custom?: boolean
  ingredients?: Ingredient[]
  // Provenance of this meal. Defaults to 'plan' for seeded meals when absent.
  source?: EntrySource
  // AI confidence (0–1) when source === 'ai'; omitted otherwise.
  confidence?: number
}

export type PrepTask = {
  id: string
  text: string
  done: boolean
}

// One row of the user's monthly shopping list. `qty` + `unit` say how much is
// needed for the month; `done` marks it bought (crossed off while shopping).
export type GroceryRow = {
  id: string
  name: string
  qty: number
  unit: GroceryUnit
  done?: boolean
}

export type RecentMeal = {
  name: string
  protein: number
  carbs: number
  fats: number
  fiber?: number
  calories?: number
}

// A reusable food (or recipe) in the user's catalog — the normalized
// "dimension" that log entries reference. Macros are per one `serving`.
// A plain food stores its own macros. A recipe has `components` and its
// macros are computed by rolling up its component foods at view time.
export type FoodComponent = { foodId: string; qty: number }

export type Food = {
  id: string
  name: string
  // Per-serving macros (used directly for plain foods; for recipes these are
  // ignored in favour of the component rollup).
  protein: number
  carbs: number
  fats: number
  fiber?: number
  calories?: number
  // Human label for one serving, e.g. "100 g", "1 cup", "1 scoop".
  serving?: string
  // When present, this food is a recipe composed of other foods.
  components?: FoodComponent[]
  source?: EntrySource
}

export type DayType = 'training' | 'rest'

// A once-per-day body check-in. Keyed by day (YYYY-MM-DD) so each day holds at
// most one entry. Weight is in kg, body fat in %, and circumference measurements
// in cm. Every field is optional except the day so a user can log just weight.
export type BodyLog = {
  day: string
  weight?: number
  bodyFat?: number
  waist?: number
  chest?: number
  hips?: number
  arms?: number
  thighs?: number
  neck?: number
  note?: string
  // Timestamp (ms) the entry was last saved.
  at: number
}

// Ordered list of measurement fields shown in the body-tracking UI.
export type BodyField = 'weight' | 'bodyFat' | 'waist' | 'chest' | 'hips' | 'arms' | 'thighs' | 'neck'

export type State = {
  // Training-day macro goals (the live default goal).
  targets: Targets
  // Rest-day macro goals; when absent, rest days fall back to `targets`.
  restTargets?: Targets
  macroLogs: Record<string, MacroEntry[]>
  targetHistory: Record<string, Targets>
  morningPrep: Record<string, DailyMeal[]>
  mealPrep: Record<string, PrepTask[]>
  // Monthly shopping list, keyed by month (YYYY-MM).
  grocery: Record<string, GroceryRow[]>
  dayOverrides: Record<string, DayType>
  recentMeals: RecentMeal[]
  // User's reusable food & recipe catalog, keyed by food id.
  foods: Record<string, Food>
  // Once-per-day body check-ins, keyed by day (YYYY-MM-DD).
  bodyLogs: Record<string, BodyLog>
}

export type AuthUser = { id: string; email: string }
