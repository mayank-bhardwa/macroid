import { create } from 'zustand'
import type {
  State,
  Plan,
  Targets,
  MacroEntry,
  DailyMeal,
  GroceryRow,
  GroceryUnit,
  RecentMeal,
  DayType,
  AuthUser,
  BodyLog,
  Routine,
  RoutineFolder,
  WorkoutSession,
} from '../types'
import { FALLBACK_PLAN, DEFAULT_RECENT_MEALS, validateAndRepairPlan, validateAndRepairState, ensureMealFiber, ensureGrocery } from '../lib/plan'
import { todayKey, isoWeekKey, monthKeyOf, addDays } from '../lib/dates'
import { defaultDayType, effectiveDayType, seedDay } from '../lib/daytype'
import { deriveCalories, targetsForType } from '../lib/macros'
import {
  recordsFromState,
  applyChanges,
  stableStringify,
  hashString,
  type Change,
} from './serialize'
import { LS, lsGet, lsSet, lsRemove } from './storage'
import {
  apiRegister,
  apiLogin,
  apiLogout,
  apiSync,
  type AuthResult,
} from '../lib/api'

type SyncMetaEntry = { hash: string; updatedAt: number; deleted: boolean }
type SyncMeta = Record<string, SyncMetaEntry>
type Cursors = { pull: number; push: number }

