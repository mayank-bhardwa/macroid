import {
  Env,
  json,
  normalizeEmail,
  pbkdf2,
  randomSalt,
  saltToBase64,
  newToken,
  newUuid,
  sessionTtlDays,
  registrationAllowed,
  PBKDF2_ITERATIONS,
} from '../../_lib'

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx
  if (!registrationAllowed(env)) {
    return json({ error: 'Registration is disabled' }, 403)
  }
  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const email = normalizeEmail(body.email)
  if (!email) return json({ error: 'Invalid email' }, 400)
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()
  if (existing) return json({ error: 'Email already registered' }, 409)

  const salt = randomSalt()
  const hash = await pbkdf2(body.password, salt, PBKDF2_ITERATIONS)
  const userId = newUuid()
  const now = Date.now()

  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(userId, email, hash, saltToBase64(salt), PBKDF2_ITERATIONS, now)
    .run()

  const token = newToken()
  const expiresAt = now + sessionTtlDays(env) * 24 * 60 * 60 * 1000
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(token, userId, now, expiresAt)
    .run()

  return json({ token, expiresAt, user: { id: userId, email } }, 201)
}
