// Shared configuration constants, default data, and field schemas.
// Pure data with no DOM or app-state dependencies, consumed by every feature.

export const STORAGE_KEY = "recomp-command-center-v1";
export const PLAN_KEY = "recomp-active-plan-v1";
export const SYNC_KEY = "recomp-sync-settings-v1";
export const DEFAULT_PLAN_URL = `${import.meta.env.BASE_URL}plans/2026-06.json`;

// Default gym/training days: Tue(2), Wed(3), Fri(5), Sat(6). Others are rest days.
export const DEFAULT_TRAINING_DAYS = [2, 3, 5, 6];

// ---- Water tracking ----
export const WATER_GLASS_ML = 250;
export const WATER_GOAL_GLASSES = 8;
export const WATER_MAX_GLASSES = 16;

// ---- Trends / history view ----
export const HISTORY_COUNTS = { daily: 14, weekly: 8, monthly: 12, yearly: 5 };

// ---- Cloud sync ----
export const GIST_FILENAME = "recomp-data.json";

export const defaultState = {
  targets: {
    protein: 160,
    carbs: 260,
    fats: 65,
    calories: 2400,
  },
  macroLogs: {},
  // Glasses of water (250 ml each) logged per day, keyed by date (YYYY-MM-DD).
  water: {},
  // Per-day snapshot of the macro targets in effect when that day was logged,
  // keyed by date (YYYY-MM-DD). Lets historical days keep their original
  // targets even after the current/default targets are changed.
  targetHistory: {},
  morningPrep: {},
  mealPrep: {},
  weeklyGroceries: {},
  monthlyGroceries: {},
  dayOverrides: {},
  recentMeals: [
    { name: "Whey shake (1 scoop)", protein: 24, carbs: 2, fats: 1 },
    { name: "Paneer bhurji (100 g)", protein: 18, carbs: 6, fats: 14 },
    { name: "Soya chunks (60 g dry)", protein: 30, carbs: 20, fats: 1 },
    { name: "Curd (150 g)", protein: 8, carbs: 9, fats: 6 },
    { name: "2 roti + sabzi", protein: 10, carbs: 44, fats: 10 },
    { name: "Sattu drink (40 g)", protein: 8, carbs: 26, fats: 3 },
  ],
};