type Auth = {
  token: string
  user: AuthUser
  apiBase?: string
  autoSync: boolean
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline'

function emptyState(): State {
  return {
    targets: { ...FALLBACK_PLAN.targets },
    restTargets: FALLBACK_PLAN.restTargets ? { ...FALLBACK_PLAN.restTargets } : undefined,
    macroLogs: {},
    targetHistory: {},
    morningPrep: {},
    grocery: {},
    dayOverrides: {},
    recentMeals: [],
    bodyLogs: {},
    routines: {},
    routineFolders: {},
    workoutSessions: {},
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ---- module-level sync machinery (kept out of React state) ----
let syncMeta: SyncMeta = lsGet<SyncMeta>(LS.syncMeta, {})
let cursors: Cursors = lsGet<Cursors>(LS.cursors, { pull: 0, push: 0 })
let syncTimer: ReturnType<typeof setTimeout> | null = null

function persistSyncMeta() {
  lsSet(LS.syncMeta, syncMeta)
  lsSet(LS.cursors, cursors)
}

interface StoreShape {
  data: State
  plan: Plan
  customPlan: Plan | null
  auth: Auth | null
  syncStatus: SyncStatus
  syncMessage: string
  lastSyncAt: number | null

  // lifecycle
  init: () => void
  loadPlanForMonth: (monthKey: string) => Promise<void>

  // macros
  addMeal: (day: string, entry: Omit<MacroEntry, 'id'>) => MacroEntry
  // Log a meal estimated by an AI feature (photo/agent). Stamps source='ai' and
  // an optional confidence (0–1), and starts the entry unverified so the user
  // can review it. This is the integration point for any future agent.
  addAIMeal: (day: string, entry: Omit<MacroEntry, 'id' | 'source' | 'verified'>, confidence?: number) => MacroEntry
  // Mark an AI-estimated entry as reviewed/accepted by the user.
  verifyMeal: (day: string, id: string) => void
  deleteMeal: (day: string, id: string) => void

  // body tracking (one entry per day)
  logBody: (day: string, entry: Omit<BodyLog, 'day' | 'at'>) => void
  deleteBody: (day: string) => void

  // workout routines
  saveRoutine: (routine: Routine) => void
  deleteRoutine: (id: string) => void
  // routine groups/folders
  saveFolder: (folder: RoutineFolder) => void
  deleteFolder: (id: string) => void
  // workout sessions (performed from a routine)
  saveSession: (session: WorkoutSession) => void
  deleteSession: (id: string) => void

  // daily
  getDayMeals: (day: string) => DailyMeal[] | null
  togglePrepared: (day: string, mealId: string) => void
  toggleEaten: (day: string, mealId: string) => void
  togglePacked: (day: string, mealId: string) => void
  addCustomMeal: (day: string, m: { slot: string; time: string; text: string; p: number; c: number; f: number; fb: number; group: string }) => void
  swapDayTypeWith: (day: string, other: string) => void
  resetDayType: (day: string) => void

  // grocery — a single monthly shopping list keyed by month (YYYY-MM)
  getGroceries: (month: string) => GroceryRow[]
  addGroceryItem: (month: string, name: string, qty: number, unit: GroceryUnit) => void
  toggleGroceryItem: (month: string, id: string) => void
  deleteGroceryItem: (month: string, id: string) => void
  // Drop the stored list for a month so it re-seeds from the plan template.
  reseedGrocery: (month: string) => void

  // settings / plan
  setTargets: (t: Targets, which?: DayType, reseedToday?: boolean) => void
  setTargetsFrom: (t: Targets, startDay: string, which?: DayType) => void
  saveCustomPlan: (plan: Plan) => void
  reapplyDayMeals: (day: string) => void
  // Re-seed cached day schedules from `startDay` forward so freshly saved
  // defaults take effect from a chosen date. Earlier days are left untouched.
  applyDefaultsFrom: (startDay: string, scope: 'meals') => void
  resetEverything: () => void

  // data import/export
  exportState: () => string
  importState: (json: string) => void
  importPlan: (plan: unknown) => void

  // auth + sync
  register: (email: string, password: string, apiBase?: string) => Promise<void>
  login: (email: string, password: string, apiBase?: string) => Promise<void>
  logout: () => Promise<void>
  setAutoSync: (on: boolean) => void
  syncNow: () => Promise<void>
}

export const useStore = create<StoreShape>((set, get) => {
  // ---- internal helpers ----
  function activePlan(custom: Plan | null): Plan {
    return ensureGrocery(ensureMealFiber(custom ?? FALLBACK_PLAN))
  }

  function commit(mutator: (d: State) => void, opts: { sync?: boolean } = { sync: true }) {
    const data = clone(get().data)
    mutator(data)
    set({ data })
    lsSet(LS.data, data)
    refreshSyncMeta(data)
    if (opts.sync !== false) scheduleSync()
  }

  // Recompute sync sidecar from current state; assign updatedAt=now to changed
  // records and create tombstones for removed ones.
  function refreshSyncMeta(data: State) {
    const now = Date.now()
    const records = recordsFromState(data, get().customPlan)
    const seen = new Set<string>()
    for (const [key, rec] of records) {
      seen.add(key)
      const h = hashString(stableStringify(rec.data))
      const prev = syncMeta[key]
      if (!prev || prev.deleted || prev.hash !== h) {
        syncMeta[key] = { hash: h, updatedAt: now, deleted: false }
      }
    }
    for (const key of Object.keys(syncMeta)) {
      if (!seen.has(key) && !syncMeta[key].deleted) {
        syncMeta[key] = { hash: '', updatedAt: now, deleted: true }
      }
    }
    persistSyncMeta()
  }

  function scheduleSync() {
    const auth = get().auth
    if (!auth || !auth.autoSync) return
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      void doSync()
    }, 1500)
  }

  async function doSync(): Promise<void> {
    const auth = get().auth
    if (!auth) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      set({ syncStatus: 'offline', syncMessage: 'Offline — will sync when online' })
      return
    }
    set({ syncStatus: 'syncing', syncMessage: 'Syncing…' })
    try {
      const data = get().data
      const records = recordsFromState(data, get().customPlan)
      // Build outgoing changes: anything with updatedAt > push cursor.
      const outgoing: Change[] = []
      for (const [key, meta] of Object.entries(syncMeta)) {
        if (meta.updatedAt <= cursors.push) continue
        const [collection, scope, recId] = key.split('|')
        if (meta.deleted) {
          outgoing.push({ collection, scope, recId, data: null, updatedAt: meta.updatedAt, deleted: true })
        } else {
          const rec = records.get(key)
          if (rec) {
            outgoing.push({ collection, scope, recId, data: rec.data, updatedAt: meta.updatedAt, deleted: false })
          }
        }
      }

      const resp = await apiSync(
        auth.token,
        { since: cursors.pull, changes: outgoing },
        auth.apiBase,
      )

      // Apply incoming changes with LWW vs local sidecar.
      const incoming = resp.changes.filter((c) => {
        const key = `${c.collection}|${c.scope}|${c.recId}`
        const local = syncMeta[key]
        return !local || c.updatedAt > local.updatedAt
      })

      if (incoming.length > 0) {
        const { state: merged, plan: mergedPlan, planChanged } = applyChanges(
          get().data,
          incoming,
          get().customPlan,
        )
        set({ data: merged })
        lsSet(LS.data, merged)
        // Apply an incoming plan change to the active/custom plan + storage.
        if (planChanged) {
          set({ customPlan: mergedPlan, plan: activePlan(mergedPlan) })
          if (mergedPlan) lsSet(LS.plan, mergedPlan)
          else lsRemove(LS.plan)
        }
        // Update sidecar for applied records so they aren't re-pushed.
        for (const c of incoming) {
          const key = `${c.collection}|${c.scope}|${c.recId}`
          syncMeta[key] = {
            hash: c.deleted ? '' : hashString(stableStringify(c.data)),
            updatedAt: c.updatedAt,
            deleted: !!c.deleted,
          }
        }
      }

      cursors = { pull: resp.now, push: resp.now }
      persistSyncMeta()
      set({ syncStatus: 'ok', syncMessage: 'Synced', lastSyncAt: Date.now() })
    } catch (e) {
      set({ syncStatus: 'error', syncMessage: (e as Error).message || 'Sync failed' })
    }
  }

  // ---- initial state ----
  const storedPlan = lsGet<Plan | null>(LS.plan, null)
  // Migrate plans saved before per-meal fiber / the monthly grocery list existed.
  const customPlan = storedPlan ? ensureGrocery(ensureMealFiber(storedPlan)) : null
  if (customPlan && customPlan !== storedPlan) lsSet(LS.plan, customPlan)
  const persistedData = lsGet<State | null>(LS.data, null)
  const auth = lsGet<Auth | null>(LS.auth, null)
  const initialData = persistedData ?? emptyState()
  // Ensure dictionaries added in later versions exist on data loaded from an
  // older build (avoids undefined access in actions/serialization).
  if (!initialData.bodyLogs) initialData.bodyLogs = {}
  if (!initialData.grocery) initialData.grocery = {}
  if (!initialData.routines) initialData.routines = {}
  if (!initialData.routineFolders) initialData.routineFolders = {}
  if (!initialData.workoutSessions) initialData.workoutSessions = {}
  // Backfill fiber on the factory recent meals saved before fiber existed.
  if (persistedData && ensureRecentFiber(initialData)) {
    lsSet(LS.data, initialData)
  }

  return {
    data: initialData,
    plan: activePlan(customPlan),
    customPlan,
    auth,
    syncStatus: 'idle',
    syncMessage: '',
    lastSyncAt: null,

    init() {
      // One-time migration: re-grain macro logs from one record-per-day to one
      // record-per-entry so concurrent same-day edits on different devices stop
      // overwriting each other. refreshSyncMeta naturally tombstones the old
      // whole-day records and registers the new per-entry ones.
      const schema = lsGet<number>(LS.schema, 1)
      if (schema < 2) {
        refreshSyncMeta(get().data)
        lsSet(LS.schema, 2)
      }
      // Quick Add is now user-specific. Drop the factory-seeded recent meals so
      // only the user's own hand-logged meals remain (and cap to the last 10).
      if (schema < 3) {
        const factory = new Set(DEFAULT_RECENT_MEALS.map((r) => r.name.toLowerCase()))
        const d = get().data
        const filtered = d.recentMeals.filter((r) => !factory.has(r.name.toLowerCase())).slice(0, 10)
        if (filtered.length !== d.recentMeals.length) {
          const next = { ...d, recentMeals: filtered }
          set({ data: next })
          lsSet(LS.data, next)
          refreshSyncMeta(next)
        }
        lsSet(LS.schema, 3)
      }
      // First-run plan bootstrap + online sync.
      if (!get().customPlan) {
        void get().loadPlanForMonth(monthKeyOf())
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          if (get().auth?.autoSync) void doSync()
        })
      }
      if (get().auth) void doSync()
    },

    async loadPlanForMonth(month: string) {
      try {
        const res = await fetch(`/plans/${month}.json`, { cache: 'no-cache' })
        if (!res.ok) return
        const plan = (await res.json()) as Plan
        if (!plan || !plan.dailyMeals) return
        if (!get().customPlan) {
          set({ customPlan: plan, plan })
          lsSet(LS.plan, plan)
        }
      } catch {
        // Offline / missing — fallback plan already active.
      }
    },

    // ---------- MACROS ----------
    addMeal(day, entry) {
      const e: MacroEntry = { id: uid(), source: 'user', ...entry }
      commit((d) => {
        if (!d.macroLogs[day]) d.macroLogs[day] = []
        d.macroLogs[day].push(e)
        stampTargets(d, day, get().plan)
        // Quick Add reflects the user's own custom meals: only meals logged by
        // hand (Log a meal, or re-logged from Quick Add) feed it — not meals
        // eaten off the schedule. Keep the last 10.
        if (!entry.fromMeal) {
          const name = entry.name.trim()
          const rm: RecentMeal = {
            name,
            protein: entry.protein,
            carbs: entry.carbs,
            fats: entry.fats,
            fiber: entry.fiber,
            calories: entry.calories,
          }
          d.recentMeals = [rm, ...d.recentMeals.filter((r) => r.name.toLowerCase() !== name.toLowerCase())].slice(0, 10)
        }
      })
      return e
    },

    addAIMeal(day, entry, confidence) {
      const c =
        typeof confidence === 'number' && Number.isFinite(confidence)
          ? Math.min(1, Math.max(0, confidence))
          : entry.confidence
      // Estimated by AI → unverified until the user confirms it in the log.
      return get().addMeal(day, { ...entry, source: 'ai', confidence: c, verified: false })
    },

    verifyMeal(day, id) {
      commit((d) => {
        const e = d.macroLogs[day]?.find((m) => m.id === id)
        if (e && e.source === 'ai') e.verified = true
      })
    },

    deleteMeal(day, id) {
      commit((d) => {
        const list = d.macroLogs[day]
        if (!list) return
        d.macroLogs[day] = list.filter((m) => m.id !== id)
        if (d.macroLogs[day].length === 0) delete d.macroLogs[day]
        // If this entry came from a prepared meal, un-mark it eaten so it
        // returns to the Prepared meals list.
        if (id.startsWith('meal-')) {
          const mealId = id.slice('meal-'.length)
          const meal = d.morningPrep[day]?.find((m) => m.id === mealId)
          if (meal) meal.eaten = false
        }
      })
    },

    // ---------- BODY ----------
    logBody(day, entry) {
      // Drop empty/undefined numeric fields so a partial check-in stays clean,
      // and keep only finite positive values. One record per day (keyed by day).
      const clean: Omit<BodyLog, 'day' | 'at'> = {}
      const fields: (keyof Omit<BodyLog, 'day' | 'at' | 'note'>)[] = [
        'weight', 'bodyFat', 'waist', 'chest', 'hips', 'arms', 'thighs', 'neck',
      ]
      for (const f of fields) {
        const v = entry[f]
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) clean[f] = v
      }
      const note = entry.note?.trim()
      if (note) clean.note = note
      // Ignore a completely empty submission.
      if (Object.keys(clean).length === 0) return
      commit((d) => {
        d.bodyLogs[day] = { day, at: Date.now(), ...clean }
      })
    },

    deleteBody(day) {
      commit((d) => {
        delete d.bodyLogs[day]
      })
    },

    // ---------- WORKOUT ROUTINES ----------
    saveRoutine(routine) {
      commit((d) => {
        const now = Date.now()
        const existing = d.routines[routine.id]
        d.routines[routine.id] = {
          ...routine,
          createdAt: existing?.createdAt ?? routine.createdAt ?? now,
          updatedAt: now,
        }
      })
    },

    deleteRoutine(id) {
      commit((d) => {
        delete d.routines[id]
      })
    },

    saveFolder(folder) {
      commit((d) => {
        const now = Date.now()
        const existing = d.routineFolders[folder.id]
        d.routineFolders[folder.id] = {
          ...folder,
          createdAt: existing?.createdAt ?? folder.createdAt ?? now,
          updatedAt: now,
        }
      })
    },

    deleteFolder(id) {
      commit((d) => {
        delete d.routineFolders[id]
        // Orphaned routines drop back to ungrouped rather than vanishing.
        for (const r of Object.values(d.routines)) {
          if (r.folderId === id) {
            r.folderId = undefined
            r.updatedAt = Date.now()
          }
        }
      })
    },

    saveSession(session) {
      commit((d) => {
        d.workoutSessions[session.id] = session
      })
    },

    deleteSession(id) {
      commit((d) => {
        delete d.workoutSessions[id]
      })
    },

    // ---------- DAILY ----------
    getDayMeals(day) {
      const d = get().data
      const stored = d.morningPrep[day]
      if (stored) return stored
      // Seed today, yesterday (the 1-day catch-up window) and future days; older
      // un-logged past days stay empty so history isn't invented.
      if (day < addDays(todayKey(), -1)) return null
      return seedDay(day, get().plan, d.dayOverrides)
    },

    togglePrepared(day, mealId) {
      commit((d) => {
        ensureSeeded(d, day, get().plan)
        const meal = d.morningPrep[day]?.find((m) => m.id === mealId)
        if (!meal) return
        meal.done = !meal.done
      })
    },

    toggleEaten(day, mealId) {
      commit((d) => {
        ensureSeeded(d, day, get().plan)
        const meals = d.morningPrep[day]
        const meal = meals?.find((m) => m.id === mealId)
        if (!meal) return
        const macroId = `meal-${mealId}`
        if (!meal.eaten) {
          meal.eaten = true
          if (!d.macroLogs[day]) d.macroLogs[day] = []
          if (!d.macroLogs[day].some((m) => m.id === macroId)) {
            d.macroLogs[day].push({
              id: macroId,
              name: `${meal.slot}: ${meal.text}`,
              protein: meal.p,
              carbs: meal.c,
              fats: meal.f,
              fiber: meal.fb,
              fromMeal: true,
              tag: 'Daily',
              source: meal.source ?? 'plan',
              confidence: meal.confidence,
            })
          }
          stampTargets(d, day, get().plan)
        } else {
          meal.eaten = false
          if (d.macroLogs[day]) {
            d.macroLogs[day] = d.macroLogs[day].filter((m) => m.id !== macroId)
            if (d.macroLogs[day].length === 0) delete d.macroLogs[day]
          }
        }
      })
    },

    togglePacked(day, mealId) {
      commit((d) => {
        ensureSeeded(d, day, get().plan)
        const meal = d.morningPrep[day]?.find((m) => m.id === mealId)
        if (meal) meal.packed = !meal.packed
      })
    },

    addCustomMeal(day, m) {
      commit((d) => {
        ensureSeeded(d, day, get().plan)
        const id = `cust-${uid()}`
        d.morningPrep[day].push({
          id,
          slot: m.slot,
          group: m.group,
          time: m.time,
          text: m.text,
          p: m.p,
          c: m.c,
          f: m.f,
          fb: m.fb,
          done: true,
          packed: false,
          eaten: true,
          custom: true,
          source: 'user',
        })
        // Custom meals are cooked and eaten already — log macros immediately.
        if (!d.macroLogs[day]) d.macroLogs[day] = []
        d.macroLogs[day].push({
          id: `meal-${id}`,
          name: `${m.slot}: ${m.text}`,
          protein: m.p,
          carbs: m.c,
          fats: m.f,
          fiber: m.fb,
          fromMeal: true,
          tag: 'Custom',
          source: 'user',
        })
        stampTargets(d, day, get().plan)
      })
    },

    // Swap the day-type of `day` with that of another day (must be opposite
    // types). Both days get pinned overrides, are re-seeded, and any locked
    // target stamp is refreshed so the macro goals follow the new type.
    swapDayTypeWith(day, other) {
      if (day === other) return
      const d0 = get().data
      const plan = get().plan
      const a = effectiveDayType(day, d0.dayOverrides, plan.trainingDays).type
      const b = effectiveDayType(other, d0.dayOverrides, plan.trainingDays).type
      if (a === b) return // same type — nothing to swap
      commit((d) => {
        d.dayOverrides[day] = b
        d.dayOverrides[other] = a
        reseed(d, day, get().plan)
        reseed(d, other, get().plan)
        restampIfStamped(d, day, get().plan)
        restampIfStamped(d, other, get().plan)
      })
    },

    resetDayType(day) {
      commit((d) => {
        delete d.dayOverrides[day]
        reseed(d, day, get().plan)
        restampIfStamped(d, day, get().plan)
      })
    },

    // ---------- GROCERY ----------
    // One plain shopping list per month. When a month has no stored list it is
    // seeded from the plan's grocery template (the monthly quantities).
    getGroceries(month) {
      const stored = get().data.grocery[month]
      if (stored) return stored
      return seedGrocery(get().plan, month)
    },

    addGroceryItem(month, name, qty, unit) {
      const clean = name.trim()
      if (!clean) return
      commit((d) => {
        if (!d.grocery[month]) d.grocery[month] = seedGrocery(get().plan, month)
        d.grocery[month].push({ id: `cust-${uid()}`, name: clean, qty, unit, done: false })
      })
    },

    toggleGroceryItem(month, id) {
      commit((d) => {
        if (!d.grocery[month]) d.grocery[month] = seedGrocery(get().plan, month)
        const g = d.grocery[month].find((x) => x.id === id)
        if (g) g.done = !g.done
      })
    },

    deleteGroceryItem(month, id) {
      commit((d) => {
        if (!d.grocery[month]) d.grocery[month] = seedGrocery(get().plan, month)
        d.grocery[month] = d.grocery[month].filter((x) => x.id !== id)
      })
    },

    reseedGrocery(month) {
      commit((d) => {
        delete d.grocery[month]
      })
    },

    // ---------- SETTINGS / PLAN ----------
    setTargets(t, which = 'training', reseedToday = true) {
      commit((d) => {
        if (which === 'rest') d.restTargets = { ...t }
        else d.targets = { ...t }
        // Only restamp today if today is of the type being edited, so changing
        // training goals never overwrites a rest day's locked goal (or vice-versa).
        if (reseedToday) {
          const today = todayKey()
          const { type } = effectiveDayType(today, d.dayOverrides, get().plan.trainingDays)
          if (type === which) d.targetHistory[today] = { ...t }
        }
      })
      // Persist into custom plan too.
      const plan = clone(get().customPlan ?? FALLBACK_PLAN)
      if (which === 'rest') plan.restTargets = { ...t }
      else plan.targets = { ...t }
      get().saveCustomPlan(plan)
    },

    setTargetsFrom(t, startDay, which = 'training') {
      commit((d) => {
        const planDays = get().plan.trainingDays
        const old = which === 'rest' ? d.restTargets ?? d.targets : d.targets
        const today = todayKey()
        // Pin present/near-future days (of this type) before the start date to
        // the OLD goal so the change only takes effect from `startDay` onward.
        if (startDay > today) {
          for (let day = today; day < startDay; day = addDays(day, 1)) {
            const { type } = effectiveDayType(day, d.dayOverrides, planDays)
            if (type === which) d.targetHistory[day] = { ...old }
          }
        }
        // New goal becomes the live target for this type.
        if (which === 'rest') d.restTargets = { ...t }
        else d.targets = { ...t }
        // Drop stamps (of this type) on/after the start date so they re-resolve.
        for (const day of Object.keys(d.targetHistory)) {
          if (day < startDay) continue
          const { type } = effectiveDayType(day, d.dayOverrides, planDays)
          if (type === which) delete d.targetHistory[day]
        }
      })
      // Persist into custom plan too.
      const plan = clone(get().customPlan ?? FALLBACK_PLAN)
      if (which === 'rest') plan.restTargets = { ...t }
      else plan.targets = { ...t }
      get().saveCustomPlan(plan)
    },

    saveCustomPlan(plan) {
      set({ customPlan: plan, plan })
      lsSet(LS.plan, plan)
      // Plan is a synced document — record the change and push it.
      refreshSyncMeta(get().data)
      scheduleSync()
    },

    reapplyDayMeals(day) {
      commit((d) => {
        delete d.morningPrep[day]
      })
    },

    applyDefaultsFrom(startDay, scope) {
      commit((d) => {
        if (scope === 'meals') {
          // Date keys are YYYY-MM-DD — lexicographic compare matches chronology.
          for (const day of Object.keys(d.morningPrep)) {
            if (day >= startDay) delete d.morningPrep[day]
          }
        }
      })
    },

    resetEverything() {
      const fresh = emptyState()
      set({ data: fresh, customPlan: null, plan: FALLBACK_PLAN })
      lsSet(LS.data, fresh)
      lsRemove(LS.plan)
      refreshSyncMeta(fresh)
      void get().loadPlanForMonth(monthKeyOf())
      scheduleSync()
    },

    exportState() {
      return JSON.stringify(
        { version: 1, data: get().data, customPlan: get().customPlan },
        null,
        2,
      )
    },

    importState(json) {
      const parsed = JSON.parse(json) as { data?: unknown; customPlan?: unknown }
      if (!parsed.data) throw new Error('Invalid backup file')
      // Sanitize the untrusted file before it touches state — coerces numbers,
      // drops malformed entries, and never lets string macros corrupt totals.
      const { state: incoming } = validateAndRepairState(parsed.data)
      const merged = mergeState(get().data, incoming)
      set({ data: merged })
      lsSet(LS.data, merged)
      if (parsed.customPlan) {
        try {
          const { plan } = validateAndRepairPlan(parsed.customPlan)
          get().saveCustomPlan(plan)
        } catch {
          // Keep the restored data even if the embedded plan is unusable.
        }
      }
      refreshSyncMeta(merged)
      scheduleSync()
    },

    importPlan(raw) {
      const { plan } = validateAndRepairPlan(raw)
      get().saveCustomPlan(plan)
    },

    // ---------- AUTH + SYNC ----------
    async register(email, password, apiBase) {
      const res: AuthResult = await apiRegister(email, password, apiBase)
      setAuth(res, apiBase)
      await doSync()
    },

    async login(email, password, apiBase) {
      const res: AuthResult = await apiLogin(email, password, apiBase)
      setAuth(res, apiBase)
      await doSync()
    },

    async logout() {
      const auth = get().auth
      if (auth) await apiLogout(auth.token, auth.apiBase)
      set({ auth: null, syncStatus: 'idle', syncMessage: '' })
      lsRemove(LS.auth)
      // Reset cursors so a future login does a fresh pull.
      cursors = { pull: 0, push: 0 }
      // Reset sidecar timestamps so next login re-pushes local data.
      for (const k of Object.keys(syncMeta)) syncMeta[k].updatedAt = Date.now()
      persistSyncMeta()
    },

    setAutoSync(on) {
      const auth = get().auth
      if (!auth) return
      const next = { ...auth, autoSync: on }
      set({ auth: next })
      lsSet(LS.auth, next)
      if (on) void doSync()
    },

    async syncNow() {
      await doSync()
    },
  }

  // ---- closures that need set/get ----
  function setAuth(res: AuthResult, apiBase?: string) {
    const auth: Auth = { token: res.token, user: res.user, apiBase, autoSync: true }
    set({ auth })
    lsSet(LS.auth, auth)
  }
})

