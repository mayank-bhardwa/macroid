import { json, error, readJson } from "../../_lib/http.js";
import { randomId, randomToken, hashPassword } from "../../_lib/crypto.js";
import { sessionTtlMs } from "../../_lib/auth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register  { email, password }  -> { token, user, expiresAt }
export async function onRequestPost({ request, env }) {
  if (String(env.ALLOW_REGISTRATION) === "false") {
    return error(403, "Registration is disabled.");
  }

  const body = await readJson(request);
  if (!body) return error(400, "Invalid JSON body.");

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!EMAIL_RE.test(email)) return error(400, "Enter a valid email address.");
  if (password.length < 8) return error(400, "Password must be at least 8 characters.");

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) return error(409, "An account with that email already exists.");

  const id = randomId();
  const now = Date.now();
  const { hash, salt, iterations } = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, salt, iterations, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, email, hash, salt, iterations, now)
    .run();

  const token = randomToken();
  const expiresAt = now + sessionTtlMs(env);
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(token, id, now, expiresAt)
    .run();

  return json({ token, expiresAt, user: { id, email } }, { status: 201 });
}
