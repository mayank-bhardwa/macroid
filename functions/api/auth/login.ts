import {
  Env,
  json,
  normalizeEmail,
  pbkdf2,
  saltFromBase64,
  newToken,
  sessionTtlDays,
  constantTimeEqual,
  PBKDF2_ITERATIONS,
  UserRow,
} from '../../_lib'

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx
  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const email = normalizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''

  const user = email
    ? await env.DB.prepare(
        'SELECT id, email, password_hash, salt, iterations, created_at FROM users WHERE email = ?',
      )
        .bind(email)
        .first<UserRow>()
    : null

  if (!user) {
    // Constant-time dummy verify to avoid revealing whether the email exists.
    const dummySalt = saltFromBase64('AAAAAAAAAAAAAAAAAAAAAA==')
    await pbkdf2(password || 'x', dummySalt, PBKDF2_ITERATIONS)
    return json({ error: 'Invalid credentials' }, 401)
  }

  const computed = await pbkdf2(password, saltFromBase64(user.salt), user.iterations)
  if (!constantTimeEqual(computed, user.password_hash)) {
    return json({ error: 'Invalid credentials' }, 401)
  }

  const now = Date.now()
  const token = newToken()
  const expiresAt = now + sessionTtlDays(env) * 24 * 60 * 60 * 1000
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(token, user.id, now, expiresAt)
    .run()

  return json({ token, expiresAt, user: { id: user.id, email: user.email } }, 200)
}