// ---- pure-ish helpers (module scope) ----
function ensureSeeded(d: State, day: string, plan: Plan) {
  if (!d.morningPrep[day]) d.morningPrep[day] = seedDay(day, plan, d.dayOverrides)
}

// Backfill fiber on factory recent meals that were saved before fiber existed.
// Matches by name against DEFAULT_RECENT_MEALS. Returns true if anything changed.
function ensureRecentFiber(d: State): boolean {
  let changed = false
  for (const r of d.recentMeals) {
    if (r.fiber == null) {
      const factory = DEFAULT_RECENT_MEALS.find(
        (f) => f.name.toLowerCase() === r.name.toLowerCase(),
      )
      if (factory) {
        r.fiber = factory.fiber
        changed = true
      }
    }
  }
  return changed
}

function reseed(d: State, day: string, plan: Plan) {
  d.morningPrep[day] = seedDay(day, plan, d.dayOverrides)
}

// Refresh a day's locked target stamp (if it has one) to match its current
// day-type — used after a type change so the macro goal follows the new type.
function restampIfStamped(d: State, day: string, plan: Plan) {
  if (d.targetHistory[day]) {
    const { type } = effectiveDayType(day, d.dayOverrides, plan.trainingDays)
    d.targetHistory[day] = { ...targetsForType(type, d.targets, d.restTargets) }
  }
}

