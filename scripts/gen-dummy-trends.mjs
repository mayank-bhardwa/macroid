// One-off generator: builds an importable Macroid backup full of realistic
// dummy macro logs, water, and body check-ins so the Trends tab (daily / weekly
// / monthly / yearly) and the Body card have data to render. Import the output
// via Settings → Local backup → Import JSON.
//
// Run: node scripts/gen-dummy-trends.mjs
import { writeFileSync } from 'node:fs'

const DAYS_BACK = 430 // ~14 months → fills daily(14), weekly(8), monthly(12) + 2 year bars
const SKIP_CHANCE = 0.12 // fraction of days with no log (realistic gaps)

function dayKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// A pool of plausible meals to compose a day from.
const MEALS = [
  { name: 'Whey shake', protein: 24, carbs: 6, fats: 2, fiber: 1 },
  { name: 'Paneer bhurji', protein: 18, carbs: 8, fats: 14, fiber: 2 },
  { name: 'Soya chunks (100g)', protein: 52, carbs: 33, fats: 1, fiber: 13 },
  { name: 'Curd (1 bowl)', protein: 9, carbs: 12, fats: 4, fiber: 0 },
  { name: 'Roti + sabzi', protein: 8, carbs: 38, fats: 9, fiber: 6 },
  { name: 'Sattu drink', protein: 12, carbs: 28, fats: 3, fiber: 4 },
  { name: 'Chicken & rice', protein: 40, carbs: 55, fats: 12, fiber: 3 },
  { name: 'Egg bhurji (4 eggs)', protein: 24, carbs: 4, fats: 18, fiber: 1 },
  { name: 'Dal + rice', protein: 16, carbs: 60, fats: 8, fiber: 9 },
  { name: 'Oats + milk', protein: 14, carbs: 45, fats: 7, fiber: 8 },
  { name: 'Banana peanut shake', protein: 18, carbs: 40, fats: 16, fiber: 5 },
  { name: 'Grilled fish', protein: 34, carbs: 0, fats: 10, fiber: 0 },
]

const macroLogs = {}
const water = {}

const today = new Date()
for (let i = DAYS_BACK - 1; i >= 0; i--) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
  if (Math.random() < SKIP_CHANCE) continue // leave a gap

  const key = dayKey(d)
  const count = randInt(3, 5)
  const entries = []
  for (let j = 0; j < count; j++) {
    const base = MEALS[randInt(0, MEALS.length - 1)]
    // ±15% jitter so totals vary day to day.
    const jitter = (v) => Math.round(v * (0.85 + Math.random() * 0.3))
    entries.push({
      id: `dummy-${key}-${j}`,
      name: base.name,
      protein: jitter(base.protein),
      carbs: jitter(base.carbs),
      fats: jitter(base.fats),
      fiber: jitter(base.fiber),
      fromMeal: false,
      tag: 'Seed',
    })
  }
  macroLogs[key] = entries
  water[key] = randInt(4, 9)
}

// ---- Body logs: one entry per day, ~3 check-ins per week, weight trending
// down with realistic noise; measurements logged roughly monthly. ----
const bodyLogs = {}
const round1 = (n) => Math.round(n * 10) / 10
let weight = 82 // starting weight ~14 months ago
for (let i = DAYS_BACK - 1; i >= 0; i--) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
  // Gentle downward drift (~0.45 kg / month) plus day-to-day water noise.
  weight += -0.015 + (Math.random() - 0.5) * 0.25
  if (Math.random() < 0.45) continue // only weigh in some days

  const key = dayKey(d)
  const entry = { day: key, at: d.getTime(), weight: round1(weight) }
  // Body fat loosely tracks weight; log it ~half the time.
  if (Math.random() < 0.5) entry.bodyFat = round1(14 + (weight - 74) * 0.4 + (Math.random() - 0.5))
  // Measurements roughly once a month (1st check-in of the month).
  if (d.getDate() <= 3) {
    entry.waist = round1(86 + (weight - 74) * 0.5 + (Math.random() - 0.5))
    entry.chest = round1(102 + (Math.random() - 0.5))
    entry.arms = round1(36 + (Math.random() - 0.5) * 0.6)
    entry.thighs = round1(58 + (Math.random() - 0.5))
  }
  bodyLogs[key] = entry
}

const backup = {
  version: 1,
  data: {
    targets: { protein: 160, carbs: 260, fats: 65, fiber: 35, calories: 2400 },
    macroLogs,
    water,
    bodyLogs,
  },
}

const out = 'macroid-dummy-trends.json'
writeFileSync(out, JSON.stringify(backup, null, 2))

const dayCount = Object.keys(macroLogs).length
const bodyCount = Object.keys(bodyLogs).length
console.log(`Wrote ${out} with ${dayCount} logged days and ${bodyCount} body check-ins across ${DAYS_BACK} calendar days.`)
