import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../store/store'
import { BarChart } from '../components/BarChart'
import type { BarTooltip } from '../components/BarChart'
import { TimeSeriesChart } from '../components/Charts'
import type { ChartTip } from '../components/Charts'
import { IconChevronLeft, IconChevronRight } from '../components/icons'
import { sumEntries, targetsForType, isOnTarget } from '../lib/macros'
import type { Totals } from '../lib/macros'
import { effectiveDayType } from '../lib/daytype'
import { BODY_FIELDS, round1 } from '../lib/body'
import {
  todayKey,
  addDays,
  isoWeekKey,
  monthKeyOf,
  dateFromKey,
  dayKey,
  formatShortDate,
  formatFullDate,
  weekdayShort,
  isToday,
} from '../lib/dates'
import type { BodyField, BodyLog, MacroEntry } from '../types'

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

const EMPTY_TOTALS: Totals = { protein: 0, carbs: 0, fats: 0, fiber: 0, calories: 0 }

const WINDOW: Record<Period, number> = { daily: 15, weekly: 8, monthly: 12, yearly: 5 }

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Drill context: anchors an aggregated period to a specific parent bucket.
type Scope = { year?: number; month?: number; weekKey?: string }
type Frame = { period: Period; scope: Scope; title: string; from: Period }

type Bucket = { key: string; label: string; full: string; value: number; logged: number; totals: Totals; dayKey?: string }

