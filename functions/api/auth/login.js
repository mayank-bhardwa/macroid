import { json, error, readJson } from "../../_lib/http.js";
import { randomToken, verifyPassword } from "../../_lib/crypto.js";
import { sessionTtlMs } from "../../_lib/auth.js";

// POST /api/auth/login  { email, password }  -> { token, user, expiresAt }
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return error(400, "Invalid JSON body.");

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return error(400, "Email and password are required.");

  const user = await env.DB.prepare(
    "SELECT id, email, password_hash AS hash, salt, iterations FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  // Always run a verification path to reduce timing differences between
  // "no such user" and "wrong password".
  const ok = user
    ? await verifyPassword(password, user.hash, user.salt, user.iterations)
    : await verifyPassword(password, "AAAA", "AAAA", 100000).then(() => false);

  if (!user || !ok) return error(401, "Incorrect email or password.");

  const now = Date.now();
  const token = randomToken();
  const expiresAt = now + sessionTtlMs(env);
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(token, user.id, now, expiresAt)
    .run();

  return json({ token, expiresAt, user: { id: user.id, email: user.email } });
}
