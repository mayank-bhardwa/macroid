// Normalize quantity strings to a comparable numeric value within a unit family
// so pantry low-stock comparisons work (kg<->g, l<->ml, plus discrete units).

type Normalized = { value: number; family: string }

const MASS = 'mass'
const VOLUME = 'volume'
const COUNT = 'count'

const UNIT_MAP: Record<string, { family: string; factor: number }> = {
  // mass -> grams
  kg: { family: MASS, factor: 1000 },
  kgs: { family: MASS, factor: 1000 },
  g: { family: MASS, factor: 1 },
  gm: { family: MASS, factor: 1 },
  gms: { family: MASS, factor: 1 },
  gram: { family: MASS, factor: 1 },
  grams: { family: MASS, factor: 1 },
  // volume -> ml
  l: { family: VOLUME, factor: 1000 },
  ltr: { family: VOLUME, factor: 1000 },
  litre: { family: VOLUME, factor: 1000 },
  litres: { family: VOLUME, factor: 1000 },
  liter: { family: VOLUME, factor: 1000 },
  ml: { family: VOLUME, factor: 1 },
}

// Discrete count-ish units all normalize to family 'count'.
const COUNT_UNITS = new Set([
  'tub',
  'tubs',
  'scoop',
  'scoops',
  'pc',
  'pcs',
  'piece',
  'pieces',
  'jar',
  'jars',
  'pack',
  'packs',
  'packet',
  'packets',
  'box',
  'boxes',
  'dozen',
  'unit',
  'units',
  'loaf',
  'loaves',
  'bottle',
  'bottles',
])

export function normalizeQty(input: string | undefined | null): Normalized | null {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  const m = /^([\d.]+)\s*([a-z]+)?/.exec(s)
  if (!m) return null
  const value = parseFloat(m[1])
  if (!Number.isFinite(value)) return null
  let unit = (m[2] || '').replace(/\.$/, '')
  if (!unit) return { value, family: COUNT }
  if (UNIT_MAP[unit]) {
    return { value: value * UNIT_MAP[unit].factor, family: UNIT_MAP[unit].family }
  }
  if (COUNT_UNITS.has(unit)) {
    const mult = unit === 'dozen' ? 12 : 1
    return { value: value * mult, family: COUNT }
  }
  // Unknown unit -> treat as a count-like family keyed by the raw unit so that
  // "2 tubs" vs "1 tub" still compares, and dissimilar units don't falsely match.
  return { value, family: `other:${unit}` }
}

// Returns true if `current` is at or below `threshold` in comparable units.
export function isLowStock(current: string, threshold: string): boolean | null {
  const c = normalizeQty(current)
  const t = normalizeQty(threshold)
  if (!c || !t) return null
  if (c.family !== t.family) {
    // Families differ; if both are count-like, still compare loosely.
    if (c.family.startsWith('other') || t.family.startsWith('other')) {
      return c.value <= t.value
    }
    return null
  }
  return c.value <= t.value
}

// Returns true if `current` is below `fraction` of the `monthlyNeed` (e.g.
// fraction 0.2 → reorder when less than 20% of the month's quantity remains).
export function isLowByFraction(current: string, monthlyNeed: string, fraction = 0.2): boolean | null {
  const c = normalizeQty(current)
  const m = normalizeQty(monthlyNeed)
  if (!c || !m) return null
  if (c.family !== m.family) {
    if (c.family.startsWith('other') || m.family.startsWith('other')) {
      return c.value < m.value * fraction
    }
    return null
  }
  return c.value < m.value * fraction
}

// Parse a quantity string into its display value + unit, keeping the
// conversion factor so amounts can be combined within a family.
type ParsedQty = { value: number; unit: string; family: string; factor: number }

export function parseQty(input: string | undefined | null): ParsedQty | null {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  const m = /^([\d.]+)\s*([a-z]+)?/.exec(s)
  if (!m) return null
  const value = parseFloat(m[1])
  if (!Number.isFinite(value)) return null
  const unit = (m[2] || '').replace(/\.$/, '')
  if (!unit) return { value, unit: '', family: COUNT, factor: 1 }
  if (UNIT_MAP[unit]) {
    return { value, unit, family: UNIT_MAP[unit].family, factor: UNIT_MAP[unit].factor }
  }
  if (COUNT_UNITS.has(unit)) {
    return { value, unit, family: COUNT, factor: unit === 'dozen' ? 12 : 1 }
  }
  return { value, unit, family: `other:${unit}`, factor: 1 }
}

// Format a numeric value + unit back into a friendly string.
export function formatQty(value: number, unit: string): string {
  const rounded = Math.round(value * 1000) / 1000
  const num = Number.isInteger(rounded) ? String(rounded) : String(parseFloat(rounded.toFixed(3)))
  return unit ? `${num} ${unit}` : num
}

// Combine a delta amount into a current quantity. `sign` is +1 to add
// (restock / purchase) or -1 to subtract (use / consume). The result keeps the
// current value's unit when both are in the same family; incompatible units are
// left unchanged. An empty current starts from the delta's own unit.
export function adjustQty(current: string | undefined | null, delta: string, sign: 1 | -1): string {
  const d = parseQty(delta)
  if (!d || d.value <= 0) return (current ?? '').trim()
  const c = parseQty(current)
  if (!c) {
    if (sign < 0) return ''
    return formatQty(d.value, d.unit)
  }
  if (c.family !== d.family) {
    // Units aren't comparable — don't corrupt the stored value.
    return formatQty(c.value, c.unit)
  }
  const deltaInCurrent = (d.value * d.factor) / c.factor
  const next = Math.max(0, c.value + sign * deltaInCurrent)
  return formatQty(next, c.unit)
}
