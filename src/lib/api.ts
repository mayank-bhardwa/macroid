import type { AuthUser } from '../types'
import type { Change } from '../store/serialize'

export type AuthResult = { token: string; expiresAt: number; user: AuthUser }

function base(apiBase?: string): string {
  // Same-origin by default; allow an override base URL for cross-origin dev.
  return (apiBase || '').replace(/\/$/, '')
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return body as T
}

export async function apiRegister(
  email: string,
  password: string,
  apiBase?: string,
): Promise<AuthResult> {
  const res = await fetch(`${base(apiBase)}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return parse<AuthResult>(res)
}

export async function apiLogin(
  email: string,
  password: string,
  apiBase?: string,
): Promise<AuthResult> {
  const res = await fetch(`${base(apiBase)}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return parse<AuthResult>(res)
}

export async function apiLogout(token: string, apiBase?: string): Promise<void> {
  await fetch(`${base(apiBase)}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
}

export async function apiMe(token: string, apiBase?: string): Promise<{ user: AuthUser }> {
  const res = await fetch(`${base(apiBase)}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parse<{ user: AuthUser }>(res)
}

export async function apiSync(
  token: string,
  payload: { since?: number; changes?: Change[] },
  apiBase?: string,
): Promise<{ now: number; changes: Change[] }> {
  const res = await fetch(`${base(apiBase)}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  return parse<{ now: number; changes: Change[] }>(res)
}
