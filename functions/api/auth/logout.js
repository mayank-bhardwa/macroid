import { json } from "../../_lib/http.js";
import { getBearer } from "../../_lib/auth.js";

// POST /api/auth/logout  -> { ok: true }
// Revokes the current session token. Idempotent.
export async function onRequestPost({ request, env }) {
  const token = getBearer(request);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return json({ ok: true });
}
