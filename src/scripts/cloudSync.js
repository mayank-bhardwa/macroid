// cloudSync.js — offline-first, per-record cloud sync against the Cloudflare
// Pages Functions + D1 backend.
//
// Design:
//   * localStorage remains the source of truth for rendering (offline-first).
//   * Every leaf record of `state` is flattened to { collection, scope, recId,
//     data }. A sidecar "sync meta" map tracks each record's content hash and
//     timestamps so we can detect per-record changes without instrumenting
//     every mutation — saveState() just calls scheduleSync().
//   * Sync is bidirectional last-write-wins: push locally-changed records,
//     pull anything the server changed since our cursor, merge by updatedAt.

const SESSION_KEY = "recomp-cloud-session-v1";
const META_KEY = "recomp-syncmeta-v1";

let cfg = {
  getState: () => ({}),
  persist: () => {},
  refresh: () => {},
  onStatus: () => {},
  onAuthChange: () => {},
};

let syncTimer = null;
let syncing = false;
let lastTs = 0;

/* ---------------- Session (token) storage ---------------- */

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  cfg.onAuthChange(session);
}

export function isLoggedIn() {
  const s = getSession();
  return !!(s && s.token && (!s.expiresAt || s.expiresAt > Date.now()));
}

function apiBase() {
  const s = getSession();
  // Same-origin by default; an explicit apiBase supports cross-origin dev.
  return (s && s.apiBase) || "";
}

function authHeaders() {
  const s = getSession();
  return s && s.token ? { Authorization: `Bearer ${s.token}` } : {};
}

/* ---------------- Sync meta (per-record bookkeeping) ---------------- */
// meta[key] = { h: contentHash, u: localUpdatedAt, p: pushedUpdatedAt, d: deleted }
// cursor    = server `now` from the last successful sync.

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.records ? parsed : { cursor: 0, records: {} };
  } catch {
    return { cursor: 0, records: {} };
  }
}

function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

// Monotonic millisecond clock so two edits in the same tick get distinct stamps.
function nextTs() {
  const now = Date.now();
  lastTs = now > lastTs ? now : lastTs + 1;
  return lastTs;
}

