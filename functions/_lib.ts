// Shared types and helpers for Cloudflare Pages Functions.

export interface Env {
  DB: D1Database
  SESSION_TTL_DAYS?: string
  ALLOW_REGISTRATION?: string
}

export interface UserRow {
  id: string
  email: string
  password_hash: string
  salt: string
  iterations: number
  created_at: number
}

export const ALLOWED_COLLECTIONS = new Set([
  'macroLog',
  'water',
  'targetHistory',
  'morningPrep',
  'dayOverride',
  'mealPrep',
  'weeklyGrocery',
  'monthlyGrocery',
  'recentMeal',
  'food',
  'meta',
  'plan',
  'bodyLog',
])

// Mutable singleton documents that are overwritten in place. Before such a
// record is replaced via /api/sync, its prior value is archived to
// record_versions so the full edit history is retained. Date/week/month-keyed
// collections are logs (each scope is already its own record) and are excluded.
export const VERSIONED_COLLECTIONS = new Set(['plan', 'meta'])

export const PBKDF2_ITERATIONS = 100_000

const enc = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

export function saltToBase64(salt: Uint8Array): string {
  return toBase64(salt)
}

export function saltFromBase64(b64: string): Uint8Array {
  return fromBase64(b64)
}

export function newToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function newUuid(): string {
  return crypto.randomUUID()
}

// Constant-time string comparison.
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) {
    // Still do work to reduce timing signal, but length differs => not equal.
    let diff = 1
    const max = Math.max(ab.length, bb.length)
    for (let i = 0; i < max; i++) {
      diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0)
    }
    return diff === 0 && false
  }
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const e = email.trim().toLowerCase()
  // Basic but reasonable email validation.
  if (e.length < 3 || e.length > 254) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  return e
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function sessionTtlDays(env: Env): number {
  const n = Number(env.SESSION_TTL_DAYS)
  return Number.isFinite(n) && n > 0 ? n : 90
}

export function registrationAllowed(env: Env): boolean {
  return (env.ALLOW_REGISTRATION ?? 'true') !== 'false'
}

export function bearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m ? m[1].trim() : null
}

export async function authenticate(
  request: Request,
  env: Env,
): Promise<UserRow | null> {
  const token = bearerToken(request)
  if (!token) return null
  const now = Date.now()
  const session = await env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ?',
  )
    .bind(token)
    .first<{ user_id: string; expires_at: number }>()
  if (!session) return null
  if (session.expires_at <= now) {
    // Opportunistic cleanup of the expired session.
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
    return null
  }
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, salt, iterations, created_at FROM users WHERE id = ?',
  )
    .bind(session.user_id)
    .first<UserRow>()
  return user ?? null
}
