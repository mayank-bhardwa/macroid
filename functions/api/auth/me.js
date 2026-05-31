import { json, error } from "../../_lib/http.js";
import { getUser } from "../../_lib/auth.js";

// GET /api/auth/me  -> { user } | 401
// Lets the client confirm a stored token is still valid on app open.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return error(401, "Not authenticated.");
  return json({ user });
}
