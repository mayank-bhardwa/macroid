import type { BodyField, BodyLog } from '../types'

export const BODY_FIELDS: { key: BodyField; label: string; unit: string }[] = [
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'bodyFat', label: 'Body fat', unit: '%' },
  { key: 'waist', label: 'Waist', unit: 'cm' },
  { key: 'chest', label: 'Chest', unit: 'cm' },
  { key: 'hips', label: 'Hips', unit: 'cm' },
  { key: 'arms', label: 'Arms', unit: 'cm' },
  { key: 'thighs', label: 'Thighs', unit: 'cm' },
  { key: 'neck', label: 'Neck', unit: 'cm' },
]

export const MEASURE_FIELDS = BODY_FIELDS.filter((f) => f.key !== 'weight' && f.key !== 'bodyFat')

export type FormState = Record<BodyField, string> & { note: string }

export function emptyForm(): FormState {
  return { weight: '', bodyFat: '', waist: '', chest: '', hips: '', arms: '', thighs: '', neck: '', note: '' }
}

export function formFromLog(log: BodyLog): FormState {
  const f = emptyForm()
  for (const { key } of BODY_FIELDS) {
    const v = log[key]
    if (typeof v === 'number') f[key] = String(v)
  }
  if (log.note) f.note = log.note
  return f
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