// Fast, stable string hash (FNV-1a) over a canonical JSON of the record value.
function hashData(data) {
  const str = stableStringify(data);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",")}}`;
}

function recKey(c) {
  return `${c.collection}|${c.scope}|${c.recId}`;
}

/* ---------------- State <-> records mapping ---------------- */

// Flatten the app state into a flat list of records.
function flattenState(state) {
  const out = [];
  const push = (collection, scope, recId, data) =>
    out.push({ collection, scope: scope || "", recId: String(recId), data });

  for (const [date, arr] of Object.entries(state.macroLogs || {}))
    (arr || []).forEach((e) => push("macroLog", date, e.id, e));

  for (const [date, n] of Object.entries(state.water || {}))
    push("water", date, date, { glasses: n });

  for (const [date, t] of Object.entries(state.targetHistory || {}))
    push("targetHistory", date, date, t);

  for (const [date, arr] of Object.entries(state.morningPrep || {}))
    (Array.isArray(arr) ? arr : []).forEach((m) => push("morningPrep", date, m.id, m));

  for (const [date, type] of Object.entries(state.dayOverrides || {}))
    push("dayOverride", date, date, { type });

  for (const [week, arr] of Object.entries(state.mealPrep || {}))
    (arr || []).forEach((t) => push("mealPrep", week, t.id, t));

  for (const [week, arr] of Object.entries(state.weeklyGroceries || {}))
    (arr || []).forEach((i) => push("weeklyGrocery", week, i.id, i));

  for (const [month, arr] of Object.entries(state.monthlyGroceries || {}))
    (arr || []).forEach((r, idx) => push("monthlyGrocery", month, r.item || String(idx), r));

  (state.recentMeals || []).forEach((m, idx) =>
    push("recentMeal", "", m.name || String(idx), { ...m, _order: idx })
  );

  push("meta", "", "targets", state.targets || {});
  return out;
}

// Apply one remote record onto the live state (mutating).
function applyRecordToState(state, rec) {
  const { collection, scope, recId, data, deleted } = rec;

  const upsertArray = (mapName, keyField, makeArr) => {
    const map = (state[mapName] = state[mapName] || {});
    let arr = map[scope];
    if (!Array.isArray(arr)) arr = map[scope] = [];
    const i = arr.findIndex((e) => String(e[keyField]) === recId);
    if (deleted) {
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) delete map[scope];
    } else if (i >= 0) {
      arr[i] = data;
    } else {
      arr.push(data);
    }
    if (makeArr) makeArr(arr);
  };

  switch (collection) {
    case "macroLog":
      upsertArray("macroLogs", "id");
      break;
    case "morningPrep":
      upsertArray("morningPrep", "id");
      break;
    case "mealPrep":
      upsertArray("mealPrep", "id");
      break;
    case "weeklyGrocery":
      upsertArray("weeklyGroceries", "id");
      break;
    case "monthlyGrocery":
      upsertArray("monthlyGroceries", "item");
      break;
    case "water": {
      state.water = state.water || {};
      if (deleted) delete state.water[scope];
      else state.water[scope] = data.glasses;
      break;
    }
    case "targetHistory": {
      state.targetHistory = state.targetHistory || {};
      if (deleted) delete state.targetHistory[scope];
      else state.targetHistory[scope] = data;
      break;
    }
    case "dayOverride": {
      state.dayOverrides = state.dayOverrides || {};
      if (deleted) delete state.dayOverrides[scope];
      else state.dayOverrides[scope] = data.type;
      break;
    }
    case "recentMeal": {
      state.recentMeals = state.recentMeals || [];
      const i = state.recentMeals.findIndex((m) => (m.name || "") === recId);
      if (deleted) {
        if (i >= 0) state.recentMeals.splice(i, 1);
      } else {
        const { _order, ...meal } = data;
        if (i >= 0) state.recentMeals[i] = meal;
        else state.recentMeals.push(meal);
      }
      break;
    }
    case "meta":
      if (recId === "targets" && !deleted) state.targets = data;
      break;
  }
}

/* ---------------- Change detection ---------------- */

// Compare the flattened state to the sync meta; bump timestamps for changed
// records and tombstone removed ones. Returns the meta (mutated) and the set of
// records that still need pushing.
function detectChanges(state, meta) {
  const flat = flattenState(state);
  const seen = new Set();

  for (const rec of flat) {
    const key = recKey(rec);
    seen.add(key);
    const h = hashData(rec.data);
    const m = meta.records[key];
    if (!m) {
      meta.records[key] = { h, u: nextTs(), p: 0, d: 0 };
    } else if (m.d || m.h !== h) {
      m.h = h;
      m.u = nextTs();
      m.d = 0;
    }
  }

  // Tombstone records that disappeared locally.
  for (const [key, m] of Object.entries(meta.records)) {
    if (!seen.has(key) && !m.d) {
      m.d = 1;
      m.u = nextTs();
    }
  }

  const dirty = [];
  for (const [key, m] of Object.entries(meta.records)) {
    if (m.u > (m.p || 0)) {
      const [collection, scope, recId] = splitKey(key);
      const rec = flat.find((r) => recKey(r) === key);
      dirty.push({
        collection,
        scope,
        recId,
        data: m.d ? null : rec ? rec.data : null,
        updatedAt: m.u,
        deleted: !!m.d,
      });
    }
  }
  return dirty;
}

function splitKey(key) {
  const i1 = key.indexOf("|");
  const i2 = key.indexOf("|", i1 + 1);
  return [key.slice(0, i1), key.slice(i1 + 1, i2), key.slice(i2 + 1)];
}

// Merge remote changes into state + meta (last-write-wins by updatedAt).
// Returns true if local state was modified.
function mergeRemote(state, meta, remote) {
  let changed = false;
  for (const rec of remote) {
    const key = recKey(rec);
    const m = meta.records[key];
    const localU = m ? m.u : 0;
    if (rec.updatedAt > localU) {
      applyRecordToState(state, rec);
      meta.records[key] = {
        h: rec.deleted ? "" : hashData(rec.data),
        u: rec.updatedAt,
        p: rec.updatedAt,
        d: rec.deleted ? 1 : 0,
      };
      changed = true;
    } else if (m && rec.updatedAt === localU) {
      // Same version already known — mark as synced.
      m.p = Math.max(m.p || 0, rec.updatedAt);
    }
  }
  return changed;
}

/* ---------------- Network ---------------- */

async function api(path, { method = "GET", body, auth = false } = {}) {
  const res = await fetch(`${apiBase()}/api${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? authHeaders() : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- Public API ---------------- */

export function configure(options) {
  cfg = { ...cfg, ...options };
}

export async function register(email, password, apiBaseOverride) {
  const base = apiBaseOverride || "";
  const data = await fetchAuth(base, "/auth/register", { email, password });
  setSession({ token: data.token, email: data.user.email, expiresAt: data.expiresAt, apiBase: base });
  return data.user;
}

export async function login(email, password, apiBaseOverride) {
  const base = apiBaseOverride || "";
  const data = await fetchAuth(base, "/auth/login", { email, password });
  setSession({ token: data.token, email: data.user.email, expiresAt: data.expiresAt, apiBase: base });
  return data.user;
}

// Auth calls can't use apiBase() yet (no session), so take an explicit base.
async function fetchAuth(base, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export async function logout() {
  try {
    if (isLoggedIn()) await api("/auth/logout", { method: "POST", auth: true });
  } catch {
    /* best effort */
  }
  setSession(null);
}

// Confirm a stored token is still valid; clears it if not.
export async function verifySession() {
  if (!isLoggedIn()) return false;
  try {
    await api("/auth/me", { auth: true });
    return true;
  } catch (err) {
    if (err.status === 401) setSession(null);
    return false;
  }
}

// Debounced background sync, safe to call on every saveState().
export function scheduleSync() {
  if (!isLoggedIn() || !navigator.onLine) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow({ silent: true });
  }, 1500);
}

