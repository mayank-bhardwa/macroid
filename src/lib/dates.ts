// Date helpers — ALWAYS use the device's LOCAL calendar date, never UTC.

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function monthKeyOf(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? dateFromKey(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// ISO 8601 week key, e.g. "2026-W23".
export function isoWeekKey(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? dateFromKey(d) : new Date(d)
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // ISO: Thursday determines the year.
  const dayNum = (target.getDay() + 6) % 7 // Mon=0..Sun=6
  target.setDate(target.getDate() - dayNum + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstDayNum = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export function addDays(key: string, n: number): string {
  const d = dateFromKey(key)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

export function todayKey(): string {
  return dayKey(new Date())
}

// Monday-start of the ISO week containing `key`.
export function startOfWeek(key: string): string {
  const d = dateFromKey(key)
  const dayNum = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - dayNum)
  return dayKey(d)
}

// The 7 day-keys (Mon → Sun) of the ISO week containing `key`.
export function weekDays(key: string): string[] {
  const start = startOfWeek(key)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function weekdayShort(key: string): string {
  return WEEKDAYS[dateFromKey(key).getDay()]
}

export function weekdayLong(key: string): string {
  return WEEKDAYS_LONG[dateFromKey(key).getDay()]
}

export function formatDayLabel(key: string): string {
  const d = dateFromKey(key)
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

// Full, unambiguous date including the year, e.g. "Wed, Jun 3, 2026".
export function formatFullDate(key: string): string {
  const d = dateFromKey(key)
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function formatShortDate(key: string): string {
  const d = dateFromKey(key)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function isToday(key: string): boolean {
  return key === todayKey()
}

export function isPast(key: string): boolean {
  return key < todayKey()
}

export function isFuture(key: string): boolean {
  return key > todayKey()
}