// Seed a month's shopping list from the plan's grocery template. Template ids
// are positional (tpl-0, …) so the same month seeded on two devices matches.
function seedGrocery(plan: Plan, _month: string): GroceryRow[] {
  return (plan.grocery ?? []).map((it, i) => ({
    id: `tpl-${i}`,
    name: it.name,
    qty: it.qty,
    unit: it.unit,
    done: false,
  }))
}

// Stamp a day's target snapshot the first time it receives any entry. The
// snapshot is the goal resolved for the day's type (training vs rest) so the
// locked-in goal matches what the rings showed when the day was logged.
function stampTargets(d: State, day: string, plan: Plan) {
  if (!d.targetHistory[day]) {
    const { type } = effectiveDayType(day, d.dayOverrides, plan.trainingDays)
    d.targetHistory[day] = { ...targetsForType(type, d.targets, d.restTargets) }
  }
}

// Merge imported state into current (union of dictionaries; imported wins on conflict).
function mergeState(base: State, incoming: State): State {
  return {
    targets: incoming.targets ?? base.targets,
    restTargets: incoming.restTargets ?? base.restTargets,
    recentMeals: incoming.recentMeals?.length ? incoming.recentMeals : base.recentMeals,
    macroLogs: mergeMacroLogs(base.macroLogs, incoming.macroLogs),
    targetHistory: { ...base.targetHistory, ...incoming.targetHistory },
    morningPrep: { ...base.morningPrep, ...incoming.morningPrep },
    grocery: { ...base.grocery, ...incoming.grocery },
    dayOverrides: { ...base.dayOverrides, ...incoming.dayOverrides },
    bodyLogs: mergeBodyLogs(base.bodyLogs ?? {}, incoming.bodyLogs ?? {}),
    routines: { ...(base.routines ?? {}), ...(incoming.routines ?? {}) },
    routineFolders: { ...(base.routineFolders ?? {}), ...(incoming.routineFolders ?? {}) },
    workoutSessions: { ...(base.workoutSessions ?? {}), ...(incoming.workoutSessions ?? {}) },
  }
}

