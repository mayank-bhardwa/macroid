import { useState } from 'react'

export type TooltipRow = { label: string; value: string; color?: string }
export type BarTooltip = { title: string; subtitle?: string; rows: TooltipRow[] }

type Bar = {
  label: string
  value: number
  highlight?: boolean
  tooltip?: BarTooltip
  action?: { label: string; onClick: () => void }
}

export function BarChart({
  bars,
  goal,
  color = 'var(--accent)',
  height = 110,
}: {
  bars: Bar[]
  goal?: number
  color?: string
  height?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(goal ?? 0, ...bars.map((b) => b.value), 1)
  const goalY = goal ? (1 - goal / max) * 100 : null
  const activeBar = active != null ? bars[active] : null
  // Clamp the tooltip's horizontal anchor so edge bars don't overflow the card.
  const leftPct = active != null ? Math.min(82, Math.max(18, ((active + 0.5) / bars.length) * 100)) : 50

  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setActive(null)}>
      {activeBar?.tooltip && (
        <div className="chart-tip" style={{ left: `${leftPct}%` }} onClick={(e) => e.stopPropagation()}>
          <div className="chart-tip-title">{activeBar.tooltip.title}</div>
          {activeBar.tooltip.subtitle && <div className="chart-tip-sub">{activeBar.tooltip.subtitle}</div>}
          {activeBar.tooltip.rows.map((r, i) => (
            <div className="chart-tip-row" key={i}>
              <span className="chart-tip-dot" style={{ background: r.color ?? 'var(--text-faint)' }} />
              <span className="chart-tip-label">{r.label}</span>
              <span className="chart-tip-value">{r.value}</span>
            </div>
          ))}
          {activeBar.action && (
            <button
              className="btn sm block"
              style={{ marginTop: 8 }}
              onClick={() => {
                activeBar.action!.onClick()
                setActive(null)
              }}
            >
              {activeBar.action.label}
            </button>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: bars.length > 14 ? 2 : 4,
          height,
          position: 'relative',
        }}
      >
        {goalY != null && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${goalY}%`,
              borderTop: `1.5px dashed color-mix(in srgb, ${color} 70%, transparent)`,
            }}
          />
        )}
        {bars.map((b, i) => {
          const h = max > 0 ? Math.max(2, (b.value / max) * height) : 2
          const isZero = b.value === 0
          const met = goal ? b.value >= goal : false
          const isActive = active === i
          const fill = `linear-gradient(180deg, color-mix(in srgb, ${color} 90%, #fff) 0%, ${color} 100%)`
          return (
            <div
              key={i}
              className="grow"
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height, cursor: b.tooltip ? 'pointer' : 'default' }}
              onMouseEnter={() => b.tooltip && setActive(i)}
              onClick={() => b.tooltip && setActive((p) => (p === i ? null : i))}
              onDoubleClick={() => {
                // Double-click jumps straight to the drill-through / Open in Macros.
                if (b.action) {
                  setActive(null)
                  b.action.onClick()
                }
              }}
            >
              <div
                style={{
                  height: h,
                  borderRadius: '5px 5px 2px 2px',
                  background: isZero ? 'var(--surface-2)' : fill,
                  // Below-goal days stay colorful but dimmer so goal-hits pop.
                  opacity: isZero ? 0.6 : isActive ? 1 : goal && !met ? 0.5 : 1,
                  boxShadow: isActive
                    ? `0 0 0 1.5px ${color}`
                    : met
                      ? `0 0 10px color-mix(in srgb, ${color} 55%, transparent)`
                      : 'none',
                  border: b.highlight ? `1.5px solid ${color}` : 'none',
                  transition: 'height 0.3s, opacity 0.15s, box-shadow 0.15s',
                }}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: bars.length > 14 ? 2 : 4, marginTop: 4 }}>
        {bars.map((b, i) => (
          <div
            key={i}
            className="grow tiny"
            style={{ textAlign: 'center', color: active === i ? 'var(--text)' : 'var(--text-faint)', fontSize: 9, fontWeight: active === i ? 700 : 400 }}
          >
            {bars.length <= 10 || i % Math.ceil(bars.length / 7) === 0 ? b.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
