import { Env, json, authenticate, ALLOWED_COLLECTIONS, VERSIONED_COLLECTIONS } from '../_lib'

interface Change {
  collection: string
  scope: string
  recId: string
  data: unknown
  updatedAt: number
  deleted?: boolean
}

function validChange(c: unknown): c is Change {
  if (!c || typeof c !== 'object') return false
  const x = c as Record<string, unknown>
  return (
    typeof x.collection === 'string' &&
    ALLOWED_COLLECTIONS.has(x.collection) &&
    typeof x.scope === 'string' &&
    typeof x.recId === 'string' &&
    x.recId.length > 0 &&
    typeof x.updatedAt === 'number' &&
    Number.isFinite(x.updatedAt)
  )
}

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx
  const user = await authenticate(request, env)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: { since?: unknown; changes?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const since = typeof body.since === 'number' && Number.isFinite(body.since) ? body.since : 0
  const rawChanges = Array.isArray(body.changes) ? body.changes : []
  if (rawChanges.length > 5000) {
    return json({ error: 'Too many changes' }, 413)
  }

  const changes: Change[] = []
  for (const c of rawChanges) {
    if (!validChange(c)) return json({ error: 'Invalid change record' }, 400)
    changes.push(c as Change)
  }

  const now = Date.now()

  if (changes.length > 0) {
    // Snapshot prior values of versioned singleton documents before they are
    // overwritten, so the full edit history is retained in record_versions.
    const versioned = changes.filter((c) => VERSIONED_COLLECTIONS.has(c.collection))
    if (versioned.length > 0) {
      const selStmt = env.DB.prepare(
        `SELECT collection, scope, rec_id, data, updated_at, deleted
         FROM records WHERE user_id = ? AND collection = ? AND scope = ? AND rec_id = ?`,
      )
      const existing = await env.DB.batch<{
        collection: string
        scope: string
        rec_id: string
        data: string
        updated_at: number
        deleted: number
      }>(versioned.map((c) => selStmt.bind(user.id, c.collection, c.scope, c.recId)))

      const archiveStmt = env.DB.prepare(
        `INSERT INTO record_versions
           (user_id, collection, scope, rec_id, data, updated_at, deleted, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const archiveBatch: ReturnType<typeof archiveStmt.bind>[] = []
      versioned.forEach((c, i) => {
        const row = existing[i]?.results?.[0]
        // Only archive when the incoming change actually wins (same guard as the
        // upsert below), so we snapshot the exact value being replaced.
        if (row && c.updatedAt > row.updated_at) {
          archiveBatch.push(
            archiveStmt.bind(
              user.id,
              row.collection,
              row.scope,
              row.rec_id,
              row.data,
              row.updated_at,
              row.deleted,
              now,
            ),
          )
        }
      })
      if (archiveBatch.length > 0) await env.DB.batch(archiveBatch)
    }

    const stmt = env.DB.prepare(
      `INSERT INTO records (user_id, collection, scope, rec_id, data, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, collection, scope, rec_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
       WHERE excluded.updated_at > records.updated_at`,
    )
    const batch = changes.map((c) =>
      stmt.bind(
        user.id,
        c.collection,
        c.scope,
        c.recId,
        JSON.stringify(c.data ?? null),
        c.updatedAt,
        c.deleted ? 1 : 0,
      ),
    )
    await env.DB.batch(batch)
  }

  const rows = await env.DB.prepare(
    `SELECT collection, scope, rec_id, data, updated_at, deleted
     FROM records WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC`,
  )
    .bind(user.id, since)
    .all<{
      collection: string
      scope: string
      rec_id: string
      data: string
      updated_at: number
      deleted: number
    }>()

  const out: Change[] = (rows.results || []).map((r) => ({
    collection: r.collection,
    scope: r.scope,
    recId: r.rec_id,
    data: safeParse(r.data),
    updatedAt: r.updated_at,
    deleted: r.deleted === 1,
  }))

  return json({ now, changes: out })
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
