// One-off generator: builds an importable Macroid backup whose macro/calorie
// GOALS change over time (bulk → maintenance → cut → recomp) AND differ by
// day-type (training vs rest). Every logged day gets a STAMPED per-day target
// in `targetHistory`, so the Trends tab can be tested for correct per-day-target
// comparisons (adherence heatmap, composition, macro-trend goal line, etc.).
//
// Import the output via Settings → Local backup → Import JSON.
// Run: node scripts/gen-varying-targets.mjs
import { writeFileSync } from 'node:fs'

const DAYS_BACK = 430 // ~14 months → fills daily/weekly/monthly/yearly views
const SKIP_CHANCE = 0.1 // fraction of days with no log (realistic gaps)

// Weekdays that count as training (0=Sun … 6=Sat): Tue/Wed/Fri/Sat.
const TRAINING_DAYS = [2, 3, 5, 6]

function dayKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function round(n) {
  return Math.round(n)
}

// ---- Goal phases: each phase has its own training/rest target set. These are
// deliberately different so the charts visibly change over the timeline. ----
// `untilDaysAgo` = phase applies to days with `i` (days-ago) > this threshold.
// Listed oldest → newest.
const PHASES = [
  {
    name: 'Lean bulk',
    untilDaysAgo: 320,
    training: { protein: 170, carbs: 320, fats: 75, fiber: 38, calories: 2900 },
    rest: { protein: 170, carbs: 250, fats: 70, fiber: 38, calories: 2550 },
  },
  {
    name: 'Maintenance',
    untilDaysAgo: 210,
    training: { protein: 160, carbs: 270, fats: 68, fiber: 35, calories: 2550 },
    rest: { protein: 160, carbs: 210, fats: 62, fiber: 35, calories: 2250 },
  },
  {
    name: 'Cut',
    untilDaysAgo: 90,
    training: { protein: 185, carbs: 200, fats: 55, fiber: 32, calories: 2100 },
    rest: { protein: 185, carbs: 150, fats: 50, fiber: 32, calories: 1850 },
  },
  {
    name: 'Recomp',
    untilDaysAgo: -1, // most recent phase (covers through today)
    training: { protein: 175, carbs: 240, fats: 60, fiber: 36, calories: 2400 },
    rest: { protein: 175, carbs: 180, fats: 55, fiber: 36, calories: 2150 },
  },
]

function phaseFor(daysAgo) {
  for (const p of PHASES) {
    if (daysAgo > p.untilDaysAgo) return p
  }
  return PHASES[PHASES.length - 1]
}

function isTraining(d) {
  return TRAINING_DAYS.includes(d.getDay())
}

const today = new Date()

// ---- Build logs + stamped per-day targets. Intake adheres to THAT day's goal
// with realistic noise, occasionally drifting under/over so the adherence
// heatmap shows a mix of colours. ----
const macroLogs = {}
const water = {}
const targetHistory = {}
const dayOverrides = {}

function splitIntoEntries(key, totals) {
  // Break a day's totals into 3–4 plausible-looking entries.
  const n = randInt(3, 4)
  const entries = []
  let remP = totals.protein
  let remC = totals.carbs
  let remF = totals.fats
  let remFb = totals.fiber
  const names = ['Breakfast bowl', 'Lunch plate', 'Snack', 'Dinner', 'Shake']
  for (let j = 0; j < n; j++) {
    const last = j === n - 1
    const frac = last ? 1 : Math.random() * 0.45 + 0.2
    const p = last ? remP : round(remP * frac)
    const c = last ? remC : round(remC * frac)
    const f = last ? remF : round(remF * frac)
    const fb = last ? remFb : round(remFb * frac)
    remP -= p
    remC -= c
    remF -= f
    remFb -= fb
    entries.push({
      id: `vt-${key}-${j}`,
      name: names[j % names.length],
      protein: Math.max(0, p),
      carbs: Math.max(0, c),
      fats: Math.max(0, f),
      fiber: Math.max(0, fb),
      fromMeal: false,
      tag: 'Seed',
      source: Math.random() < 0.15 ? 'ai' : Math.random() < 0.3 ? 'plan' : 'user',
    })
  }
  return entries
}

