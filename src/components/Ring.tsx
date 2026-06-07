import type { GoalStatus } from '../lib/macros'

type RingProps = {
  value: number
  target: number
  size?: number
  stroke?: number
  color: string
  label: string
  unit?: string
  status: GoalStatus
  center?: boolean
}

function statusColor(status: GoalStatus, base: string): string {
  if (status === 'over') return 'var(--warn)'
  return base
}

export function Ring({
  value,
  target,
  size = 96,
  stroke = 9,
  color,
  label,
  unit = 'g',
  status,
  center = false,
}: RingProps) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = target > 0 ? value / target : 0
  const filled = Math.min(1, ratio)
  const over = ratio > 1
  const dash = c * filled
  const col = statusColor(status, color)
  const diff = Math.round(target - value)
  const sub = diff > 0 ? `${diff}${unit} left` : diff < 0 ? `${Math.abs(diff)}${unit} over` : 'met'

  return (
    <div className="col" style={{ alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--bg-2)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={col}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s' }}
          />
          {over && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="var(--warn)"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${c * Math.min(1, ratio - 1)} ${c}`}
              strokeLinecap="round"
              opacity={0.5}
            />
          )}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: center ? 26 : 17, fontWeight: 800, lineHeight: 1 }}>
            {Math.round(value)}
          </div>
          <div style={{ fontSize: center ? 12 : 10, color: 'var(--text-faint)' }}>
            / {Math.round(target)}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: status === 'over' ? 'var(--warn)' : 'var(--text-faint)' }}>{sub}</div>
      </div>
    </div>
  )
}
