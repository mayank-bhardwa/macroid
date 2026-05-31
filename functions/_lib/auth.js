// Session/auth helpers shared by protected Functions.

// Extracts the bearer token from the Authorization header.
export function getBearer(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Resolves the current user from the request's bearer token.
// Returns { id, email } or null if missing/invalid/expired.
// Expired sessions are deleted opportunistically.
export async function getUser(request, env) {
  const token = getBearer(request);
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.email AS email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`
  )
    .bind(token)
    .first();

  if (!row) return null;

  if (row.expiresAt < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }

  return { id: row.userId, email: row.email };
}

export function sessionTtlMs(env) {
  const days = Number(env.SESSION_TTL_DAYS || 90);
  return (Number.isFinite(days) && days > 0 ? days : 90) * 24 * 60 * 60 * 1000;
}