export function TrendsTab({ onJump }: { onJump: (day: string) => void }) {
  const data = useStore((s) => s.data)
  const plan = useStore((s) => s.plan)
  const targets = data.targets
  const [period, setPeriod] = useState<Period>('daily')
  const [offset, setOffset] = useState(0)
  const [stack, setStack] = useState<Frame[]>([])
  const [macroMetric, setMacroMetric] = useState<MacroBarKey>('calories')
  const [bodyMetric, setBodyMetric] = useState<BodyField>('weight')

  // Global window used by all non-drilled insights cards.
  const globalBuckets = useMemo(
    () => buildBuckets(period, offset, data.macroLogs, null),
    [period, offset, data.macroLogs],
  )
  const globalDays = useMemo(() => windowDaysFromBuckets(period, globalBuckets), [period, globalBuckets])

  // When drilled in, the top frame overrides the manual period + offset.
  const top = stack.length ? stack[stack.length - 1] : null
  const effPeriod = top ? top.period : period
  const effScope = top ? top.scope : null
  const scoped = !!top

  const buckets = useMemo(
    () => buildBuckets(effPeriod, scoped ? 0 : offset, data.macroLogs, effScope),
    [effPeriod, offset, scoped, effScope, data.macroLogs],
  )

  // Global per-bucket stats (macro averages + per-day goals + body metrics) used
  // by the Snapshot, the Body bar chart, and the Calorie+Weight line. Always on
  // the global (non-drilled) window so those summaries stay stable.
  const g = useMemo(
    () => computeGlobalStats(globalBuckets, globalDays, period, data, plan),
    [globalBuckets, globalDays, period, data, plan],
  )
  const streak = useMemo(() => loggingStreak(data.macroLogs), [data.macroLogs])

  // Which body fields actually have data in this window (drives the body picker).
  const bodyFields = useMemo(
    () => BODY_FIELDS.filter((f) => f.key === 'weight' || g.stats.some((s) => s.body[f.key] != null)),
    [g.stats],
  )
  const hasBody = useMemo(() => g.stats.some((s) => s.bodyCount > 0), [g.stats])

  const labels = useMemo(() => g.stats.map((s) => s.label), [g.stats])
  const unit = bucketWord(period)

  // Body bar chart: selected metric averaged per bucket.
  const bm = BODY_FIELDS.find((f) => f.key === bodyMetric) ?? BODY_FIELDS[0]
  const bodyBars = useMemo(
    () =>
      g.stats.map((s) => {
        const v = s.body[bodyMetric]
        return {
          label: s.label,
          value: v != null ? round1(v) : 0,
          tooltip: {
            title: s.full,
            subtitle: s.bodyCount > 0 ? `${s.bodyCount} ${s.bodyCount === 1 ? 'check-in' : 'check-ins'}` : 'No check-ins',
            rows: v != null ? [{ label: bm.label, value: `${round1(v)} ${bm.unit}`, color: 'var(--accent)' }] : [{ label: 'No data', value: '—' }],
          } as BarTooltip,
        }
      }),
    [g.stats, bodyMetric, bm],
  )

  // Calorie + weight line chart, one point per bucket.
  const line = useMemo(() => {
    const cal = g.stats.map((s) => (s.macroAvg ? Math.round(s.macroAvg.calories) : null))
    const weight = g.stats.map((s) => s.weight)
    const hasWeight = weight.some((w) => w != null)
    const tips: (ChartTip | null)[] = g.stats.map((s) => ({
      title: s.full,
      sub: s.loggedDays ? `${s.loggedDays}/${s.totalDays} days logged` : 'No data',
      rows: [
        { label: 'Avg calories', value: s.macroAvg ? `${Math.round(s.macroAvg.calories)} kcal` : '—', color: 'var(--calories)' },
        { label: 'Goal', value: s.goalAvg ? `${Math.round(s.goalAvg.calories)} kcal` : '—', color: 'var(--text-faint)' },
        { label: 'Weight', value: s.weight != null ? `${round1(s.weight)} kg` : '—', color: 'var(--accent)' },
      ],
    }))
    return { cal, weight, hasWeight, tips }
  }, [g.stats])

  const mm = MACRO_BAR_META.find((m) => m.key === macroMetric) ?? MACRO_BAR_META[0]
  // Daily view compares each bar to the live goal for the chosen metric; the
  // aggregated views drop the goal line since bars are bucket sums.
  const chartGoal = effPeriod === 'daily' ? targets[macroMetric] : undefined

  function selectPeriod(p: Period) {
    setStack([])
    setPeriod(p)
    setOffset(0)
  }

  // Drill one level deeper (year → months → weeks → days → Macros).
  function drillInto(b: Bucket) {
    if (effPeriod === 'daily') {
      if (b.dayKey) onJump(b.dayKey)
      return
    }
    if (b.logged === 0) return
    if (effPeriod === 'yearly') {
      const year = Number(b.key)
      setStack([...stack, { period: 'monthly', scope: { year }, title: String(year), from: effPeriod }])
    } else if (effPeriod === 'monthly') {
      const [y, m] = b.key.split('-').map(Number)
      setStack([...stack, { period: 'weekly', scope: { year: y, month: m - 1 }, title: `${MONTHS_LONG[m - 1]} ${y}`, from: effPeriod }])
    } else if (effPeriod === 'weekly') {
      const days = isoWeekDays(b.key)
      setStack([...stack, { period: 'daily', scope: { weekKey: b.key }, title: weekRangeLabel(days), from: effPeriod }])
    }
  }

  function goBack() {
    setStack(stack.slice(0, -1))
  }

  // Build the Power BI-style tooltip + drill action for a macro bucket bar. The
  // bar height reflects the currently selected macro metric; the tooltip always
  // carries the full macro split.
  function macroBar(b: Bucket) {
    const v = b.logged > 0 ? b.totals[macroMetric] : 0
    const rows = b.logged > 0
      ? [
          { label: 'Calories', value: `${Math.round(b.totals.calories)} kcal`, color: 'var(--calories)' },
          { label: 'Protein', value: `${Math.round(b.totals.protein)} g`, color: 'var(--protein)' },
          { label: 'Carbs', value: `${Math.round(b.totals.carbs)} g`, color: 'var(--carbs)' },
          { label: 'Fats', value: `${Math.round(b.totals.fats)} g`, color: 'var(--fats)' },
          { label: 'Fiber', value: `${Math.round(b.totals.fiber)} g`, color: 'var(--fiber)' },
        ]
      : [{ label: 'No meals logged', value: '—' }]
    const subtitle = effPeriod === 'daily'
      ? undefined
      : b.logged > 0
        ? `${b.logged} ${b.logged === 1 ? 'day' : 'days'} logged`
        : 'No data logged'
    const tooltip: BarTooltip = { title: b.full, subtitle, rows }
    const drillable = effPeriod === 'daily' ? !!b.dayKey : b.logged > 0
    const action = drillable
      ? {
          label: effPeriod === 'daily' ? 'Open in Macros' : `Drill into ${bucketWord(effPeriod)}`,
          onClick: () => drillInto(b),
        }
      : undefined
    return { label: b.label, value: Math.round(v), tooltip, action }
  }

  return (
    <>
      <div className="card tight">
        <div className="card-title" style={{ marginBottom: 10 }}><span>Trends</span></div>
        <div className="segmented">
          {(['daily', 'weekly', 'monthly', 'yearly'] as Period[]).map((p) => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => selectPeriod(p)}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="card-title" style={{ marginTop: 10 }}>
          <button className="round-btn" style={{ width: 34, height: 34 }} onClick={() => setOffset(offset + 1)} aria-label="Older">
            <IconChevronLeft width={18} height={18} />
          </button>
          <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
            {periodLabel(period, globalBuckets)}
          </span>
          <button
            className="round-btn"
            style={{ width: 34, height: 34 }}
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 1))}
            aria-label="Newer"
          >
            <IconChevronRight width={18} height={18} />
          </button>
        </div>
      </div>

      {/* ---- Snapshot (macros + body) ---- */}
      <div className="card">
        <div className="card-title"><span>Snapshot · {periodLabel(period, globalBuckets)}</span></div>
        <div className="stat-tiles">
          <div className="stat-tile"><div className="v" style={{ color: 'var(--calories)' }}>{g.kpis.avgCalories}</div><div className="k">Avg kcal / day</div></div>
          <div className="stat-tile"><div className="v" style={{ color: 'var(--ok)' }}>{g.kpis.onTargetPct}%</div><div className="k">On calorie target</div></div>
          <div className="stat-tile"><div className="v" style={{ color: 'var(--accent)' }}>{streak}</div><div className="k">Logging streak</div></div>
        </div>
        {hasBody && (
          <div className="stat-tiles" style={{ marginTop: 10 }}>
            <div className="stat-tile"><div className="v" style={{ color: 'var(--accent)' }}>{g.kpis.lastWeight != null ? round1(g.kpis.lastWeight) : '—'}<span style={{ fontSize: 12 }}>{g.kpis.lastWeight != null ? 'kg' : ''}</span></div><div className="k">Latest weight</div></div>
            <div className="stat-tile"><div className="v" style={{ color: g.kpis.firstWeight != null && g.kpis.lastWeight != null && g.kpis.lastWeight - g.kpis.firstWeight <= 0 ? 'var(--ok)' : 'var(--carbs)' }}>{g.kpis.firstWeight != null && g.kpis.lastWeight != null ? `${g.kpis.lastWeight - g.kpis.firstWeight > 0 ? '+' : ''}${round1(g.kpis.lastWeight - g.kpis.firstWeight)}` : '—'}</div><div className="k">Weight change</div></div>
            <div className="stat-tile"><div className="v" style={{ color: 'var(--fats)' }}>{g.kpis.latestBodyFat != null ? round1(g.kpis.latestBodyFat) : '—'}<span style={{ fontSize: 12 }}>{g.kpis.latestBodyFat != null ? '%' : ''}</span></div><div className="k">Body fat</div></div>
          </div>
        )}
      </div>

      {/* ---- Macros bar chart ---- */}
      <div className="card">
        {scoped && (
          <div
            className="tiny"
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 12, color: 'var(--text-faint)' }}
          >
            <button onClick={() => setStack([])} style={crumbBtn}>
              {stack[0].from[0].toUpperCase() + stack[0].from.slice(1)}
            </button>
            {stack.map((f, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span>›</span>
                {i === stack.length - 1 ? (
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{f.title}</span>
                ) : (
                  <button onClick={() => setStack(stack.slice(0, i + 1))} style={crumbBtn}>
                    {f.title}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="card-title">
          {scoped ? (
            <button className="round-btn" style={{ width: 34, height: 34 }} onClick={goBack} aria-label="Back">
              <IconChevronLeft width={18} height={18} />
            </button>
          ) : (
            <span style={{ width: 34, height: 34 }} />
          )}
          <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
            {scoped ? top!.title : `Macros · ${mm.label}`}
          </span>
          <span style={{ width: 34, height: 34 }} />
        </div>

        <div className="segmented" style={{ marginBottom: 14 }}>
          {MACRO_BAR_META.map((m) => (
            <button key={m.key} className={macroMetric === m.key ? 'active' : ''} onClick={() => setMacroMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        <BarChart bars={buckets.map(macroBar)} goal={chartGoal} color={mm.color} />
        <div className="tiny faint" style={{ textAlign: 'center', marginTop: 8 }}>
          {effPeriod === 'daily' ? `Tap a day for its full macro breakdown · values in ${mm.unit}` : `Tap a ${bucketWord(effPeriod)} to drill in · values in ${mm.unit}`}
        </div>
      </div>

      {/* ---- Body bar chart ---- */}
      {hasBody && (
        <div className="card">
          <div className="card-title"><span>Body · {bm.label}</span></div>
          {bodyFields.length > 1 && (
            <div className="chips" style={{ marginBottom: 14 }}>
              {bodyFields.map((f) => (
                <button key={f.key} className={`chip${bodyMetric === f.key ? ' active' : ''}`} onClick={() => setBodyMetric(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <BarChart bars={bodyBars} color="var(--accent)" />
          <div className="tiny faint" style={{ textAlign: 'center', marginTop: 8 }}>
            Average {bm.label.toLowerCase()} per {unit} ({bm.unit}) · tap a bar for details
          </div>
        </div>
      )}

      {/* ---- Calorie + weight line ---- */}
      <div className="card">
        <div className="card-title"><span>Calories &amp; weight</span></div>
        <TimeSeriesChart
          labels={labels}
          line={line.cal}
          lineColor="var(--calories)"
          rightLine={line.hasWeight ? line.weight : undefined}
          rightColor="var(--accent)"
          height={160}
          tips={line.tips}
        />
        <div className="tiny faint" style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span><span style={legendDot('var(--calories)')} />Avg kcal / {unit}</span>
          {line.hasWeight && <span><span style={legendDot('var(--accent)')} />Weight (kg)</span>}
        </div>
      </div>
    </>
  )
}

// ---------------- Macro + body metric metadata ----------------

type MacroBarKey = 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber'
const MACRO_BAR_META: { key: MacroBarKey; label: string; unit: string; color: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', color: 'var(--calories)' },
  { key: 'protein', label: 'Protein', unit: 'g', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: 'var(--carbs)' },
  { key: 'fats', label: 'Fats', unit: 'g', color: 'var(--fats)' },
  { key: 'fiber', label: 'Fiber', unit: 'g', color: 'var(--fiber)' },
]

// ---------------- Global per-bucket aggregation ----------------

type GBucket = {
  key: string
  label: string
  full: string
  totalDays: number
  loggedDays: number
  macroAvg: Totals | null
  goalAvg: Totals | null
  onTarget: number
  body: Partial<Record<BodyField, number>>
  bodyCount: number
  weight: number | null
}

type GStats = {
  stats: GBucket[]
  kpis: {
    avgCalories: number
    onTargetPct: number
    loggedDays: number
    firstWeight: number | null
    lastWeight: number | null
    latestBodyFat: number | null
  }
}

// Roll the per-day macro + body data up into the active period's buckets so the
// Snapshot, Body bar chart and Calorie+Weight line all share one granularity.
function computeGlobalStats(
  buckets: Bucket[],
  days: string[],
  period: Period,
  data: ReturnType<typeof useStore.getState>['data'],
  plan: ReturnType<typeof useStore.getState>['plan'],
): GStats {
  const { targets, restTargets } = data
  const perDay = days.map((k) => {
    const entries = data.macroLogs[k]
    const logged = !!entries && entries.length > 0
    const { type } = effectiveDayType(k, data.dayOverrides, plan.trainingDays)
    const tgt = data.targetHistory[k] ?? targetsForType(type, targets, restTargets)
    return { key: k, totals: logged ? sumEntries(entries) : null, tgt }
  })
  const weights = fillWeight(days, data.bodyLogs)
  const wByDay = new Map<string, number | null>(days.map((k, i) => [k, weights[i]]))

  const groups = new Map<string, typeof perDay>()
  for (const b of buckets) groups.set(b.key, [])
  for (const d of perDay) {
    const grp = groups.get(bucketKeyOf(period, d.key))
    if (grp) grp.push(d)
  }

  const stats: GBucket[] = buckets.map((b) => {
    const ds = groups.get(b.key) ?? []
    const logged = ds.filter((d) => d.totals)
    const n = logged.length
    const sum = logged.reduce((a, d) => addTotals(a, d.totals!), EMPTY_TOTALS)
    const goalSum = ds.reduce((a, d) => addTotals(a, d.tgt), EMPTY_TOTALS)
    let onTarget = 0
    for (const d of logged) {
      if (isOnTarget(d.totals!.calories, d.tgt.calories)) onTarget++
    }
    // Body metrics: average each present field over check-ins in the bucket.
    const body: Partial<Record<BodyField, number>> = {}
    const counts: Partial<Record<BodyField, number>> = {}
    let bodyCount = 0
    for (const d of ds) {
      const log = data.bodyLogs[d.key]
      if (!log) continue
      bodyCount++
      for (const f of BODY_FIELDS) {
        const v = log[f.key]
        if (typeof v === 'number') {
          body[f.key] = (body[f.key] ?? 0) + v
          counts[f.key] = (counts[f.key] ?? 0) + 1
        }
      }
    }
    for (const f of BODY_FIELDS) {
      const c = counts[f.key]
      if (c) body[f.key] = body[f.key]! / c
    }
    // Weight for the line: avg logged weight in the bucket, else last known.
    let weight = body.weight ?? null
    if (weight == null) {
      for (const d of ds) {
        const w = wByDay.get(d.key)
        if (w != null) weight = w
      }
    }
    return {
      key: b.key,
      label: b.label,
      full: b.full,
      totalDays: ds.length,
      loggedDays: n,
      macroAvg: n ? scaleTotals(sum, 1 / n) : null,
      goalAvg: ds.length ? scaleTotals(goalSum, 1 / ds.length) : null,
      onTarget,
      body,
      bodyCount,
      weight,
    }
  })

  const allLogged = perDay.filter((d) => d.totals)
  const avgCalories = allLogged.length ? Math.round(allLogged.reduce((s, d) => s + d.totals!.calories, 0) / allLogged.length) : 0
  let onT = 0
  for (const d of allLogged) {
    if (isOnTarget(d.totals!.calories, d.tgt.calories)) onT++
  }
  const loggedWeights = days.map((k) => data.bodyLogs[k]?.weight).filter((v): v is number => typeof v === 'number')
  let latestBodyFat: number | null = null
  for (const k of days) {
    const bf = data.bodyLogs[k]?.bodyFat
    if (typeof bf === 'number') latestBodyFat = bf
  }
  return {
    stats,
    kpis: {
      avgCalories,
      onTargetPct: allLogged.length ? Math.round((onT / allLogged.length) * 100) : 0,
      loggedDays: allLogged.length,
      firstWeight: loggedWeights.length ? loggedWeights[0] : null,
      lastWeight: loggedWeights.length ? loggedWeights[loggedWeights.length - 1] : null,
      latestBodyFat,
    },
  }
}

// Carry the last known body weight forward across days with no check-in.
function fillWeight(days: string[], bodyLogs: Record<string, BodyLog>): (number | null)[] {
  const wDays = Object.keys(bodyLogs)
    .filter((k) => typeof bodyLogs[k].weight === 'number')
    .sort()
  let pi = 0
  let last: number | null = null
  return days.map((day) => {
    while (pi < wDays.length && wDays[pi] <= day) {
      last = bodyLogs[wDays[pi]].weight as number
      pi++
    }
    return last
  })
}

// Current consecutive-day logging streak ending today (or yesterday if today is blank).
function loggingStreak(logs: Record<string, MacroEntry[]>): number {
  let k = todayKey()
  if (!logs[k] || logs[k].length === 0) k = addDays(k, -1)
  let n = 0
  while (logs[k] && logs[k].length > 0) {
    n++
    k = addDays(k, -1)
  }
  return n
}

// Which bucket key a given day rolls up into, for the selected period. This is
// the SAME grouping the macro chart uses, so every aggregated view shows one bar
// per bucket (e.g. 12 month-bars in Monthly) instead of cramming daily bars.
function bucketKeyOf(period: Period, day: string): string {
  if (period === 'weekly') return isoWeekKey(day)
  if (period === 'monthly') return monthKeyOf(day)
  if (period === 'yearly') return String(dateFromKey(day).getFullYear())
  return day
}

function legendDot(color: string): CSSProperties {
  return { display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: color, marginRight: 5 }
}

// ---------------- Body tracking ----------------

const crumbBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
}

function addTotals(a: Totals, b: Totals): Totals {
  return {
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fats: a.fats + b.fats,
    fiber: a.fiber + b.fiber,
    calories: a.calories + b.calories,
  }
}

function scaleTotals(t: Totals, f: number): Totals {
  return { protein: t.protein * f, carbs: t.carbs * f, fats: t.fats * f, fiber: t.fiber * f, calories: t.calories * f }
}

function buildBuckets(
  period: Period,
  offset: number,
  logs: Record<string, MacroEntry[]>,
  scope: Scope | null,
): Bucket[] {
  const n = WINDOW[period]
  const out: Bucket[] = []

  if (period === 'daily') {
    // Either the 7 days of a drilled-into week, or the rolling daily window.
    let days: string[]
    if (scope?.weekKey) {
      days = isoWeekDays(scope.weekKey)
    } else {
      days = []
      const end = -offset * n
      for (let i = n - 1; i >= 0; i--) days.push(addDays(todayKey(), end - i))
    }
    for (const key of days) {
      const has = !!logs[key] && logs[key].length > 0
      const totals = has ? sumEntries(logs[key]) : EMPTY_TOTALS
      out.push({
        key,
        label: scope?.weekKey ? weekdayShort(key) : formatShortDate(key).replace(/^[A-Za-z]+ /, ''),
        full: isToday(key) ? `Today · ${formatFullDate(key)}` : formatFullDate(key),
        value: totals.calories,
        logged: has ? 1 : 0,
        totals,
        dayKey: key,
      })
    }
    return out
  }

  // Aggregated periods: group all logged days by their bucket key.
  const dayBucket = (day: string): string => {
    if (period === 'weekly') return isoWeekKey(day)
    if (period === 'monthly') return monthKeyOf(day)
    return String(dateFromKey(day).getFullYear())
  }

  // Generate the ordered window of bucket keys (scoped to a parent when drilled in).
  const keys: string[] = []
  const labels: Record<string, string> = {}
  const fulls: Record<string, string> = {}
  if (period === 'weekly') {
    if (scope?.year != null && scope?.month != null) {
      // ISO weeks that touch the drilled-into month.
      for (const k of monthWeeks(scope.year, scope.month)) {
        keys.push(k)
        const days = isoWeekDays(k)
        labels[k] = 'W' + (k.split('-W')[1] ?? '')
        fulls[k] = weekRangeLabel(days)
      }
    } else {
      let anchor = todayKey()
      anchor = addDays(anchor, -offset * n * 7)
      for (let i = n - 1; i >= 0; i--) {
        const d = addDays(anchor, -i * 7)
        const k = isoWeekKey(d)
        keys.push(k)
        const days = isoWeekDays(k)
        labels[k] = k.split('-W')[1] ? 'W' + k.split('-W')[1] : k
        fulls[k] = weekRangeLabel(days)
      }
    }
  } else if (period === 'monthly') {
    if (scope?.year != null) {
      // All 12 months of the drilled-into year.
      for (let m = 0; m < 12; m++) {
        const d = new Date(scope.year, m, 1)
        const k = monthKeyOf(d)
        keys.push(k)
        labels[k] = MONTHS_SHORT[m]
        fulls[k] = `${MONTHS_LONG[m]} ${scope.year}`
      }
    } else {
      const base = new Date()
      base.setDate(1)
      base.setMonth(base.getMonth() - offset * n)
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
        const k = monthKeyOf(d)
        keys.push(k)
        labels[k] = MONTHS_SHORT[d.getMonth()]
        fulls[k] = `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
      }
    }
  } else {
    const baseYear = new Date().getFullYear() - offset * n
    for (let i = n - 1; i >= 0; i--) {
      const y = String(baseYear - i)
      keys.push(y)
      labels[y] = y.slice(2)
      fulls[y] = y
    }
  }

  const agg: Record<string, { totals: Totals; logged: number }> = {}
  for (const k of keys) agg[k] = { totals: EMPTY_TOTALS, logged: 0 }
  for (const day of Object.keys(logs)) {
    if (!logs[day] || logs[day].length === 0) continue
    const bk = dayBucket(day)
    if (agg[bk]) {
      agg[bk].totals = addTotals(agg[bk].totals, sumEntries(logs[day]))
      agg[bk].logged += 1
    }
  }
  for (const k of keys) {
    out.push({ key: k, label: labels[k] ?? k, full: fulls[k] ?? labels[k] ?? k, value: agg[k].totals.calories, logged: agg[k].logged, totals: agg[k].totals })
  }
  return out
}

// A week range label that always includes the year, e.g. "Jun 1 – Jun 7, 2026".
function weekRangeLabel(days: string[]): string {
  const startY = dateFromKey(days[0]).getFullYear()
  const endY = dateFromKey(days[6]).getFullYear()
  if (startY !== endY) {
    return `${formatShortDate(days[0])}, ${startY} – ${formatShortDate(days[6])}, ${endY}`
  }
  return `${formatShortDate(days[0])} – ${formatShortDate(days[6])}, ${endY}`
}

// The seven local-calendar days (Mon..Sun) of an ISO week key like "2026-W23".
function isoWeekDays(weekKey: string): string[] {
  const [yStr, wStr] = weekKey.split('-W')
  const year = Number(yStr)
  const week = Number(wStr)
  // ISO week 1 is the week containing Jan 4th.
  const jan4 = new Date(year, 0, 4)
  const jan4Dow = (jan4.getDay() + 6) % 7 // Mon=0..Sun=6
  const monday = new Date(year, 0, 4 - jan4Dow + (week - 1) * 7)
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    days.push(dayKey(d))
  }
  return days
}

// Ordered, de-duplicated ISO week keys that overlap a given month.
function monthWeeks(year: number, month: number): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= lastDay; d++) {
    const k = isoWeekKey(new Date(year, month, d))
    if (!seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }
  return keys
}

function bucketWord(p: Period): string {
  return p === 'daily' ? 'day' : p === 'weekly' ? 'week' : p === 'monthly' ? 'month' : 'year'
}

function periodLabel(period: Period, buckets: Bucket[]): string {
  if (buckets.length === 0) return ''
  const first = buckets[0]
  const last = buckets[buckets.length - 1]
  if (period === 'daily') {
    const lastIsToday = last.dayKey && isToday(last.dayKey)
    const start = `${formatShortDate(first.key)}, ${dateFromKey(first.key).getFullYear()}`
    return `${start} – ${lastIsToday ? 'Today' : formatShortDate(last.key)}`
  }
  if (period === 'monthly') {
    const [fy, fm] = first.key.split('-').map(Number)
    const [ly, lm] = last.key.split('-').map(Number)
    return `${MONTHS_SHORT[fm - 1]} ${fy} – ${MONTHS_SHORT[lm - 1]} ${ly}`
  }
  if (period === 'yearly') {
    return first.key === last.key ? first.key : `${first.key} – ${last.key}`
  }
  if (period === 'weekly') {
    const fs = isoWeekDays(first.key)[0]
    const le = isoWeekDays(last.key)[6]
    return `${formatShortDate(fs)}, ${dateFromKey(fs).getFullYear()} – ${formatShortDate(le)}, ${dateFromKey(le).getFullYear()}`
  }
  return `${first.label} – ${last.label}`
}

function windowDaysFromBuckets(period: Period, buckets: Bucket[]): string[] {
  if (buckets.length === 0) return []
  if (period === 'daily') return buckets.map((b) => b.key)

  const first = buckets[0].key
  const last = buckets[buckets.length - 1].key
  let start = first
  let end = last

  if (period === 'weekly') {
    start = isoWeekDays(first)[0]
    end = isoWeekDays(last)[6]
  } else if (period === 'monthly') {
    const [sy, sm] = first.split('-').map(Number)
    const [ey, em] = last.split('-').map(Number)
    start = dayKey(new Date(sy, sm - 1, 1))
    end = dayKey(new Date(ey, em, 0))
  } else {
    start = `${first}-01-01`
    end = `${last}-12-31`
  }

  const today = todayKey()
  if (end > today) end = today

  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}
