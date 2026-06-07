const PREFIX = 'macroid:'

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable — ignore; app still works in-memory.
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

export const LS = {
  data: 'data',
  plan: 'customPlan',
  auth: 'auth',
  syncMeta: 'syncMeta',
  cursors: 'cursors',
  schema: 'schemaVersion',
} as const