// Macro logs merge per ENTRY (not per day) so restoring a backup is additive:
// entries the current device has but the backup lacks are never dropped. On an
// id collision the incoming (explicitly restored) entry wins.
function mergeMacroLogs(
  base: Record<string, MacroEntry[]>,
  incoming: Record<string, MacroEntry[]>,
): Record<string, MacroEntry[]> {
  const out: Record<string, MacroEntry[]> = {}
  const days = new Set([...Object.keys(base), ...Object.keys(incoming)])
  for (const day of days) {
    const byId = new Map<string, MacroEntry>()
    for (const e of base[day] ?? []) byId.set(e.id, e)
    for (const e of incoming[day] ?? []) byId.set(e.id, e)
    const list = [...byId.values()]
    if (list.length) out[day] = list
  }
  return out
}

// Body check-ins are one-per-day; the newer check-in (higher `at`) wins so an
// older backup never clobbers a fresher measurement — true last-write-wins.
function mergeBodyLogs(
  base: Record<string, BodyLog>,
  incoming: Record<string, BodyLog>,
): Record<string, BodyLog> {
  const out: Record<string, BodyLog> = { ...base }
  for (const day of Object.keys(incoming)) {
    const cur = out[day]
    const inc = incoming[day]
    if (!cur || (inc.at ?? 0) >= (cur.at ?? 0)) out[day] = inc
  }
  return out
}

// Convenience selectors used across the app.
export function useToday() {
  return todayKey()
}
export function useCurrentWeek() {
  return isoWeekKey()
}
export function useCurrentMonth() {
  return monthKeyOf()
}

export { defaultDayType, effectiveDayType, deriveCalories }
