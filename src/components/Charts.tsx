// Reusable, dependency-free SVG chart primitives used by the Trends page.
// All of them are presentational: callers pre-compute the numbers.
// Every chart shows an on-demand detail tooltip on hover (desktop) and on
// single tap/click (touch) via the shared `useTip` + `Bubble` helpers below.
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type TipRow = { label: string; value: string; color?: string }
export type ChartTip = { title: string; sub?: string; rows?: TipRow[] }

type TipState = { x: number; y: number; left: boolean; content: ChartTip } | null

// Shared tooltip controller: positions a floating bubble relative to a wrapper.
function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState>(null)
  // `leftAlign` anchors the bubble's left edge near x (used for narrow charts
  // like the donut where a centered bubble would clip); otherwise it is centered.
  const showAt = (clientX: number, clientY: number, content: ChartTip, leftAlign = false) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const y = Math.max(0, clientY - rect.top)
    setTip({
      x: leftAlign ? Math.min(x, Math.max(0, rect.width - 8)) : Math.max(86, Math.min(rect.width - 86, x)),
      y,
      left: leftAlign,
      content,
    })
  }
  const hide = () => setTip(null)
  return { ref, tip, showAt, hide }
}

function Bubble({ tip }: { tip: NonNullable<TipState> }) {
  return (
    <div
      className="chart-tip"
      style={{
        left: tip.x,
        top: tip.y,
        bottom: 'auto',
        transform: tip.left ? 'translateY(calc(-100% - 12px))' : 'translate(-50%, calc(-100% - 12px))',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="chart-tip-title">{tip.content.title}</div>
      {tip.content.sub && <div className="chart-tip-sub">{tip.content.sub}</div>}
      {tip.content.rows?.map((r, i) => (
        <div className="chart-tip-row" key={i}>
          <span className="chart-tip-dot" style={{ background: r.color ?? 'var(--text-faint)' }} />
          <span className="chart-tip-label">{r.label}</span>
          <span className="chart-tip-value">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function TipHost({
  hostRef,
  onLeave,
  children,
  style,
}: {
  hostRef: React.RefObject<HTMLDivElement>
  onLeave: () => void
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div ref={hostRef} style={{ position: 'relative', ...style }} onMouseLeave={onLeave}>
      {children}
    </div>
  )
}

export type DonutSegment = { label: string; value: number; color: string; tip?: ChartTip }

// A donut / ring chart. Renders each segment as an arc; optional center text.
export function Donut({
  segments,
  size = 130,
  thickness = 18,
  centerTop,
  centerSub,
}: {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerTop?: string
  centerSub?: string
}) {
  const { ref, tip, showAt, hide } = useTip()
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  const r = (size - thickness) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  let acc = 0

  const segTip = (s: DonutSegment): ChartTip =>
    s.tip ?? {
      title: s.label,
      rows: [{ label: 'Share', value: total > 0 ? `${Math.round((s.value / total) * 100)}%` : '0%', color: s.color }],
    }

  return (
    <TipHost hostRef={ref} onLeave={hide} style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s, i) => {
            const frac = Math.max(0, s.value) / total
            const len = frac * circ
            const el = (
              <circle
                key={i}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-acc}
                strokeLinecap={frac > 0 && frac < 1 ? 'butt' : 'round'}
                transform={`rotate(-90 ${cx} ${cx})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => showAt(e.clientX, e.clientY, segTip(s), true)}
                onMouseMove={(e) => showAt(e.clientX, e.clientY, segTip(s), true)}
                onClick={(e) => showAt(e.clientX, e.clientY, segTip(s), true)}
              />
            )
            acc += len
            return el
          })}
        {centerTop && (
          <text x={cx} y={cx - 2} textAnchor="middle" fontSize={20} fontWeight={800} fill="var(--text)" pointerEvents="none">
            {centerTop}
          </text>
        )}
        {centerSub && (
          <text x={cx} y={cx + 16} textAnchor="middle" fontSize={10.5} fill="var(--text-faint)" pointerEvents="none">
            {centerSub}
          </text>
        )}
      </svg>
      {tip && <Bubble tip={tip} />}
    </TipHost>
  )
}

export type HeatCell = { title: string; color: string; faded?: boolean; tip?: ChartTip } | null

// GitHub-style contribution grid. `weeks` are columns; each column is 7 cells
// (Mon → Sun). `null` cells render as empty padding (e.g. before the first day).
export function Heatmap({ weeks, cell = 13, gap = 3 }: { weeks: HeatCell[][]; cell?: number; gap?: number }) {
  const { ref, tip, showAt, hide } = useTip()
  return (
    <TipHost hostRef={ref} onLeave={hide}>
      <div style={{ display: 'flex', gap, overflowX: 'auto', paddingBottom: 2 }}>
        {weeks.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap }}>
            {col.map((c, ri) => (
              <div
                key={ri}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 3,
                  background: c ? c.color : 'transparent',
                  opacity: c?.faded ? 0.5 : 1,
                  cursor: c ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => c && showAt(e.clientX, e.clientY, c.tip ?? { title: c.title })}
                onMouseMove={(e) => c && showAt(e.clientX, e.clientY, c.tip ?? { title: c.title })}
                onClick={(e) => c && showAt(e.clientX, e.clientY, c.tip ?? { title: c.title })}
              />
            ))}
          </div>
        ))}
      </div>
      {tip && <Bubble tip={tip} />}
    </TipHost>
  )
}

export type HBarRow = { label: string; valueLabel: string; frac: number; sub?: string; tip?: ChartTip }

// Horizontal bar list (leaderboard). `frac` is 0..1 of the row's bar width.
export function HBarList({ rows, color = 'var(--accent)' }: { rows: HBarRow[]; color?: string }) {
  const { ref, tip, showAt, hide } = useTip()
  return (
    <TipHost hostRef={ref} onLeave={hide}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r, i) => {
          const t = r.tip ?? { title: r.label, rows: [{ label: r.sub ?? 'Value', value: r.valueLabel, color }] }
          return (
            <div
              key={i}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => showAt(e.clientX, e.clientY, t)}
              onMouseMove={(e) => showAt(e.clientX, e.clientY, t)}
              onClick={(e) => showAt(e.clientX, e.clientY, t)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{r.valueLabel}</span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-2)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(2, Math.min(100, r.frac * 100))}%`,
                    borderRadius: 4,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, #fff) 0%, ${color} 100%)`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {tip && <Bubble tip={tip} />}
    </TipHost>
  )
}

// A combined time-series chart: bars on a left axis, an optional smoothed line
// on the same left axis (e.g. rolling average), an optional goal line, and an
// optional second line on a RIGHT axis (e.g. weight vs calories).
export function TimeSeriesChart({
  labels,
  bars,
  barColor = 'var(--accent)',
  goal,
  line,
  lineColor = 'var(--text)',
  rightLine,
  rightColor = 'var(--accent)',
  height = 130,
  tips,
}: {
  labels: string[]
  bars?: (number | null)[]
  barColor?: string
  goal?: number
  line?: (number | null)[]
  lineColor?: string
  rightLine?: (number | null)[]
  rightColor?: string
  height?: number
  tips?: (ChartTip | null)[]
}) {
  const { ref, tip, showAt, hide } = useTip()
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const n = labels.length
  const w = Math.max(280, n * 14)
  const padY = 8
  const plotH = height - padY * 2

  const leftVals: number[] = []
  for (const v of bars ?? []) if (v != null && Number.isFinite(v)) leftVals.push(v)
  for (const v of line ?? []) if (v != null && Number.isFinite(v)) leftVals.push(v)
  if (goal != null) leftVals.push(goal)
  const leftMax = Math.max(1, ...leftVals) * 1.08
  const yL = (v: number) => padY + (1 - v / leftMax) * plotH

  const rightFinite = (rightLine ?? []).filter((v): v is number => v != null && Number.isFinite(v))
  const rMin = rightFinite.length ? Math.min(...rightFinite) : 0
  const rMax = rightFinite.length ? Math.max(...rightFinite) : 1
  const rRange = rMax - rMin || 1
  const yR = (v: number) => padY + (1 - (v - rMin) / rRange) * plotH

  const slot = w / Math.max(1, n)
  const barW = Math.min(slot * 0.62, 22)
  const xAt = (i: number) => slot * i + slot / 2

  const linePath = (vals: (number | null)[], yfn: (v: number) => number): string => {
    let d = ''
    let started = false
    vals.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) {
        started = false
        return
      }
      const x = xAt(i)
      const y = yfn(v)
      d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `
      started = true
    })
    return d.trim()
  }

  const pick = (clientX: number, clientY: number, i: number) => {
    setActiveIdx(i)
    const t = tips?.[i]
    if (t) showAt(clientX, clientY, t)
    else hide()
  }

  return (
    <TipHost
      hostRef={ref}
      onLeave={() => {
        setActiveIdx(null)
        hide()
      }}
    >
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
        {goal != null && (
          <line
            x1={0}
            x2={w}
            y1={yL(goal)}
            y2={yL(goal)}
            stroke={`color-mix(in srgb, ${barColor} 70%, transparent)`}
            strokeWidth={1.5}
            strokeDasharray="5 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {bars?.map((v, i) => {
          if (v == null || !Number.isFinite(v) || v <= 0) return null
          const y = yL(v)
          return (
            <rect
              key={i}
              x={xAt(i) - barW / 2}
              y={y}
              width={barW}
              height={Math.max(1, height - padY - y)}
              rx={2}
              fill={`color-mix(in srgb, ${barColor} ${activeIdx === i ? '100' : '80'}%, transparent)`}
            />
          )
        })}
        {line && (
          <path d={linePath(line, yL)} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        {rightLine && (
          <path d={linePath(rightLine, yR)} fill="none" stroke={rightColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        {rightLine?.map((v, i) =>
          v == null || !Number.isFinite(v) ? null : <circle key={i} cx={xAt(i)} cy={yR(v)} r={activeIdx === i ? 3.6 : 2.4} fill={rightColor} vectorEffect="non-scaling-stroke" />,
        )}
        {activeIdx != null && (
          <line
            x1={xAt(activeIdx)}
            x2={xAt(activeIdx)}
            y1={0}
            y2={height}
            stroke="var(--text-faint)"
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {/* Transparent per-column hit areas for hover/tap detail. */}
        {labels.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={slot * i}
            y={0}
            width={slot}
            height={height}
            fill="transparent"
            style={{ cursor: tips?.[i] ? 'pointer' : 'default' }}
            onMouseEnter={(e) => pick(e.clientX, e.clientY, i)}
            onMouseMove={(e) => pick(e.clientX, e.clientY, i)}
            onClick={(e) => pick(e.clientX, e.clientY, i)}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', marginTop: 4 }}>
        {labels.map((l, i) => (
          <div
            key={i}
            className="grow tiny"
            style={{ textAlign: 'center', color: activeIdx === i ? 'var(--text)' : 'var(--text-faint)', fontSize: 9, fontWeight: activeIdx === i ? 700 : 400 }}
          >
            {n <= 10 || i % Math.ceil(n / 6) === 0 || activeIdx === i ? l : ''}
          </div>
        ))}
      </div>
      {tip && <Bubble tip={tip} />}
    </TipHost>
  )
}
