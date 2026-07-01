// Workout trend maths — weekly consistency, streaks and volume.
//
// A week is the ISO week (Monday → Sunday), matching the rest of the app's date
// helpers. A week counts as "consistent" when the user trained on at least
// CONSISTENT_DAYS_PER_WEEK distinct days that week.

import type { WorkoutSession } from '../types'
import { dayKey, startOfWeek, addDays, todayKey } from './dates'

// How many distinct training days a week needs to count as consistent.
export const CONSISTENT_DAYS_PER_WEEK = 4

// Parse a performed rep value ("8" -> 8, range "6-12" -> 12) for volume maths.
function repsNum(reps?: string): number {
  if (!reps) return 0
  const m = reps.match(/\d+/g)
  return m ? Number(m[m.length - 1]) : 0
}

// The local calendar day (YYYY-MM-DD) a session belongs to, from when it began.
export function sessionDay(session: WorkoutSession): string {
  return dayKey(new Date(session.startedAt))
}

// Working-set volume of a session (warm-ups excluded): Σ weight × reps.
export function sessionVolume(session: WorkoutSession): number {
  let vol = 0
  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      if (set.warmup) continue
      vol += (set.weight ?? 0) * repsNum(set.reps)
    }
  }
  return vol
}

export type WeekStat = {
  // Monday of the week (YYYY-MM-DD).
  weekStart: string
  // Number of distinct days trained that week.
  days: number
  // Number of sessions logged that week.
  sessions: number
  // Total working-set volume that week (kg×reps).
  volume: number
  // Whether the week met the consistency threshold.
  consistent: boolean
}

// Per-week stats keyed by the week's Monday, for every week that has sessions.
export function weekStats(
  sessions: Record<string, WorkoutSession>,
  threshold = CONSISTENT_DAYS_PER_WEEK,
): Map<string, WeekStat> {
  const days = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  const volumes = new Map<string, number>()
  for (const s of Object.values(sessions)) {
    const day = sessionDay(s)
    const wk = startOfWeek(day)
    let set = days.get(wk)
    if (!set) {
      set = new Set()
      days.set(wk, set)
    }
    set.add(day)
    counts.set(wk, (counts.get(wk) ?? 0) + 1)
    volumes.set(wk, (volumes.get(wk) ?? 0) + sessionVolume(s))
  }
  const out = new Map<string, WeekStat>()
  for (const [wk, set] of days) {
    out.set(wk, {
      weekStart: wk,
      days: set.size,
      sessions: counts.get(wk) ?? 0,
      volume: Math.round(volumes.get(wk) ?? 0),
      consistent: set.size >= threshold,
    })
  }
  return out
}

// The Monday keys of the last `n` weeks, oldest → current.
export function recentWeekStarts(n: number, today = todayKey()): string[] {
  const current = startOfWeek(today)
  return Array.from({ length: n }, (_, i) => addDays(current, -7 * (n - 1 - i)))
}

// Current run of consecutive consistent weeks ending at the present week.
// The in-progress current week never BREAKS the streak: if it hasn't hit the
// threshold yet, counting starts from last week (like a daily streak that
// tolerates "today isn't finished").
export function consistencyStreak(
  stats: Map<string, WeekStat>,
  today = todayKey(),
  threshold = CONSISTENT_DAYS_PER_WEEK,
): number {
  const met = (wk: string) => (stats.get(wk)?.days ?? 0) >= threshold
  let wk = startOfWeek(today)
  if (!met(wk)) wk = addDays(wk, -7)
  let n = 0
  while (met(wk)) {
    n++
    wk = addDays(wk, -7)
  }
  return n
}

// Longest run of consecutive consistent weeks anywhere in the history.
export function bestConsistencyStreak(
  stats: Map<string, WeekStat>,
  threshold = CONSISTENT_DAYS_PER_WEEK,
): number {
  const consistent = new Set(
    [...stats.values()].filter((s) => s.days >= threshold).map((s) => s.weekStart),
  )
  let best = 0
  for (const wk of consistent) {
    // Only begin counting at the start of a run.
    if (consistent.has(addDays(wk, -7))) continue
    let n = 0
    let cur = wk
    while (consistent.has(cur)) {
      n++
      cur = addDays(cur, 7)
    }
    if (n > best) best = n
  }
  return best
}