// Minimal embedded fallback so the app works even if the plan JSON cannot be fetched.
export const fallbackPlan = {
  planId: "2026-06",
  label: "June 2026",
  monthKey: "2026-06",
  targets: { protein: 160, carbs: 260, fats: 65, calories: 2400 },
  morningTasks: [
    "500-700 ml water + creatine",
    "Pack pre-workout snack box",
    "Pack whey shaker",
    "Fill 1 bottle for office",
    "Confirm lunch has a protein anchor",
  ],
  mealPrepTasks: [
    "Boil soya chunks for 4-5 servings",
    "Boil moong/chana for 3-4 servings",
    "Build 4 pre-workout boxes",
    "Pre-portion oats + chia + PB powder jars",
    "Refill whey and creatine travel portions",
  ],
  dailyMeals: {
    training: [
      { slot: "Breakfast", group: "Morning", time: "10:00 am", p: 44, c: 55, f: 18, item: "Pack office jar: 60 g oats + 1 scoop whey + 10 g chia + 15 g PB powder. At 10 am add 200 ml milk, stir, eat. (~42 g protein)" },
      { slot: "Lunch", group: "Morning", time: "1:30 pm", p: 42, c: 68, f: 16, item: "Home: 2 roti + sabzi. Pack: 60 g dry soya chunks (boiled + squeezed) + 150 g curd. (~38 g protein)" },
      { slot: "Snack", group: "Morning", time: "4:00 pm", p: 10, c: 26, f: 7, item: "Pack: 40 g sattu + 10 g almonds. At 4 pm mix sattu with 300 ml water + 1 lemon + pinch kala namak. (~10 g protein)" },
      { slot: "Pre-Workout", group: "Morning", time: "5:45 pm", p: 30, c: 40, f: 2, item: "Pack box: 60 g dry soya chunks (boiled) + chaat masala + 1 lemon wedge, and 1 banana separately. Eat at 5:45 pm. (~28 g protein)" },
      { slot: "Gym Shake", group: "Evening", time: "7:50 pm", p: 24, c: 2, f: 1, item: "Pack shaker: 1 scoop whey. Add 300 ml water at 7:50 pm and drink. (~24 g protein)" },
      { slot: "Dinner", group: "Evening", time: "10:00 pm", p: 26, c: 52, f: 26, item: "Home: 2 roti + sabzi. Prepare: 100 g paneer bhurji (low oil). (~18 g protein)" },
    ],
    rest: [
      { slot: "Breakfast", group: "Morning", time: "10:00 am", p: 34, c: 28, f: 8, item: "Pack shaker: 40 g sattu + 1 scoop whey + 10 g almonds. At 10 am add 300 ml water, shake, drink. (~37 g protein)" },
      { slot: "Lunch", group: "Morning", time: "1:30 pm", p: 42, c: 68, f: 16, item: "Home: 2 roti + sabzi. Pack: 60 g dry soya chunks (boiled + squeezed) + 150 g curd. (~38 g protein)" },
      { slot: "Snack", group: "Morning", time: "4:00 pm", p: 8, c: 10, f: 10, item: "Pack: 150 g curd + 10 g almonds. Eat at 4 pm. (~8 g protein)" },
      { slot: "Evening Shake", group: "Evening", time: "7:30 pm", p: 24, c: 2, f: 1, item: "Pack shaker: 1 scoop whey. Add 300 ml water and drink. (~24 g protein)" },
      { slot: "Dinner", group: "Evening", time: "10:00 pm", p: 30, c: 55, f: 30, item: "Home: 2 roti + sabzi. Prepare: 120 g paneer bhurji (low oil). (~22 g protein)" },
    ],
  },
  weeks: [
    {
      key: "2026-W23",
      label: "Week 1 (Jun 1 - Jun 7)",
      items: [
        { name: "Paneer (every 2 days)", qty: "200-250 g per buy x 4 buys" },
        { name: "Curd (every 2 days)", qty: "500-650 g per buy x 4 buys" },
        { name: "Milk (every 2 days)", qty: "0.8-1.0 L per buy x 4 buys" },
        { name: "Vegetables mixed", qty: "6-7 kg" },
        { name: "Fruits mixed", qty: "4-5 kg" },
        { name: "Lemon", qty: "10-12 pcs" },
        { name: "Sattu", qty: "250 g" },
        { name: "Oats", qty: "500 g" },
      ],
    },
  ],
  monthlyStock: [
    { item: "Soya chunks/granules", minBuffer: "1.5 kg", reorderBelow: "1.0 kg", monthlyNeed: "2.5-3.5 kg" },
    { item: "Whey isolate", minBuffer: "20 scoops", reorderBelow: "10 scoops", monthlyNeed: "1-1.5 tubs" },
    { item: "Creatine", minBuffer: "100 g", reorderBelow: "60 g", monthlyNeed: "120-150 g" },
  ],
};

// ---- Version control: immutable factory defaults ----
// Deep, frozen snapshots of the original app defaults. The Admin page edits the
// live `plan` (custom defaults, saved to PLAN_KEY); "Reset to app default"
// restores from these snapshots.
export const FACTORY_PLAN = structuredClone(fallbackPlan);
export const FACTORY_TARGETS = structuredClone(defaultState.targets);

// ---- Admin editor field schemas ----
export const DAILY_FIELDS = [
  { key: "slot", placeholder: "Slot", cls: "f-slot" },
  { key: "group", type: "select", options: ["Morning", "Evening"], cls: "f-group" },
  { key: "time", placeholder: "Time", cls: "f-time" },
  { key: "p", type: "number", placeholder: "P", cls: "f-num" },
  { key: "c", type: "number", placeholder: "C", cls: "f-num" },
  { key: "f", type: "number", placeholder: "F", cls: "f-num" },
  { key: "item", placeholder: "Meal description", cls: "f-item" },
];
export const WEEKLY_PREP_FIELDS = [{ key: "text", placeholder: "Prep task", cls: "f-item" }];
export const WEEKLY_GROCERY_FIELDS = [
  { key: "name", placeholder: "Item", cls: "f-item" },
  { key: "qty", placeholder: "Quantity", cls: "f-qty" },
];
export const MONTHLY_FIELDS = [
  { key: "item", placeholder: "Item", cls: "f-item" },
  { key: "minBuffer", placeholder: "Min buffer", cls: "f-qty" },
  { key: "reorderBelow", placeholder: "Reorder below", cls: "f-qty" },
  { key: "monthlyNeed", placeholder: "Monthly need", cls: "f-qty" },
];