// Full bidirectional sync. Used by the manual "Sync now" button and the
// debounced scheduler.
export async function syncNow({ silent = false } = {}) {
  if (!isLoggedIn()) {
    if (!silent) cfg.onStatus("Sign in to sync.", true);
    return;
  }
  if (syncing) return;
  if (!navigator.onLine) {
    if (!silent) cfg.onStatus("Offline — changes will sync when you reconnect.", true);
    return;
  }

  syncing = true;
  if (!silent) cfg.onStatus("Syncing…");

  try {
    const state = cfg.getState();
    const meta = loadMeta();

    const dirty = detectChanges(state, meta);
    const resp = await api("/sync", {
      method: "POST",
      auth: true,
      body: { since: meta.cursor || 0, changes: dirty },
    });

    // Mark pushed records as acknowledged.
    for (const c of dirty) {
      const m = meta.records[recKey(c)];
      if (m) m.p = Math.max(m.p || 0, c.updatedAt);
    }

    const changed = mergeRemote(state, meta, resp.changes || []);
    meta.cursor = resp.now;
    saveMeta(meta);

    if (changed) {
      cfg.persist();
      cfg.refresh();
    }

    if (!silent) cfg.onStatus(`Synced at ${new Date().toLocaleTimeString()}.`);
  } catch (err) {
    if (err.status === 401) {
      setSession(null);
      cfg.onStatus("Session expired — sign in again.", true);
    } else if (!silent) {
      cfg.onStatus(`Sync failed: ${err.message}`, true);
    }
  } finally {
    syncing = false;
  }
}

// Reset all local sync bookkeeping (e.g. after import or logout). Does not
// touch the app state itself.
export function resetMeta() {
  localStorage.removeItem(META_KEY);
}

// Auto-sync when the connection returns.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => scheduleSync());
}