for (let i = DAYS_BACK - 1; i >= 0; i--) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
  const key = dayKey(d)
  const phase = phaseFor(i)

  // Occasionally override the natural day-type to exercise dayOverrides.
  let training = isTraining(d)
  if (Math.random() < 0.06) {
    training = !training
    dayOverrides[key] = training ? 'training' : 'rest'
  }
  const tgt = training ? phase.training : phase.rest

  // ALWAYS stamp the per-day target (this is the field under test), even on
  // skipped days, so unlogged cells still know which goal applied.
  targetHistory[key] = { ...tgt }

  if (Math.random() < SKIP_CHANCE) continue // leave a logging gap

  // Adherence factor: mostly near 1.0, sometimes a clear under/over day.
  const r = Math.random()
  let adh
  if (r < 0.15) adh = 0.7 + Math.random() * 0.15 // under-eating day
  else if (r < 0.3) adh = 1.12 + Math.random() * 0.18 // over-eating day
  else adh = 0.92 + Math.random() * 0.16 // on-target-ish

  const totals = {
    protein: round(tgt.protein * (adh * 0.9 + Math.random() * 0.2)),
    carbs: round(tgt.carbs * adh),
    fats: round(tgt.fats * (adh * 0.95 + Math.random() * 0.15)),
    fiber: round(tgt.fiber * (0.7 + Math.random() * 0.5)),
  }
  macroLogs[key] = splitIntoEntries(key, totals)
  water[key] = randInt(4, 9)
}

// ---- Body logs: weight trends to match the phases (bulk up, then cut down). ----
const bodyLogs = {}
const round1 = (n) => Math.round(n * 10) / 10
let weight = 76
for (let i = DAYS_BACK - 1; i >= 0; i--) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
  const phase = phaseFor(i)
  // Drift direction follows the phase intent.
  const drift =
    phase.name === 'Lean bulk' ? 0.02 : phase.name === 'Cut' ? -0.03 : phase.name === 'Recomp' ? -0.005 : 0.0
  weight += drift + (Math.random() - 0.5) * 0.22
  if (Math.random() < 0.45) continue // only weigh in some days

  const key = dayKey(d)
  const entry = { day: key, at: d.getTime(), weight: round1(weight) }
  if (Math.random() < 0.5) entry.bodyFat = round1(13 + (weight - 74) * 0.4 + (Math.random() - 0.5))
  if (d.getDate() <= 3) {
    entry.waist = round1(84 + (weight - 74) * 0.5 + (Math.random() - 0.5))
    entry.chest = round1(102 + (Math.random() - 0.5))
    entry.arms = round1(37 + (Math.random() - 0.5) * 0.6)
    entry.thighs = round1(58 + (Math.random() - 0.5))
  }
  bodyLogs[key] = entry
}

// Live targets = the most recent (Recomp) phase, so today's goal matches the
// newest stamped history.
const live = PHASES[PHASES.length - 1]

const backup = {
  version: 1,
  data: {
    targets: { ...live.training },
    restTargets: { ...live.rest },
    macroLogs,
    water,
    targetHistory,
    dayOverrides,
    bodyLogs,
  },
}

const outFile = 'macroid-varying-targets.json'
writeFileSync(outFile, JSON.stringify(backup, null, 2))

const loggedDays = Object.keys(macroLogs).length
const stampedDays = Object.keys(targetHistory).length
const bodyCount = Object.keys(bodyLogs).length
console.log(
  `Wrote ${outFile}: ${loggedDays} logged days, ${stampedDays} stamped per-day targets, ` +
    `${bodyCount} body check-ins, ${PHASES.length} goal phases across ${DAYS_BACK} days.`,
)
