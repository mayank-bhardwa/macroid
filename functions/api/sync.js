import { json, error, readJson } from "../_lib/http.js";
import { getUser } from "../_lib/auth.js";

const COLLECTIONS = new Set([
  "macroLog",
  "water",
  "targetHistory",
  "morningPrep",
  "dayOverride",
  "mealPrep",
  "weeklyGrocery",
  "monthlyGrocery",
  "recentMeal",
  "meta",
]);

const MAX_CHANGES = 5000;

function validChange(c) {
  return (
    c &&
    COLLECTIONS.has(c.collection) &&
    typeof c.recId === "string" &&
    c.recId.length > 0 &&
    typeof c.updatedAt === "number" &&
    Number.isFinite(c.updatedAt)
  );
}

// POST /api/sync
//   Request : { since?: number, changes?: Change[] }
//   Response: { now: number, changes: Change[] }
//   Change  : { collection, scope, recId, data, updatedAt, deleted }
//
// Offline-first, per-record, last-write-wins:
//   1. Each incoming change is upserted only if its updatedAt is newer than the
//      stored row (ON CONFLICT ... WHERE excluded.updated_at > records.updated_at).
//   2. All rows changed after the client's `since` cursor are returned so the
//      client can merge remote edits. The client advances its cursor to `now`.
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return error(401, "Not authenticated.");

  const body = await readJson(request);
  if (!body) return error(400, "Invalid JSON body.");

  const since = Number.isFinite(body.since) ? body.since : 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES) {
    return error(413, `Too many changes in one request (max ${MAX_CHANGES}).`);
  }

  // ---- Apply incoming changes (last-write-wins upsert) ----
  if (changes.length) {
    const stmt = env.DB.prepare(
      `INSERT INTO records (user_id, collection, scope, rec_id, data, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, collection, scope, rec_id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at,
         deleted = excluded.deleted
       WHERE excluded.updated_at > records.updated_at`
    );

    const batch = [];
    for (const c of changes) {
      if (!validChange(c)) continue;
      batch.push(
        stmt.bind(
          user.id,
          c.collection,
          typeof c.scope === "string" ? c.scope : "",
          c.recId,
          JSON.stringify(c.data ?? null),
          c.updatedAt,
          c.deleted ? 1 : 0
        )
      );
    }
    if (batch.length) await env.DB.batch(batch);
  }

  // ---- Return everything changed since the client's cursor ----
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT collection, scope, rec_id AS recId, data, updated_at AS updatedAt, deleted
       FROM records
      WHERE user_id = ? AND updated_at > ?
      ORDER BY updated_at ASC`
  )
    .bind(user.id, since)
    .all();

  const out = (results || []).map((r) => ({
    collection: r.collection,
    scope: r.scope,
    recId: r.recId,
    data: JSON.parse(r.data),
    updatedAt: r.updatedAt,
    deleted: !!r.deleted,
  }));

  return json({ now, changes: out });
}
