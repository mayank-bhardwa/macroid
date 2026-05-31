import {
  STORAGE_KEY,
  PLAN_KEY,
  SYNC_KEY,
  DEFAULT_PLAN_URL,
  DEFAULT_TRAINING_DAYS,
  defaultState,
  fallbackPlan,
  FACTORY_PLAN,
  FACTORY_TARGETS,
  WATER_GLASS_ML,
  WATER_GOAL_GLASSES,
  WATER_MAX_GLASSES,
  HISTORY_COUNTS,
  DAILY_FIELDS,
  WEEKLY_PREP_FIELDS,
  WEEKLY_GROCERY_FIELDS,
  MONTHLY_FIELDS,
} from "./constants.js";
import {
  getDateKey,
  ymd,
  addDays,
  getMonthKey,
  getMondayDateStr,
  getWeekKey,
  monShortYr,
  makeId,
  numberVal,
  entryCalories,
  parseQty,
  isStockLow,
  escapeHtml,
  tdText,
  tdNode,
  setControlsEnabled,
  setLockNote,
  setStatus,
  haptic,
  downloadJson,
} from "./utils.js";
import { els, adminEls } from "./dom.js";
import * as cloud from "./cloudSync.js";

// Trends / history view state.
let historyPeriod = "daily"; // daily | weekly | monthly | yearly
let historyMetric = "protein"; // protein | calories
let historyAnchor = new Date();


let plan = fallbackPlan;
let state = loadState();
let syncSettings = loadSyncSettings();
let deferredInstallPrompt = null;

// Which day-type template the Admin "Daily Meal Prep" editor is showing.
let adminDayType = "training";

init();

async function init() {
  setupInstallPrompt();

  plan = await loadActivePlan();
  applyPlanLabel();

  const today = getDateKey(new Date());
  els.macroDate.value = today;
  els.morningDate.value = today;
  els.monthlySelect.value = plan.monthKey || getMonthKey(new Date());

  // Default the Trends view anchor to today.
  historyAnchor = new Date();

  cloud.configure({
    getState: () => state,
    persist: saveStateNoSync,
    refresh: () => {
      ensureDailyRecords();
      ensureWeeklyRecords();
      ensureMonthlyRecord();
      renderAll();
    },
    onStatus: (msg, isError) => setStatus(els.syncStatus, msg, isError),
    onAuthChange: () => hydrateSyncUI(),
  });

  hydrateSyncUI();
  renderWeekOptions();
  ensureDailyRecords();
  ensureWeeklyRecords();
  ensureMonthlyRecord();

  bindEvents();
  renderAll();
  celebrationArmed = true;

  // Offline-first: the app is already usable from localStorage above. If a
  // cloud session exists, verify it and pull/push in the background.
  if (cloud.isLoggedIn()) {
    cloud.verifySession().then((ok) => {
      if (ok) cloud.syncNow({ silent: true });
    });
  }
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      els.tabs.forEach((t) => t.classList.remove("active"));
      els.panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
      if (tab.dataset.tab === "trends") renderHistory();
    });
  });

  if (els.historyPrev) {
    els.historyPrev.addEventListener("click", () => {
      shiftHistoryAnchor(-1);
      renderHistory();
    });
  }
  if (els.historyNext) {
    els.historyNext.addEventListener("click", () => {
      shiftHistoryAnchor(1);
      renderHistory();
    });
  }
  if (els.historyPeriodSeg) {
    els.historyPeriodSeg.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        historyPeriod = btn.dataset.period || "daily";
        historyAnchor = new Date();
        els.historyPeriodSeg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderHistory();
      });
    });
  }
  if (els.historyMetricSeg) {
    els.historyMetricSeg.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        historyMetric = btn.dataset.metric || "protein";
        els.historyMetricSeg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderHistory();
      });
    });
  }

  els.macroDate.addEventListener("change", () => {
    ensureDailyRecords();
    renderMacros();
  });

  if (els.macroPrev) els.macroPrev.addEventListener("click", () => stepMacroDate(-1));
  if (els.macroNext) els.macroNext.addEventListener("click", () => stepMacroDate(1));
  if (els.macroToday) els.macroToday.addEventListener("click", () => setMacroDate(getDateKey(new Date())));

  if (els.waterMinus) els.waterMinus.addEventListener("click", () => addWater(-1));
  if (els.waterPlus) els.waterPlus.addEventListener("click", () => addWater(1));
  if (els.trendRangeSeg) {
    els.trendRangeSeg.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        trendRange = Number(btn.dataset.range) || 7;
        els.trendRangeSeg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderTrends();
      });
    });
  }

  els.mealForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const dateKey = els.macroDate.value;
    if (!isEditableDate(dateKey)) return;
    const entry = {
      id: makeId(),
      name: els.mealName.value.trim(),
      protein: numberVal(els.mealProtein.value),
      carbs: numberVal(els.mealCarbs.value),
      fats: numberVal(els.mealFats.value),
    };
    const enteredCals = numberVal(els.mealCalories.value);
    if (enteredCals > 0) entry.calories = enteredCals;
    if (!entry.name) return;
    snapshotDayTarget(dateKey);
    if (!state.macroLogs[dateKey]) state.macroLogs[dateKey] = [];
    state.macroLogs[dateKey].push(entry);
    pushRecentMeal(entry);
    saveState();
    els.mealForm.reset();
    renderMacros();
    haptic(12);
    if (!celebrationToastShown) {
      toast(`Logged ${entry.name}`, {
        actionLabel: "Undo",
        onAction: () => {
          state.macroLogs[dateKey] = (state.macroLogs[dateKey] || []).filter((x) => x.id !== entry.id);
          saveState();
          renderMacros();
        },
      });
    }
  });

  els.morningDate.addEventListener("change", () => {
    ensureDailyRecords();
    renderDailyMeals();
  });

  if (els.morningPrev) els.morningPrev.addEventListener("click", () => stepMorningDate(-1));
  if (els.morningNext) els.morningNext.addEventListener("click", () => stepMorningDate(1));
  if (els.morningToday) els.morningToday.addEventListener("click", () => setMorningDate(getDateKey(new Date())));

  if (els.swapDayBtn) {
    els.swapDayBtn.addEventListener("click", swapDayType);
  }
  if (els.resetDayBtn) {
    els.resetDayBtn.addEventListener("click", resetDayType);
  }

  els.morningTaskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const dateKey = els.morningDate.value;
    if (!isEditableDate(dateKey)) return;
    const text = els.morningTaskInput.value.trim();
    if (!text) return;
    const group = els.mealGroupSelect ? els.mealGroupSelect.value : "Morning";
    state.morningPrep[dateKey].push({ id: makeId(), slot: "Custom", group, text, done: false });
    saveState();
    els.morningTaskForm.reset();
    renderDailyMeals();
  });

  els.mealPrepWeek.addEventListener("change", () => {
    ensureWeeklyRecords();
    renderMealPrep();
  });

  els.mealPrepTaskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = els.mealPrepWeek.value;
    if (!isEditableWeekKey(key)) return;
    const text = els.mealPrepTaskInput.value.trim();
    if (!text) return;
    state.mealPrep[key].push({ id: makeId(), text, done: false });
    saveState();
    els.mealPrepTaskForm.reset();
    renderMealPrep();
  });

  els.weeklySelect.addEventListener("change", () => {
    ensureWeeklyRecords();
    renderWeeklyGrocery();
  });

  els.weeklyItemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const wk = els.weeklySelect.value;
    if (!isEditableWeekKey(wk)) return;
    const name = els.weeklyItemName.value.trim();
    const qty = els.weeklyItemQty.value.trim();
    if (!name || !qty) return;
    state.weeklyGroceries[wk].push({ id: makeId(), name, qty, done: false });
    saveState();
    els.weeklyItemForm.reset();
    renderWeeklyGrocery();
  });

  els.monthlySelect.addEventListener("change", () => {
    ensureMonthlyRecord();
    renderMonthly();
  });

  if (els.exportBtn) els.exportBtn.addEventListener("click", exportData);
  if (els.importInput) els.importInput.addEventListener("change", importData);

  if (els.exportBtn2) els.exportBtn2.addEventListener("click", exportData);
  if (els.importInput2) els.importInput2.addEventListener("change", importData);

  if (els.installBtn) {
    els.installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      hideInstallBanner();
    });
  }

  if (els.installDismiss) {
    els.installDismiss.addEventListener("click", () => {
      localStorage.setItem("recomp-install-dismissed", "1");
      hideInstallBanner();
    });
  }

  if (els.installBtn2) {
    els.installBtn2.addEventListener("click", triggerInstall);
  }

  els.planInput.addEventListener("change", importPlan);
  els.downloadPlanTemplateBtn.addEventListener("click", downloadPlanTemplate);

  if (els.signInBtn) els.signInBtn.addEventListener("click", () => doAuth("login"));
  if (els.registerBtn) els.registerBtn.addEventListener("click", () => doAuth("register"));
  if (els.syncNowBtn) els.syncNowBtn.addEventListener("click", () => cloud.syncNow());
  if (els.signOutBtn)
    els.signOutBtn.addEventListener("click", async () => {
      await cloud.logout();
      setStatus(els.syncStatus, "Signed out on this device.");
    });
  if (els.autoSyncToggle)
    els.autoSyncToggle.addEventListener("change", () => {
      syncSettings.autoSync = els.autoSyncToggle.checked;
      saveSyncSettings();
      if (syncSettings.autoSync) cloud.scheduleSync();
    });

  bindAdminEvents();
}

// Sign in or create an account, then run an initial sync.
async function doAuth(mode) {
  const email = (els.authEmail && els.authEmail.value.trim()) || "";
  const password = (els.authPassword && els.authPassword.value) || "";
  const apiBase = (els.apiBaseInput && els.apiBaseInput.value.trim()) || "";
  if (!email || !password) {
    setStatus(els.syncStatus, "Enter email and password.", true);
    return;
  }
  setStatus(els.syncStatus, mode === "register" ? "Creating account…" : "Signing in…");
  try {
    if (mode === "register") await cloud.register(email, password, apiBase);
    else await cloud.login(email, password, apiBase);
    if (els.authPassword) els.authPassword.value = "";
    await cloud.syncNow();
  } catch (err) {
    setStatus(els.syncStatus, err.message, true);
  }
}

function renderAll() {
  renderMacros();
  renderDailyMeals();
  renderMealPrep();
  renderWeeklyGrocery();
  renderMonthly();
  renderHistory();
}

function applyPlanLabel() {
  if (els.activePlanLabel) els.activePlanLabel.textContent = plan.label || "Custom plan";
}

function hydrateSyncUI() {
  const session = cloud.getSession();
  const loggedIn = cloud.isLoggedIn();
  if (els.cloudSignedIn) els.cloudSignedIn.hidden = !loggedIn;
  if (els.cloudSignedOut) els.cloudSignedOut.hidden = loggedIn;
  if (els.signedInEmail) els.signedInEmail.textContent = session ? session.email : "";
  if (els.autoSyncToggle) els.autoSyncToggle.checked = !!syncSettings.autoSync;
}


function renderMacros() {
  const dateKey = els.macroDate.value;
  const entries = state.macroLogs[dateKey] || [];

  const editable = setLockNote(
    els.macroLockNote,
    isEditableDate(dateKey),
    dateKey,
    getDateKey(new Date()),
    "day"
  );
  setControlsEnabled(els.mealForm, editable);

  const totals = entries.reduce(
    (acc, e) => {
      acc.protein += e.protein;
      acc.carbs += e.carbs;
      acc.fats += e.fats;
      acc.calories += entryCalories(e);
      return acc;
    },
    { protein: 0, carbs: 0, fats: 0, calories: 0 }
  );

  const dayTargets = effectiveTargets(dateKey);

  setRing(els.proteinRing, els.proteinValue, els.proteinMetric, totals.protein, dayTargets.protein, "g");
  setRing(els.carbRing, els.carbValue, els.carbMetric, totals.carbs, dayTargets.carbs, "g");
  setRing(els.fatRing, els.fatValue, els.fatMetric, totals.fats, dayTargets.fats, "g");
  setRing(els.calorieRing, els.calorieValue, els.calorieMetric, totals.calories, dayTargets.calories, " kcal");

  renderRecentMeals(editable);
  renderWater(dateKey, editable);
  renderTrends();
  updateDateStepperUI(els.macroToday, dateKey);
  celebrateGoals(dateKey, totals);

  els.mealEntries.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No meals logged for this date yet.";
    els.mealEntries.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "entry";
    if (entry.fromMeal) row.classList.add("from-meal");

    const left = document.createElement("div");
    const tag = entry.fromMeal ? ` <span class="entry-tag">Daily</span>` : "";
    left.innerHTML = `<strong>${escapeHtml(entry.name)}</strong>${tag}<div class="meta">P ${entry.protein}g | C ${entry.carbs}g | F ${entry.fats}g | ${Math.round(entryCalories(entry))} kcal</div>`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "link-btn";
    removeBtn.textContent = "Delete";
    removeBtn.disabled = !editable;
    removeBtn.addEventListener("click", () => {
      if (!isEditableDate(dateKey)) return;
      state.macroLogs[dateKey] = entries.filter((e) => e.id !== entry.id);
      if (entry.fromMeal) {
        const mealId = entry.id.replace(/^meal-/, "");
        const meal = (state.morningPrep[dateKey] || []).find((m) => m.id === mealId);
        if (meal) meal.done = false;
      }
      saveState();
      renderMacros();
      renderDailyMeals();
    });

    row.append(left, removeBtn);
    els.mealEntries.appendChild(row);
  });
}

function setRing(ringEl, valueEl, subEl, current, target, unit) {
  const cur = Math.round(current);
  const tgt = Math.round(target);
  if (valueEl) valueEl.textContent = cur;
  if (subEl) {
    let rem = "";
    if (target > 0) {
      const remaining = tgt - cur;
      if (remaining > 0) rem = ` <span class="ring-remaining">${remaining} left</span>`;
      else if (remaining < 0) rem = ` <span class="ring-remaining over">${-remaining} over</span>`;
      else rem = ` <span class="ring-remaining met">goal met</span>`;
    }
    subEl.innerHTML = `/ ${tgt}${unit}${rem}`;
  }
  if (!ringEl) return;
  const r = parseFloat(ringEl.getAttribute("r")) || 0;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(current / target, 1) : 0;
  ringEl.style.strokeDasharray = `${circ}`;
  ringEl.style.strokeDashoffset = `${circ * (1 - pct)}`;
  const over = target > 0 && current > target * 1.05;
  const met = target > 0 && current >= target * 0.97 && !over;
  const close = target > 0 && current >= target * 0.8 && !met && !over;
  ringEl.classList.toggle("over", over);
  ringEl.classList.toggle("met", met);
  ringEl.classList.toggle("close", close);
}

function renderWater(dateKey, editable) {
  if (!els.waterTrack) return;
  const glasses = (state.water && state.water[dateKey]) || 0;
  if (els.waterCount) els.waterCount.textContent = `${glasses} / ${WATER_GOAL_GLASSES} glasses`;
  if (els.waterMl) {
    els.waterMl.textContent = `${glasses * WATER_GLASS_ML} ml / ${WATER_GOAL_GLASSES * WATER_GLASS_ML} ml`;
  }
  const pipCount = Math.max(WATER_GOAL_GLASSES, glasses);
  els.waterTrack.innerHTML = "";
  for (let i = 0; i < pipCount; i++) {
    const pip = document.createElement("span");
    pip.className = "water-pip";
    if (i < glasses) pip.classList.add("filled");
    if (i >= WATER_GOAL_GLASSES) pip.classList.add("extra");
    els.waterTrack.appendChild(pip);
  }
  if (els.waterMinus) els.waterMinus.disabled = !editable || glasses <= 0;
  if (els.waterPlus) els.waterPlus.disabled = !editable || glasses >= WATER_MAX_GLASSES;
}

function addWater(delta) {
  const dateKey = els.macroDate.value;
  if (!isEditableDate(dateKey)) return;
  if (!state.water) state.water = {};
  const next = Math.min(WATER_MAX_GLASSES, Math.max(0, ((state.water[dateKey] || 0) + delta)));
  if (next === 0) delete state.water[dateKey];
  else state.water[dateKey] = next;
  saveState();
  renderWater(dateKey, true);
  haptic(8);
}

// ---- Trends (rolling protein & calorie history) ----
let trendRange = 7;

function renderTrends() {
  if (!els.trendChart) return;
  const days = [];
  const today = new Date(getDateKey(new Date()) + "T00:00:00");
  for (let i = trendRange - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    const totals = dayMacroTotals(key);
    const tgt = effectiveTargets(key);
    days.push({ key, date: d, totals, target: tgt });
  }

  const logged = days.filter((d) => d.totals.count > 0);
  const avgProtein = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.totals.protein, 0) / logged.length)
    : 0;
  const avgCalories = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.totals.calories, 0) / logged.length)
    : 0;
  const proteinHits = logged.filter((d) => d.target.protein > 0 && d.totals.protein >= d.target.protein * 0.97).length;

  if (els.trendStats) {
    els.trendStats.innerHTML = logged.length
      ? `
        <div class="trend-stat"><span class="trend-stat-val">${avgProtein}g</span><span class="trend-stat-lbl">avg protein</span></div>
        <div class="trend-stat"><span class="trend-stat-val">${proteinHits}/${logged.length}</span><span class="trend-stat-lbl">goal days hit</span></div>
        <div class="trend-stat"><span class="trend-stat-val">${avgCalories}</span><span class="trend-stat-lbl">avg kcal</span></div>
      `
      : `<p class="hint">Log a few days to see your protein and calorie trends here.</p>`;
  }

  // Goal line sits at 100% within a 0-120% range, so over-goal bars rise above it.
  const MAX_PCT = 1.2;
  const goalLineBottom = (1 / MAX_PCT) * 100;
  const showLabels = trendRange <= 7;
  const weekday = ["S", "M", "T", "W", "T", "F", "S"];

  const bars = days
    .map((d) => {
      const tgt = d.target.protein || 0;
      const pct = tgt > 0 ? d.totals.protein / tgt : 0;
      const height = Math.min(pct, MAX_PCT) / MAX_PCT * 100;
      let cls = "empty";
      if (d.totals.count > 0) {
        if (pct >= 1.05) cls = "over";
        else if (pct >= 0.97) cls = "met";
        else if (pct >= 0.8) cls = "close";
        else cls = "under";
      }
      const title = d.totals.count > 0
        ? `${d.key}: ${Math.round(d.totals.protein)}g / ${Math.round(tgt)}g protein`
        : `${d.key}: no log`;
      const label = showLabels ? `<span class="trend-bar-lbl">${weekday[d.date.getDay()]}</span>` : "";
      return `<div class="trend-bar-wrap" title="${title}"><div class="trend-bar-col"><div class="trend-bar ${cls}" style="height:${height}%"></div></div>${label}</div>`;
    })
    .join("");

  els.trendChart.innerHTML = `
    <div class="trend-goalline" style="bottom:${goalLineBottom}%"></div>
    <div class="trend-bars">${bars}</div>
  `;
}

// ---- Interaction helpers (feedback, quick-add, date stepping) ----

let toastTimer = null;
function toast(message, { actionLabel, onAction, duration = 3400 } = {}) {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  host.innerHTML = "";
  const el = document.createElement("div");
  el.className = "toast";
  const msg = document.createElement("span");
  msg.className = "toast-msg";
  msg.textContent = message;
  el.appendChild(msg);
  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      clearTimeout(toastTimer);
      onAction();
      el.classList.remove("show");
      setTimeout(() => el.remove(), 200);
    });
    el.appendChild(btn);
  }
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 220);
  }, duration);
}

function pushRecentMeal(meal) {
  const name = (meal.name || "").trim();
  if (!name) return;
  state.recentMeals = (state.recentMeals || []).filter(
    (m) => m.name.toLowerCase() !== name.toLowerCase()
  );
  const recent = {
    name,
    protein: meal.protein,
    carbs: meal.carbs,
    fats: meal.fats,
  };
  if (Number.isFinite(meal.calories) && meal.calories > 0) recent.calories = meal.calories;
  state.recentMeals.unshift(recent);
  state.recentMeals = state.recentMeals.slice(0, 12);
}

function renderRecentMeals(editable) {
  const host = els.recentMeals;
  if (!host) return;
  host.innerHTML = "";
  const recents = (state.recentMeals || []).slice(0, 8);
  const show = recents.length > 0 && editable;
  host.hidden = !show;
  if (els.quickAddHead) els.quickAddHead.hidden = !show;
  if (!show) return;
  recents.forEach((r) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "quick-chip";
    chip.title = `Add ${r.name} \u00b7 P${r.protein} C${r.carbs} F${r.fats}`;
    const name = document.createElement("span");
    name.className = "quick-name";
    name.textContent = r.name;
    const macro = document.createElement("span");
    macro.className = "quick-macro";
    macro.textContent = `${r.protein}P`;
    chip.append(name, macro);
    chip.addEventListener("click", () => quickAddMeal(r));
    host.appendChild(chip);
  });
}

function quickAddMeal(r) {
  const dateKey = els.macroDate.value;
  if (!isEditableDate(dateKey)) return;
  const entry = {
    id: makeId(),
    name: r.name,
    protein: r.protein,
    carbs: r.carbs,
    fats: r.fats,
  };
  if (Number.isFinite(r.calories) && r.calories > 0) entry.calories = r.calories;
  if (!state.macroLogs[dateKey]) state.macroLogs[dateKey] = [];
  snapshotDayTarget(dateKey);
  state.macroLogs[dateKey].push(entry);
  pushRecentMeal(r);
  saveState();
  renderMacros();
  haptic(12);
  if (!celebrationToastShown) {
    toast(`Added ${r.name}`, {
      actionLabel: "Undo",
      onAction: () => {
        state.macroLogs[dateKey] = (state.macroLogs[dateKey] || []).filter((x) => x.id !== entry.id);
        saveState();
        renderMacros();
      },
    });
  }
}

function setMacroDate(dateKey) {
  els.macroDate.value = dateKey;
  ensureDailyRecords();
  renderMacros();
  haptic(8);
}

function stepMacroDate(n) {
  setMacroDate(addDays(els.macroDate.value, n));
}

function setMorningDate(dateKey) {
  els.morningDate.value = dateKey;
  ensureDailyRecords();
  renderDailyMeals();
  haptic(8);
}

function stepMorningDate(n) {
  setMorningDate(addDays(els.morningDate.value, n));
}

function updateDateStepperUI(todayBtn, dateKey) {
  if (!todayBtn) return;
  todayBtn.hidden = dateKey === getDateKey(new Date());
}

const goalCelebrated = {};
let celebrationToastShown = false;
let celebrationArmed = false;
function celebrateGoals(dateKey, totals) {
  celebrationToastShown = false;
  const dayTargets = effectiveTargets(dateKey);
  const checks = [
    { key: "protein", ring: els.proteinRing, current: totals.protein, target: dayTargets.protein, label: "Protein goal hit \ud83d\udcaa" },
    { key: "calories", ring: els.calorieRing, current: totals.calories, target: dayTargets.calories, label: "Calorie target reached \ud83c\udf89" },
  ];
  checks.forEach(({ key, ring, current, target, label }) => {
    const stamp = `${dateKey}:${key}`;
    const met = target > 0 && current >= target * 0.97;
    if (met && goalCelebrated[stamp] !== true) {
      goalCelebrated[stamp] = true;
      if (!celebrationArmed) return;
      if (ring) {
        ring.classList.remove("pop");
        void ring.getBoundingClientRect();
        ring.classList.add("pop");
      }
      // Only fanfare on a fresh, in-session achievement for the active day.
      if (dateKey === getDateKey(new Date())) {
        haptic([18, 40, 18]);
        toast(label);
        celebrationToastShown = true;
      }
    } else if (!met) {
      goalCelebrated[stamp] = false;
    }
  });
}

function renderDailyMeals() {
  const dateKey = els.morningDate.value;
  const meals = state.morningPrep[dateKey] || [];

  const editable = setLockNote(
    els.dailyLockNote,
    isEditableDate(dateKey),
    dateKey,
    getDateKey(new Date()),
    "day"
  );
  setControlsEnabled(els.morningTaskForm, editable);

  // Past day that was never logged: show a blank "no record" state instead of
  // seeding the current template.
  const noRecord = isPastDate(dateKey) && !Array.isArray(state.morningPrep[dateKey]);
  if (noRecord) {
    if (els.dayTypeBadge) {
      els.dayTypeBadge.textContent = "No record for this day";
      els.dayTypeBadge.classList.remove("rest");
    }
    if (els.swapDayBtn) els.swapDayBtn.hidden = true;
    if (els.resetDayBtn) els.resetDayBtn.hidden = true;
    if (els.mealsMorning) {
      els.mealsMorning.innerHTML =
        '<p class="hint">No meal prep was recorded for this day.</p>';
    }
    if (els.mealsEvening) els.mealsEvening.innerHTML = "";
    updateDateStepperUI(els.morningToday, dateKey);
    return;
  }

  const rest = isRestDay(dateKey);
  if (els.dayTypeBadge) {
    const overridden = state.dayOverrides && state.dayOverrides[dateKey];
    els.dayTypeBadge.textContent =
      (rest ? "Rest day (lighter carbs)" : "Training day") + (overridden ? " · swapped" : "");
    els.dayTypeBadge.classList.toggle("rest", rest);
  }
  if (els.swapDayBtn) {
    const target = findNextOppositeDay(dateKey);
    if (target) {
      const targetName = new Date(`${target}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
      });
      els.swapDayBtn.textContent = rest
        ? `Bring workout here from ${targetName}`
        : `Move workout to ${targetName}`;
      els.swapDayBtn.hidden = false;
      els.swapDayBtn.disabled = !editable;
    } else {
      els.swapDayBtn.hidden = true;
    }
  }
  if (els.resetDayBtn) {
    const overridden = !!(state.dayOverrides && state.dayOverrides[dateKey]);
    els.resetDayBtn.hidden = !overridden;
    els.resetDayBtn.disabled = !editable;
  }

  renderMealGroup(els.mealsMorning, meals, "Morning", dateKey, editable);
  renderMealGroup(els.mealsEvening, meals, "Evening", dateKey, editable);
  updateDateStepperUI(els.morningToday, dateKey);
}

function syncMealToMacros(meal, dateKey, done) {
  if (!state.macroLogs[dateKey]) state.macroLogs[dateKey] = [];
  const logId = `meal-${meal.id}`;
  const without = state.macroLogs[dateKey].filter((e) => e.id !== logId);
  if (done) {
    snapshotDayTarget(dateKey);
    without.push({
      id: logId,
      name: meal.slot || "Meal",
      protein: Number(meal.p) || 0,
      carbs: Number(meal.c) || 0,
      fats: Number(meal.f) || 0,
      fromMeal: true,
    });
  }
  state.macroLogs[dateKey] = without;
}

function renderMealGroup(container, meals, group, dateKey, editable = true) {
  if (!container) return;
  container.innerHTML = "";

  const items = meals.filter((m) => (m.group || "Morning") === group);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No meals here yet.";
    container.appendChild(empty);
    return;
  }

  items.forEach((meal) => {
    const row = document.createElement("div");
    row.className = "meal-row";
    if (meal.done) row.classList.add("done");
    if (meal.packed) row.classList.add("packed");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "meal-check";
    check.checked = !!meal.done;
    check.disabled = !editable;
    check.title = "Mark as eaten (logs to macros)";
    check.setAttribute("aria-label", "Mark as eaten");
    check.addEventListener("change", () => {
      if (!isEditableDate(dateKey)) return;
      const target = state.morningPrep[dateKey].find((m) => m.id === meal.id);
      if (target) {
        target.done = check.checked;
        syncMealToMacros(target, dateKey, check.checked);
      }
      saveState();
      renderDailyMeals();
      renderMacros();
      haptic(check.checked ? 14 : 8);
      if (check.checked) toast(`Eaten: ${meal.slot || "meal"} logged to macros`);
    });

    const body = document.createElement("div");
    body.className = "meal-body";

    const head = document.createElement("div");
    head.className = "meal-head";
    const slot = document.createElement("span");
    slot.className = "meal-slot";
    slot.textContent = meal.slot || "Meal";
    head.appendChild(slot);
    if (meal.time) {
      const time = document.createElement("span");
      time.className = "meal-time";
      time.textContent = meal.time;
      head.appendChild(time);
    }

    const desc = document.createElement("p");
    desc.className = "meal-desc";
    desc.textContent = meal.text;

    body.appendChild(head);
    body.appendChild(desc);

    const actions = document.createElement("div");
    actions.className = "meal-actions";

    const packChip = document.createElement("button");
    packChip.type = "button";
    packChip.className = "pack-chip";
    if (meal.packed) packChip.classList.add("is-packed");
    packChip.textContent = meal.packed ? "Packed ✓" : "Pack";
    packChip.title = "Mark as packed (does not log macros)";
    packChip.disabled = !editable;
    packChip.addEventListener("click", () => {
      if (!isEditableDate(dateKey)) return;
      const target = state.morningPrep[dateKey].find((m) => m.id === meal.id);
      if (target) target.packed = !target.packed;
      saveState();
      renderDailyMeals();
      haptic(8);
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "link-btn meal-del";
    del.textContent = "Delete";
    del.disabled = !editable;
    del.addEventListener("click", () => {
      if (!isEditableDate(dateKey)) return;
      state.morningPrep[dateKey] = state.morningPrep[dateKey].filter((m) => m.id !== meal.id);
      saveState();
      renderDailyMeals();
    });

    actions.appendChild(packChip);
    actions.appendChild(del);

    row.appendChild(check);
    row.appendChild(body);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function isRestDay(dateKey) {
  const ov = state.dayOverrides ? state.dayOverrides[dateKey] : null;
  if (ov === "rest") return true;
  if (ov === "training") return false;
  const d = new Date(`${dateKey}T00:00:00`);
  return !DEFAULT_TRAINING_DAYS.includes(d.getDay()); // default: Tue/Wed/Fri/Sat train
}

function renderMealPrep() {
  const key = els.mealPrepWeek.value;
  const tasks = state.mealPrep[key] || [];
  const editable = setLockNote(
    els.mealPrepLockNote,
    isEditableWeekKey(key),
    key,
    getWeekKey(new Date()),
    "week"
  );
  setControlsEnabled(els.mealPrepTaskForm, editable);
  renderChecklist({
    container: els.mealPrepChecklist,
    items: tasks,
    editable,
    onToggle: (id, done) => {
      const task = state.mealPrep[key].find((t) => t.id === id);
      if (task) task.done = done;
      saveState();
      renderMealPrep();
    },
    onDelete: (id) => {
      state.mealPrep[key] = tasks.filter((t) => t.id !== id);
      saveState();
      renderMealPrep();
    },
  });
}

function renderWeeklyGrocery() {
  const key = els.weeklySelect.value;
  const items = state.weeklyGroceries[key] || [];
  const editable = setLockNote(
    els.weeklyLockNote,
    isEditableWeekKey(key),
    key,
    getWeekKey(new Date()),
    "week"
  );
  setControlsEnabled(els.weeklyItemForm, editable);
  renderChecklist({
    container: els.weeklyGroceryList,
    items,
    showQty: true,
    editable,
    onToggle: (id, done) => {
      const item = state.weeklyGroceries[key].find((i) => i.id === id);
      if (item) item.done = done;
      saveState();
      renderWeeklyGrocery();
    },
    onDelete: (id) => {
      state.weeklyGroceries[key] = items.filter((i) => i.id !== id);
      saveState();
      renderWeeklyGrocery();
    },
  });
}

function renderMonthly() {
  const monthKey = els.monthlySelect.value;
  const rows = state.monthlyGroceries[monthKey] || [];

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Item</th>
        <th>Min Buffer</th>
        <th>Reorder Below</th>
        <th>Monthly Need</th>
        <th>Current Stock</th>
        <th>Planned Buy</th>
        <th>Status</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");
  const lowItems = [];

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const low = isStockLow(row.currentStock, row.reorderBelow);
    if (low) {
      tr.classList.add("low");
      lowItems.push(row);
    }

    const stockInput = document.createElement("input");
    stockInput.value = row.currentStock || "";
    stockInput.placeholder = "e.g., 900 g";
    stockInput.addEventListener("change", () => {
      row.currentStock = stockInput.value.trim();
      saveState();
      renderMonthly();
    });

    const plannedInput = document.createElement("input");
    plannedInput.value = row.plannedBuy || "";
    plannedInput.placeholder = "e.g., 1 kg";
    plannedInput.addEventListener("change", () => {
      row.plannedBuy = plannedInput.value.trim();
      saveState();
    });

    const status = document.createElement("td");
    status.className = "stock-status";
    if (low) {
      status.innerHTML = `<span class="stock-flag low">● Reorder</span>`;
    } else if (parseQty(row.currentStock)) {
      status.innerHTML = `<span class="stock-flag ok">● OK</span>`;
    } else {
      status.innerHTML = `<span class="stock-flag none">—</span>`;
    }

    tr.append(
      tdText(row.item),
      tdText(row.minBuffer),
      tdText(row.reorderBelow),
      tdText(row.monthlyNeed),
      tdNode(stockInput),
      tdNode(plannedInput),
      status
    );

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  els.monthlyTableWrap.innerHTML = "";
  els.monthlyTableWrap.appendChild(table);

  renderRestockSummary(lowItems);
}

function renderRestockSummary(lowItems) {
  if (!els.restockSummary) return;
  els.restockSummary.innerHTML = "";

  if (!lowItems.length) {
    const ok = document.createElement("p");
    ok.className = "restock-ok";
    ok.textContent = "✓ All stocked above reorder levels.";
    els.restockSummary.appendChild(ok);
    return;
  }

  const title = document.createElement("p");
  title.className = "restock-title";
  title.textContent = `${lowItems.length} item${lowItems.length > 1 ? "s" : ""} ${
    lowItems.length > 1 ? "need" : "needs"
  } restock:`;

  const list = document.createElement("p");
  list.className = "restock-list";
  list.textContent = lowItems.map((r) => r.item).join(", ");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn restock-btn";
  btn.textContent = "Add low items to this week's grocery";
  btn.addEventListener("click", () => addLowItemsToGrocery(lowItems));

  els.restockSummary.append(title, list, btn);
}

function addLowItemsToGrocery(lowItems) {
  const key = els.weeklySelect.value;
  if (!key) return;
  if (!state.weeklyGroceries[key]) state.weeklyGroceries[key] = [];
  const existing = state.weeklyGroceries[key];

  let added = 0;
  lowItems.forEach((row) => {
    const already = existing.some((i) => (i.name || "").toLowerCase() === row.item.toLowerCase());
    if (!already) {
      existing.push({
        id: makeId(),
        name: row.item,
        qty: row.plannedBuy || row.monthlyNeed || "",
        done: false,
      });
      added += 1;
    }
  });

  saveState();
  renderWeeklyGrocery();

  if (els.restockSummary) {
    const note = document.createElement("p");
    note.className = "restock-ok";
    note.textContent = added
      ? `Added ${added} item${added > 1 ? "s" : ""} to the Weekly Grocery list above.`
      : "Those items are already on this week's grocery list.";
    els.restockSummary.appendChild(note);
  }
}

function dayMacroTotals(dateKey) {
  const entries = state.macroLogs[dateKey] || [];
  const totals = entries.reduce(
    (acc, e) => {
      acc.protein += Number(e.protein) || 0;
      acc.carbs += Number(e.carbs) || 0;
      acc.fats += Number(e.fats) || 0;
      acc.calories += entryCalories(e);
      return acc;
    },
    { protein: 0, carbs: 0, fats: 0, calories: 0 }
  );
  totals.count = entries.length;
  return totals;
}

function activateTab(name) {
  els.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  els.panels.forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
}

// ---- Trends / history view (daily / weekly / monthly / yearly) ----

function shiftHistoryAnchor(dir) {
  const a = new Date(historyAnchor);
  if (historyPeriod === "daily") a.setDate(a.getDate() + dir * HISTORY_COUNTS.daily);
  else if (historyPeriod === "weekly") a.setDate(a.getDate() + dir * 7 * HISTORY_COUNTS.weekly);
  else if (historyPeriod === "monthly") a.setMonth(a.getMonth() + dir * HISTORY_COUNTS.monthly);
  else a.setFullYear(a.getFullYear() + dir * HISTORY_COUNTS.yearly);
  const now = new Date();
  if (a > now) a.setTime(now.getTime());
  historyAnchor = a;
}

// Build the ordered list of buckets (oldest → newest) for the active period.
function buildHistoryBuckets() {
  // getDateKey is local-date based, so the anchor's time-of-day is irrelevant
  // to the resulting calendar date keys.
  const anchor = new Date(historyAnchor);
  const buckets = [];

  if (historyPeriod === "daily") {
    const wk = ["S", "M", "T", "W", "T", "F", "S"];
    for (let i = HISTORY_COUNTS.daily - 1; i >= 0; i -= 1) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const key = getDateKey(d);
      buckets.push({
        shortLabel: wk[d.getDay()],
        longLabel: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        dayKeys: [key],
        clickKey: key,
        repDate: d,
      });
    }
  } else if (historyPeriod === "weekly") {
    const monday = new Date(getMondayDateStr(anchor) + "T00:00:00");
    for (let i = HISTORY_COUNTS.weekly - 1; i >= 0; i -= 1) {
      const ws = new Date(monday);
      ws.setDate(ws.getDate() - i * 7);
      const dayKeys = [];
      for (let j = 0; j < 7; j += 1) {
        const d = new Date(ws);
        d.setDate(d.getDate() + j);
        dayKeys.push(getDateKey(d));
      }
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      buckets.push({
        shortLabel: `${ws.getDate()}/${ws.getMonth() + 1}`,
        longLabel: `${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${we.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
        dayKeys,
        repDate: new Date(ws),
      });
    }
  } else if (historyPeriod === "monthly") {
    const base = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    for (let i = HISTORY_COUNTS.monthly - 1; i >= 0; i -= 1) {
      const ms = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const daysIn = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
      const dayKeys = [];
      for (let d = 1; d <= daysIn; d += 1) dayKeys.push(ymd(ms.getFullYear(), ms.getMonth(), d));
      buckets.push({
        shortLabel: ms.toLocaleDateString(undefined, { month: "short" }),
        longLabel: ms.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        dayKeys,
        repDate: ms,
      });
    }
  } else {
    const baseYear = anchor.getFullYear();
    for (let i = HISTORY_COUNTS.yearly - 1; i >= 0; i -= 1) {
      const yr = baseYear - i;
      const dayKeys = [];
      const cursor = new Date(yr, 0, 1);
      const end = new Date(yr, 11, 31);
      while (cursor <= end) {
        dayKeys.push(getDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      buckets.push({
        shortLabel: String(yr),
        longLabel: String(yr),
        dayKeys,
        repDate: new Date(yr, 0, 1),
      });
    }
  }
  return buckets;
}

// Aggregate macro totals across a bucket's days (ignoring future days).
function accumulateBucket(dayKeys, todayKey) {
  let protein = 0;
  let calories = 0;
  let daysLogged = 0;
  let elapsed = 0;
  let training = 0;
  let rest = 0;
  let hit = 0;
  for (const key of dayKeys) {
    if (key > todayKey) continue;
    elapsed += 1;
    if (isRestDay(key)) rest += 1;
    else training += 1;
    const t = dayMacroTotals(key);
    if (t.count > 0) {
      daysLogged += 1;
      protein += t.protein;
      calories += t.calories;
      const goalP = effectiveTargets(key).protein || 0;
      if (goalP > 0 && t.protein >= goalP * 0.9) hit += 1;
    }
  }
  return {
    protein,
    calories,
    daysLogged,
    elapsed,
    training,
    rest,
    hit,
    avgProtein: daysLogged ? Math.round(protein / daysLogged) : 0,
    avgCalories: daysLogged ? Math.round(calories / daysLogged) : 0,
  };
}

function renderHistory() {
  if (!els.historyChart) return;

  const todayKey = getDateKey(new Date());
  const buckets = buildHistoryBuckets();
  buckets.forEach((b) => {
    b.stats = accumulateBucket(b.dayKeys, todayKey);
  });

  const first = buckets[0];
  const last = buckets[buckets.length - 1];

  // Period range label in the header.
  if (els.historyLabel) {
    let label;
    if (historyPeriod === "monthly") {
      label = `${monShortYr(first.repDate)} – ${monShortYr(last.repDate)}`;
    } else if (historyPeriod === "yearly") {
      label = first.shortLabel === last.shortLabel ? last.shortLabel : `${first.shortLabel} – ${last.shortLabel}`;
    } else {
      const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      label = `${fmt(first.repDate)} – ${fmt(last.repDate)}`;
    }
    els.historyLabel.textContent = label;
  }

  if (els.historyNext) {
    els.historyNext.disabled = last.dayKeys.some((k) => k >= todayKey);
  }

  // Window-wide totals for the summary tiles.
  const tot = buckets.reduce(
    (a, b) => {
      a.protein += b.stats.protein;
      a.calories += b.stats.calories;
      a.daysLogged += b.stats.daysLogged;
      a.elapsed += b.stats.elapsed;
      a.training += b.stats.training;
      a.rest += b.stats.rest;
      a.hit += b.stats.hit;
      return a;
    },
    { protein: 0, calories: 0, daysLogged: 0, elapsed: 0, training: 0, rest: 0, hit: 0 }
  );
  const avgProtein = tot.daysLogged ? Math.round(tot.protein / tot.daysLogged) : 0;
  const avgCalories = tot.daysLogged ? Math.round(tot.calories / tot.daysLogged) : 0;

  if (els.historySummary) {
    const tiles = [
      { label: "Avg protein", value: `${avgProtein}g`, sub: "per logged day" },
      { label: "Avg calories", value: `${avgCalories}`, sub: "kcal / logged day" },
      { label: "Days logged", value: `${tot.daysLogged}`, sub: `of ${tot.elapsed}` },
      { label: "Goal days", value: `${tot.hit}`, sub: "≥ 90% protein" },
      { label: "Training days", value: tot.training, sub: "in range" },
      { label: "Rest days", value: tot.rest, sub: "in range" },
    ];
    els.historySummary.innerHTML = tiles
      .map(
        (t) =>
          `<div class="stat-tile"><span class="stat-value">${t.value}</span><span class="stat-label">${t.label}</span><span class="stat-sub">${t.sub}</span></div>`
      )
      .join("");
  }

  // Chart — bar per bucket, height = avg metric as % of goal.
  const isProtein = historyMetric === "protein";
  const goal = isProtein ? state.targets.protein || 0 : state.targets.calories || 0;
  const unit = isProtein ? "g" : " kcal";
  const MAX_PCT = 1.2;
  const goalLineBottom = (1 / MAX_PCT) * 100;

  if (els.historyChartTitle) els.historyChartTitle.textContent = isProtein ? "Protein vs goal" : "Calories vs goal";
  if (els.historyLegendDot) els.historyLegendDot.style.background = isProtein ? "#10a37f" : "#ea6a2a";
  if (els.historyLegend) {
    els.historyLegend.textContent = `Avg ${isProtein ? "protein" : "calories"} / logged day · bar = % of ${Math.round(goal)}${unit} goal · dashed line = goal`;
  }

  const bars = buckets
    .map((b) => {
      const val = isProtein ? b.stats.avgProtein : b.stats.avgCalories;
      const ratio = goal > 0 ? val / goal : 0;
      const height = (Math.min(ratio, MAX_PCT) / MAX_PCT) * 100;
      let cls = "empty";
      if (b.stats.daysLogged > 0) {
        if (ratio >= 1.05) cls = "over";
        else if (ratio >= 0.97) cls = "met";
        else if (ratio >= 0.8) cls = "close";
        else cls = "under";
      }
      const title = b.stats.daysLogged > 0 ? `${b.longLabel}: ${val}${unit} avg` : `${b.longLabel}: no log`;
      return `<div class="trend-bar-wrap" title="${escapeHtml(title)}"><div class="trend-bar-col"><div class="trend-bar ${cls}" style="height:${height}%"></div></div><span class="trend-bar-lbl">${escapeHtml(b.shortLabel)}</span></div>`;
    })
    .join("");
  els.historyChart.innerHTML = `<div class="trend-goalline" style="bottom:${goalLineBottom}%"></div><div class="trend-bars">${bars}</div>`;

  // Breakdown list — newest first, skipping fully-future buckets.
  if (els.historyBreakdown) {
    const rows = [...buckets].reverse().filter((b) => b.stats.elapsed > 0);
    if (els.historyHint) els.historyHint.hidden = historyPeriod !== "daily";
    if (!rows.length) {
      els.historyBreakdown.innerHTML = `<p class="hint">No history in this range yet.</p>`;
    } else {
      els.historyBreakdown.innerHTML = rows
        .map((b) => {
          const clickable = historyPeriod === "daily";
          const logged = b.stats.daysLogged > 0;
          const stats = logged
            ? `<span class="history-stat">${b.stats.avgProtein}g P</span><span class="history-stat">${b.stats.avgCalories} kcal</span>`
            : `<span class="history-stat muted">no log</span>`;
          const badge = historyPeriod === "daily"
            ? ""
            : `<span class="history-badge">${b.stats.daysLogged}/${b.stats.elapsed}</span>`;
          return `<button type="button" class="history-row${clickable ? "" : " static"}"${clickable ? ` data-date="${b.clickKey}"` : ""}>
            <span class="history-row-label">${escapeHtml(b.longLabel)}</span>
            <span class="history-row-stats">${stats}${badge}</span>
          </button>`;
        })
        .join("");
      if (historyPeriod === "daily") {
        els.historyBreakdown.querySelectorAll(".history-row[data-date]").forEach((row) => {
          row.addEventListener("click", () => {
            const dateKey = row.dataset.date;
            els.macroDate.value = dateKey;
            els.morningDate.value = dateKey;
            ensureDailyRecords();
            renderMacros();
            renderDailyMeals();
            activateTab("macros");
          });
        });
      }
    }
  }
}

function renderChecklist({ container, items, onToggle, onDelete, showQty = false, editable = true }) {
  container.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No items yet.";
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("label");
    row.className = "check-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!item.done;
    input.disabled = !editable;
    input.addEventListener("change", () => {
      if (!editable) return;
      onToggle(item.id, input.checked);
    });

    const text = document.createElement("span");
    text.className = "check-text";
    if (item.done) text.classList.add("done");
    text.textContent = item.text || item.name;

    const rightWrap = document.createElement("div");
    rightWrap.style.display = "flex";
    rightWrap.style.alignItems = "center";
    rightWrap.style.gap = "8px";

    if (showQty) {
      const qty = document.createElement("span");
      qty.className = "qty";
      qty.textContent = item.qty || "";
      rightWrap.appendChild(qty);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "link-btn";
    del.textContent = "Delete";
    del.disabled = !editable;
    del.addEventListener("click", (e) => {
      e.preventDefault();
      if (!editable) return;
      onDelete(item.id);
    });

    rightWrap.appendChild(del);

    row.append(input, text, rightWrap);
    container.appendChild(row);
  });
}

function fillWeekSelect(select) {
  const current = select.value;
  select.innerHTML = "";
  (plan.weeks || []).forEach((week) => {
    const opt = document.createElement("option");
    opt.value = week.key;
    opt.textContent = week.label;
    select.appendChild(opt);
  });

  const keys = (plan.weeks || []).map((w) => w.key);
  const currentWeek = getWeekKey(new Date());
  if (current && keys.includes(current)) {
    select.value = current;
  } else if (keys.includes(currentWeek)) {
    select.value = currentWeek;
  } else if (keys.length) {
    select.value = keys[0];
  }
}

function renderWeekOptions() {
  fillWeekSelect(els.weeklySelect);
  fillWeekSelect(els.mealPrepWeek);
}

function seedDayMeals(dateKey, force) {
  const existing = state.morningPrep[dateKey];
  // A past day with no saved record stays blank — don't backfill it with the
  // current template, so it correctly shows "no record".
  if (!force && !existing && isPastDate(dateKey)) return;
  const isOldFormat =
    Array.isArray(existing) &&
    existing.length > 0 &&
    (!("slot" in existing[0]) || !("p" in existing[0]));
  if (force || !existing || isOldFormat) {
    const meals = plan.dailyMeals || {};
    const template = (isRestDay(dateKey) ? meals.rest : meals.training) || [];
    // Use a deterministic, position-based id (not makeId()) so the same
    // template seeded independently on two devices produces identical record
    // keys. Sync keys records by collection|scope|recId, so random ids made the
    // same auto-seeded menu sync as distinct records and appear duplicated.
    state.morningPrep[dateKey] = template.map((m, i) => ({
      id: `tpl-${i}`,
      slot: m.slot,
      group: m.group || "Morning",
      time: m.time || "",
      text: m.item,
      p: Number(m.p) || 0,
      c: Number(m.c) || 0,
      f: Number(m.f) || 0,
      packed: false,
      done: false,
    }));
  }
}

function ensureDailyRecords() {
  const macroDate = els.macroDate.value;
  const morningDate = els.morningDate.value;

  if (!state.macroLogs[macroDate]) {
    state.macroLogs[macroDate] = [];
  }
  seedDayMeals(morningDate, false);

  saveState();
}

function findNextOppositeDay(dateKey) {
  const curRest = isRestDay(dateKey);
  for (let i = 1; i <= 14; i += 1) {
    const k = addDays(dateKey, i);
    if (isRestDay(k) !== curRest) return k;
  }
  return null;
}

function swapDayType() {
  const dateKey = els.morningDate.value;
  if (!dateKey) return;
  if (!isEditableDate(dateKey)) return;
  const targetKey = findNextOppositeDay(dateKey);
  if (!targetKey) return;

  // Swap the two days' types: the current day takes the target's type and
  // vice-versa. e.g. Tue (training, gym conflict) <-> Thu (next rest day):
  // Tuesday becomes a rest day, Thursday becomes the training day.
  const curRest = isRestDay(dateKey);
  if (!state.dayOverrides) state.dayOverrides = {};
  state.dayOverrides[dateKey] = curRest ? "training" : "rest";
  state.dayOverrides[targetKey] = curRest ? "rest" : "training";

  // Remove meal-synced macro entries for both days and re-seed each.
  [dateKey, targetKey].forEach((k) => {
    if (state.macroLogs[k]) {
      state.macroLogs[k] = state.macroLogs[k].filter((e) => !e.fromMeal);
    }
    seedDayMeals(k, true);
  });

  saveState();
  renderDailyMeals();
  renderMacros();
}

function resetDayType() {
  const dateKey = els.morningDate.value;
  if (!dateKey) return;
  if (!isEditableDate(dateKey)) return;
  if (!state.dayOverrides || !state.dayOverrides[dateKey]) return;

  // Remove the manual override so the day reverts to its default type.
  delete state.dayOverrides[dateKey];

  // Drop meal-synced macro entries and re-seed with the default template.
  if (state.macroLogs[dateKey]) {
    state.macroLogs[dateKey] = state.macroLogs[dateKey].filter((e) => !e.fromMeal);
  }
  seedDayMeals(dateKey, true);

  saveState();
  renderDailyMeals();
  renderMacros();
}

function ensureWeeklyRecords() {
  const mealWeekKey = els.mealPrepWeek.value;
  const groceryWeekKey = els.weeklySelect.value;

  if (!state.mealPrep[mealWeekKey]) {
    state.mealPrep[mealWeekKey] = (plan.mealPrepTasks || []).map((text) => ({
      id: makeId(),
      text,
      done: false,
    }));
  }

  if (!state.weeklyGroceries[groceryWeekKey]) {
    const week = (plan.weeks || []).find((w) => w.key === groceryWeekKey);
    const template = week ? week.items : [];
    state.weeklyGroceries[groceryWeekKey] = template.map((item) => ({
      id: makeId(),
      name: item.name,
      qty: item.qty,
      done: false,
    }));
  }

  saveState();
}

function ensureMonthlyRecord() {
  const monthKey = els.monthlySelect.value;
  if (!state.monthlyGroceries[monthKey]) {
    state.monthlyGroceries[monthKey] = (plan.monthlyStock || []).map((row) => ({
      ...row,
      currentStock: "",
      plannedBuy: "",
    }));
    saveState();
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recomp-data-${getDateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      state = mergeState(parsed);
      // The imported data replaces local state, so drop per-record sync
      // bookkeeping; the next sync will re-push everything as local edits.
      cloud.resetMeta();
      saveState();
      ensureDailyRecords();
      ensureWeeklyRecords();
      ensureMonthlyRecord();
      renderAll();
      alert("Data imported successfully.");
    } catch (err) {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function mergeState(parsed) {
  const merged = structuredClone(defaultState);
  if (parsed && typeof parsed === "object") {
    if (parsed.targets) merged.targets = { ...merged.targets, ...parsed.targets };
    if (parsed.macroLogs) merged.macroLogs = parsed.macroLogs;
    if (parsed.water && typeof parsed.water === "object") merged.water = parsed.water;
    if (parsed.targetHistory && typeof parsed.targetHistory === "object") {
      merged.targetHistory = parsed.targetHistory;
    }
    if (parsed.morningPrep) merged.morningPrep = parsed.morningPrep;
    if (parsed.mealPrep) merged.mealPrep = parsed.mealPrep;
    if (parsed.weeklyGroceries) merged.weeklyGroceries = parsed.weeklyGroceries;
    if (parsed.monthlyGroceries) merged.monthlyGroceries = parsed.monthlyGroceries;
    if (parsed.dayOverrides) merged.dayOverrides = parsed.dayOverrides;
    if (Array.isArray(parsed.recentMeals) && parsed.recentMeals.length) {
      merged.recentMeals = parsed.recentMeals;
    }
  }
  // Backfill: lock in the current targets for any already-logged day that has
  // no snapshot yet, so future target changes don't rewrite past history.
  Object.keys(merged.macroLogs || {}).forEach((dateKey) => {
    const entries = merged.macroLogs[dateKey];
    if (Array.isArray(entries) && entries.length && !merged.targetHistory[dateKey]) {
      merged.targetHistory[dateKey] = { ...merged.targets };
    }
  });
  return merged;
}

// The macro targets that applied to a given day: its locked snapshot if it has
// one, otherwise the current/default targets (used for today and future days).
function effectiveTargets(dateKey) {
  return (state.targetHistory && state.targetHistory[dateKey]) || state.targets;
}

// Stamp the current targets onto a day the first time it gets a log entry.
function snapshotDayTarget(dateKey) {
  if (!state.targetHistory) state.targetHistory = {};
  if (!state.targetHistory[dateKey]) {
    state.targetHistory[dateKey] = { ...state.targets };
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return mergeState(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleAutoSync();
}

// ---------- Edit locking (today / current week only) ----------
function isEditableDate(dateKey) {
  return dateKey === getDateKey(new Date());
}

function isPastDate(dateKey) {
  return dateKey < getDateKey(new Date());
}

function isEditableWeekKey(weekKey) {
  return weekKey === getWeekKey(new Date());
}

/* ---------- Plan loading (JSON-driven, per month) ---------- */

async function loadActivePlan() {
  const saved = localStorage.getItem(PLAN_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (isValidPlan(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch(DEFAULT_PLAN_URL, { cache: "no-cache" });
    if (res.ok) {
      const parsed = await res.json();
      if (isValidPlan(parsed)) return parsed;
    }
  } catch {
    /* offline or file:// — use fallback */
  }

  return fallbackPlan;
}

function isValidPlan(p) {
  return (
    p &&
    typeof p === "object" &&
    p.targets &&
    Array.isArray(p.weeks) &&
    Array.isArray(p.monthlyStock)
  );
}

function importPlan(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!isValidPlan(parsed)) {
        throw new Error("missing required fields");
      }
      plan = parsed;
      localStorage.setItem(PLAN_KEY, JSON.stringify(parsed));

      applyPlanLabel();
      els.monthlySelect.value = plan.monthKey || els.monthlySelect.value;
      renderWeekOptions();
      ensureWeeklyRecords();
      ensureMonthlyRecord();
      renderAll();

      setStatus(
        els.planStatus,
        `Loaded plan: ${plan.label || plan.planId || "custom"}. New records use this plan.`
      );
    } catch (err) {
      setStatus(els.planStatus, "Invalid plan JSON. Check the template format.", true);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function downloadPlanTemplate() {
  const template = {
    planId: "2026-07",
    label: "July 2026",
    monthKey: "2026-07",
    targets: { protein: 160, carbs: 260, fats: 65, calories: 2400 },
    morningTasks: ["Water + creatine", "Pack snack box"],
    mealPrepTasks: ["Boil soya for the week", "Build 4 pre-workout boxes"],
    dailyMeals: {
      training: [
        { slot: "Breakfast", group: "Morning", time: "10:00 am", item: "Protein oats bowl + whey" },
        { slot: "Lunch", group: "Morning", time: "1:30 pm", item: "Roti + sabzi + protein anchor + curd" },
        { slot: "Snack", group: "Morning", time: "~4:00 pm", item: "Sattu drink or chana + almonds" },
        { slot: "Pre-Workout", group: "Morning", time: "5:30-6:30 pm", item: "Soya chaat box + optional fruit" },
        { slot: "Dinner", group: "Evening", time: "10:00 pm", item: "Protein-heavy dinner + 2 roti + veg" }
      ],
      rest: [
        { slot: "Breakfast", group: "Morning", time: "10:00 am", item: "Sattu shake + whey (lower carbs)" },
        { slot: "Lunch", group: "Morning", time: "1:30 pm", item: "2 roti + sabzi + protein anchor + curd" },
        { slot: "Snack", group: "Morning", time: "~4:00 pm", item: "Curd or fruit + almonds" },
        { slot: "Pre-Workout", group: "Morning", time: "rest day", item: "No gym - optional whey/curd if protein short" },
        { slot: "Dinner", group: "Evening", time: "10:00 pm", item: "Protein-forward dinner + 1-2 roti + veg" }
      ],
    },
    weeks: [
      {
        key: "2026-W27",
        label: "Week 1 (Jul ...)",
        items: [
          { name: "Paneer (every 2 days)", qty: "200-250 g per buy x 4 buys" },
          { name: "Vegetables mixed", qty: "6-7 kg" },
        ],
      },
    ],
    monthlyStock: [
      { item: "Soya chunks/granules", minBuffer: "1.5 kg", reorderBelow: "1.0 kg", monthlyNeed: "2.5-3.5 kg" },
    ],
  };

  downloadJson(template, "recomp-plan-template.json");
  setStatus(els.planStatus, "Template downloaded. Edit it, then Load Plan JSON.");
}

/* ---------- Admin / defaults (version-controlled) ---------- */

function savePlan() {
  localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  applyPlanLabel();
  scheduleAutoSync();
}

function adminRow(fields, values = {}) {
  const row = document.createElement("div");
  row.className = "admin-row";
  fields.forEach((f) => {
    let input;
    if (f.type === "select") {
      input = document.createElement("select");
      (f.options || []).forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        input.appendChild(opt);
      });
      input.value = values[f.key] ?? (f.options ? f.options[0] : "");
    } else {
      input = document.createElement("input");
      input.type = f.type || "text";
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.type === "number") {
        input.min = "0";
        input.step = f.step || "1";
      }
      const v = values[f.key];
      input.value = v === undefined || v === null ? "" : v;
    }
    input.dataset.field = f.key;
    if (f.cls) input.classList.add(f.cls);
    row.appendChild(input);
  });
  const del = document.createElement("button");
  del.type = "button";
  del.className = "admin-del";
  del.setAttribute("aria-label", "Remove row");
  del.textContent = "\u00d7";
  del.addEventListener("click", () => row.remove());
  row.appendChild(del);
  return row;
}

function readAdminRows(container, fields) {
  return [...container.querySelectorAll(".admin-row")].map((row) => {
    const obj = {};
    fields.forEach((f) => {
      const input = row.querySelector(`[data-field="${f.key}"]`);
      if (!input) return;
      obj[f.key] = f.type === "number" ? numberVal(input.value) : input.value.trim();
    });
    return obj;
  });
}

function renderAdmin() {
  renderAdminTargets();
  renderAdminDaily();
  renderAdminWeeklyPrep();
  fillWeekSelect(adminEls.weekSelect);
  renderAdminWeeklyGrocery();
  renderAdminMonthly();
}

function renderAdminTargets() {
  const t = plan.targets || {};
  adminEls.targetProtein.value = t.protein ?? "";
  adminEls.targetCarbs.value = t.carbs ?? "";
  adminEls.targetFats.value = t.fats ?? "";
  adminEls.targetCalories.value = t.calories ?? "";
}

function renderAdminDaily() {
  const meals = (plan.dailyMeals && plan.dailyMeals[adminDayType]) || [];
  adminEls.dailyRows.innerHTML = "";
  meals.forEach((m) => adminEls.dailyRows.appendChild(adminRow(DAILY_FIELDS, m)));
  [...adminEls.dayTypeSeg.querySelectorAll(".seg-btn")].forEach((b) =>
    b.classList.toggle("active", b.dataset.daytype === adminDayType)
  );
}

function renderAdminWeeklyPrep() {
  const tasks = plan.mealPrepTasks || [];
  adminEls.weeklyPrepRows.innerHTML = "";
  tasks.forEach((text) =>
    adminEls.weeklyPrepRows.appendChild(adminRow(WEEKLY_PREP_FIELDS, { text }))
  );
}

function renderAdminWeeklyGrocery() {
  const key = adminEls.weekSelect.value;
  const week = (plan.weeks || []).find((w) => w.key === key);
  const items = week ? week.items : [];
  adminEls.weeklyGroceryRows.innerHTML = "";
  items.forEach((it) =>
    adminEls.weeklyGroceryRows.appendChild(adminRow(WEEKLY_GROCERY_FIELDS, it))
  );
}

function renderAdminMonthly() {
  const rows = plan.monthlyStock || [];
  adminEls.monthlyRows.innerHTML = "";
  rows.forEach((r) => adminEls.monthlyRows.appendChild(adminRow(MONTHLY_FIELDS, r)));
}

function saveAdminTargets() {
  const t = {
    protein: numberVal(adminEls.targetProtein.value),
    carbs: numberVal(adminEls.targetCarbs.value),
    fats: numberVal(adminEls.targetFats.value),
    calories: numberVal(adminEls.targetCalories.value),
  };
  plan.targets = t;
  state.targets = { ...t };
  // Today reflects the new target immediately; past days keep their snapshots.
  state.targetHistory[getDateKey(new Date())] = { ...t };
  savePlan();
  saveState();
  renderMacros();
  setStatus(adminEls.targetsStatus, "Saved \u2014 macro rings updated.");
}

function resetAdminTargets() {
  plan.targets = structuredClone(FACTORY_TARGETS);
  state.targets = structuredClone(FACTORY_TARGETS);
  state.targetHistory[getDateKey(new Date())] = { ...state.targets };
  savePlan();
  saveState();
  renderAdminTargets();
  renderMacros();
  setStatus(adminEls.targetsStatus, "Reset to app default.");
}

function saveAdminDaily() {
  const rows = readAdminRows(adminEls.dailyRows, DAILY_FIELDS).filter((r) => r.item || r.slot);
  if (!plan.dailyMeals) plan.dailyMeals = { training: [], rest: [] };
  plan.dailyMeals[adminDayType] = rows.map((r) => ({
    slot: r.slot,
    group: r.group || "Morning",
    time: r.time,
    p: r.p,
    c: r.c,
    f: r.f,
    item: r.item,
  }));
  savePlan();
  setStatus(adminEls.dailyStatus, `Saved ${adminDayType} template. New days use it.`);
}

function applyAdminDaily() {
  saveAdminDaily();
  const dateKey = els.morningDate.value;
  if (state.macroLogs[dateKey]) {
    state.macroLogs[dateKey] = state.macroLogs[dateKey].filter((e) => !e.fromMeal);
  }
  seedDayMeals(dateKey, true);
  saveState();
  renderDailyMeals();
  renderMacros();
  setStatus(adminEls.dailyStatus, "Applied \u2014 today's meals re-seeded from this template.");
}

function resetAdminDaily() {
  if (!plan.dailyMeals) plan.dailyMeals = {};
  plan.dailyMeals[adminDayType] = structuredClone(FACTORY_PLAN.dailyMeals[adminDayType] || []);
  savePlan();
  renderAdminDaily();
  setStatus(adminEls.dailyStatus, `Reset ${adminDayType} template to app default.`);
}

function saveAdminWeeklyPrep() {
  const rows = readAdminRows(adminEls.weeklyPrepRows, WEEKLY_PREP_FIELDS)
    .map((r) => r.text)
    .filter(Boolean);
  plan.mealPrepTasks = rows;
  savePlan();
  setStatus(adminEls.weeklyPrepStatus, "Saved. New weeks use these tasks.");
}

function applyAdminWeeklyPrep() {
  saveAdminWeeklyPrep();
  const key = els.mealPrepWeek.value;
  state.mealPrep[key] = (plan.mealPrepTasks || []).map((text) => ({
    id: makeId(),
    text,
    done: false,
  }));
  saveState();
  renderMealPrep();
  setStatus(adminEls.weeklyPrepStatus, "Applied \u2014 current week re-seeded.");
}

function resetAdminWeeklyPrep() {
  plan.mealPrepTasks = structuredClone(FACTORY_PLAN.mealPrepTasks || []);
  savePlan();
  renderAdminWeeklyPrep();
  setStatus(adminEls.weeklyPrepStatus, "Reset to app default.");
}

function saveAdminWeeklyGrocery() {
  const key = adminEls.weekSelect.value;
  if (!key) return;
  const rows = readAdminRows(adminEls.weeklyGroceryRows, WEEKLY_GROCERY_FIELDS).filter((r) => r.name);
  if (!Array.isArray(plan.weeks)) plan.weeks = [];
  let week = plan.weeks.find((w) => w.key === key);
  if (!week) {
    week = { key, label: key, items: [] };
    plan.weeks.push(week);
  }
  week.items = rows.map((r) => ({ name: r.name, qty: r.qty }));
  savePlan();
  setStatus(adminEls.weeklyGroceryStatus, "Saved week defaults.");
}

function applyAdminWeeklyGrocery() {
  saveAdminWeeklyGrocery();
  const key = adminEls.weekSelect.value;
  const week = (plan.weeks || []).find((w) => w.key === key);
  const items = week ? week.items : [];
  state.weeklyGroceries[key] = items.map((it) => ({
    id: makeId(),
    name: it.name,
    qty: it.qty,
    done: false,
  }));
  saveState();
  renderWeeklyGrocery();
  setStatus(adminEls.weeklyGroceryStatus, "Applied \u2014 week grocery re-seeded.");
}

function resetAdminWeeklyGrocery() {
  const key = adminEls.weekSelect.value;
  const factoryWeek = (FACTORY_PLAN.weeks || []).find((w) => w.key === key);
  if (!Array.isArray(plan.weeks)) plan.weeks = [];
  let week = plan.weeks.find((w) => w.key === key);
  if (!week) {
    week = { key, label: key, items: [] };
    plan.weeks.push(week);
  }
  week.items = factoryWeek ? structuredClone(factoryWeek.items) : [];
  savePlan();
  renderAdminWeeklyGrocery();
  setStatus(
    adminEls.weeklyGroceryStatus,
    factoryWeek ? "Reset to app default." : "No app default for this week \u2014 cleared."
  );
}

function saveAdminMonthly() {
  const rows = readAdminRows(adminEls.monthlyRows, MONTHLY_FIELDS).filter((r) => r.item);
  plan.monthlyStock = rows.map((r) => ({
    item: r.item,
    minBuffer: r.minBuffer,
    reorderBelow: r.reorderBelow,
    monthlyNeed: r.monthlyNeed,
  }));
  savePlan();
  setStatus(adminEls.monthlyStatus, "Saved monthly stock defaults.");
}

function applyAdminMonthly() {
  saveAdminMonthly();
  const monthKey = els.monthlySelect.value;
  const prev = state.monthlyGroceries[monthKey] || [];
  state.monthlyGroceries[monthKey] = (plan.monthlyStock || []).map((row) => {
    const old = prev.find((p) => (p.item || "").toLowerCase() === row.item.toLowerCase());
    return {
      ...row,
      currentStock: old ? old.currentStock : "",
      plannedBuy: old ? old.plannedBuy : "",
    };
  });
  saveState();
  renderMonthly();
  setStatus(adminEls.monthlyStatus, "Applied \u2014 this month re-seeded (stock entries kept).");
}

function resetAdminMonthly() {
  plan.monthlyStock = structuredClone(FACTORY_PLAN.monthlyStock || []);
  savePlan();
  renderAdminMonthly();
  setStatus(adminEls.monthlyStatus, "Reset to app default.");
}

function resetAllDefaults() {
  const ok = confirm(
    "Reset ALL default values (macros, meals, grocery, stock) to the original app defaults?\n\nYour logged macros and checkmarks stay, but the current day/week/month templates are re-seeded."
  );
  if (!ok) return;

  plan.targets = structuredClone(FACTORY_TARGETS);
  plan.morningTasks = structuredClone(FACTORY_PLAN.morningTasks || []);
  plan.mealPrepTasks = structuredClone(FACTORY_PLAN.mealPrepTasks || []);
  plan.dailyMeals = structuredClone(FACTORY_PLAN.dailyMeals || {});
  plan.weeks = structuredClone(FACTORY_PLAN.weeks || []);
  plan.monthlyStock = structuredClone(FACTORY_PLAN.monthlyStock || []);
  savePlan();

  state.targets = structuredClone(FACTORY_TARGETS);
  state.targetHistory[getDateKey(new Date())] = { ...state.targets };

  const dateKey = els.morningDate.value;
  if (state.macroLogs[dateKey]) {
    state.macroLogs[dateKey] = state.macroLogs[dateKey].filter((e) => !e.fromMeal);
  }
  seedDayMeals(dateKey, true);

  const mealWeek = els.mealPrepWeek.value;
  state.mealPrep[mealWeek] = (plan.mealPrepTasks || []).map((text) => ({
    id: makeId(),
    text,
    done: false,
  }));

  const gWeek = els.weeklySelect.value;
  const wk = (plan.weeks || []).find((w) => w.key === gWeek);
  state.weeklyGroceries[gWeek] = (wk ? wk.items : []).map((it) => ({
    id: makeId(),
    name: it.name,
    qty: it.qty,
    done: false,
  }));

  const mKey = els.monthlySelect.value;
  state.monthlyGroceries[mKey] = (plan.monthlyStock || []).map((row) => ({
    ...row,
    currentStock: "",
    plannedBuy: "",
  }));
  saveState();

  renderAll();
  renderAdmin();
  setStatus(adminEls.resetAllStatus, "All defaults restored to app defaults.");
}

function openAdmin() {
  renderAdmin();
  switchAdminSub("defaults");
  activateTab("admin");
  document.body.classList.add("admin-open");
  window.scrollTo({ top: 0 });
}

function closeAdmin() {
  document.body.classList.remove("admin-open");
  activateTab("macros");
  window.scrollTo({ top: 0 });
}

function switchAdminSub(name) {
  if (adminEls.subTabs) {
    adminEls.subTabs.forEach((t) =>
      t.classList.toggle("active", t.dataset.subtab === name)
    );
  }
  if (adminEls.subPanels) {
    adminEls.subPanels.forEach((p) => {
      const match = p.id === `adminSub-${name}`;
      p.classList.toggle("active", match);
      p.hidden = !match;
    });
  }
  window.scrollTo({ top: 0 });
}

/* ---------- Save confirmation modal (offers "Apply to current") ---------- */

let pendingApply = null;

// Show a modal after a Save, describing what was saved and offering to also
// apply the new defaults to the current day/week/month.
function openApplyModal({ title, body, applyLabel, onApply }) {
  if (!adminEls.modal) {
    if (typeof onApply === "function") onApply();
    return;
  }
  pendingApply = onApply || null;
  adminEls.modalTitle.textContent = title;
  adminEls.modalBody.textContent = body;
  adminEls.modalApply.textContent = applyLabel;
  adminEls.modalApply.hidden = !onApply;
  adminEls.modal.hidden = false;
}

function closeApplyModal() {
  if (adminEls.modal) adminEls.modal.hidden = true;
  pendingApply = null;
}

function confirmApplyModal() {
  const fn = pendingApply;
  closeApplyModal();
  if (typeof fn === "function") fn();
}

function saveDailyAndPrompt() {
  saveAdminDaily();
  openApplyModal({
    title: "Daily template saved",
    body:
      `New days will be seeded from this ${adminDayType} template. ` +
      "Apply it to today as well? This re-seeds today's meal list from the template — " +
      "any items you already ticked as eaten today will be reset.",
    applyLabel: "Apply to today",
    onApply: applyAdminDaily,
  });
}

function saveWeeklyPrepAndPrompt() {
  saveAdminWeeklyPrep();
  openApplyModal({
    title: "Prep tasks saved",
    body:
      "New weeks will use these prep tasks. Apply them to the current week as well? " +
      "This replaces this week's prep checklist and resets its checkmarks.",
    applyLabel: "Apply to this week",
    onApply: applyAdminWeeklyPrep,
  });
}

function saveWeeklyGroceryAndPrompt() {
  saveAdminWeeklyGrocery();
  openApplyModal({
    title: "Week grocery saved",
    body:
      "Saved as the default for the selected week. Apply it to the live grocery list now? " +
      "This replaces the current items for that week and resets their checkmarks.",
    applyLabel: "Apply to this week",
    onApply: applyAdminWeeklyGrocery,
  });
}

function saveMonthlyAndPrompt() {
  saveAdminMonthly();
  openApplyModal({
    title: "Stock defaults saved",
    body:
      "New months will use these stock rows. Apply them to this month as well? " +
      "This re-seeds the month's stock table (your current-stock and planned-buy entries are kept).",
    applyLabel: "Apply to this month",
    onApply: applyAdminMonthly,
  });
}

function bindAdminEvents() {
  if (adminEls.openBtn) adminEls.openBtn.addEventListener("click", openAdmin);
  if (adminEls.closeBtn) adminEls.closeBtn.addEventListener("click", closeAdmin);

  adminEls.subTabs.forEach((t) =>
    t.addEventListener("click", () => switchAdminSub(t.dataset.subtab))
  );

  adminEls.saveTargetsBtn.addEventListener("click", saveAdminTargets);
  adminEls.resetTargetsBtn.addEventListener("click", resetAdminTargets);

  [...adminEls.dayTypeSeg.querySelectorAll(".seg-btn")].forEach((b) =>
    b.addEventListener("click", () => {
      adminDayType = b.dataset.daytype;
      renderAdminDaily();
    })
  );
  adminEls.dailyAddBtn.addEventListener("click", () =>
    adminEls.dailyRows.appendChild(adminRow(DAILY_FIELDS, { group: "Morning" }))
  );
  adminEls.saveDailyBtn.addEventListener("click", saveDailyAndPrompt);
  adminEls.resetDailyBtn.addEventListener("click", resetAdminDaily);

  adminEls.weeklyPrepAddBtn.addEventListener("click", () =>
    adminEls.weeklyPrepRows.appendChild(adminRow(WEEKLY_PREP_FIELDS, {}))
  );
  adminEls.saveWeeklyPrepBtn.addEventListener("click", saveWeeklyPrepAndPrompt);
  adminEls.resetWeeklyPrepBtn.addEventListener("click", resetAdminWeeklyPrep);

  adminEls.weekSelect.addEventListener("change", renderAdminWeeklyGrocery);
  adminEls.weeklyGroceryAddBtn.addEventListener("click", () =>
    adminEls.weeklyGroceryRows.appendChild(adminRow(WEEKLY_GROCERY_FIELDS, {}))
  );
  adminEls.saveWeeklyGroceryBtn.addEventListener("click", saveWeeklyGroceryAndPrompt);
  adminEls.resetWeeklyGroceryBtn.addEventListener("click", resetAdminWeeklyGrocery);

  adminEls.monthlyAddBtn.addEventListener("click", () =>
    adminEls.monthlyRows.appendChild(adminRow(MONTHLY_FIELDS, {}))
  );
  adminEls.saveMonthlyBtn.addEventListener("click", saveMonthlyAndPrompt);
  adminEls.resetMonthlyBtn.addEventListener("click", resetAdminMonthly);

  adminEls.resetAllBtn.addEventListener("click", resetAllDefaults);

  if (adminEls.modalApply) adminEls.modalApply.addEventListener("click", confirmApplyModal);
  if (adminEls.modalDismiss) adminEls.modalDismiss.addEventListener("click", closeApplyModal);
  if (adminEls.modal)
    adminEls.modal.addEventListener("click", (e) => {
      if (e.target === adminEls.modal) closeApplyModal();
    });
}

/* ---------- Sync settings ---------- */

function loadSyncSettings() {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return { autoSync: true };
    const parsed = JSON.parse(raw);
    // Default auto-sync on (offline-first: local is source of truth, the cloud
    // catches up in the background).
    return { autoSync: parsed.autoSync !== false };
  } catch {
    return { autoSync: true };
  }
}

function saveSyncSettings() {
  localStorage.setItem(SYNC_KEY, JSON.stringify(syncSettings));
}

// Debounced background sync. The per-record diffing + network call live in
// cloudSync.js; here we just gate on the user's auto-sync preference.
function scheduleAutoSync() {
  if (!syncSettings.autoSync) return;
  cloud.scheduleSync();
}

function saveStateNoSync() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------- PWA install + service worker ---------- */

function registerServiceWorker() {
  // Service worker registration is handled by the @vite-pwa/astro integration
  // (registerType: "autoUpdate"). Kept as a no-op for backward compatibility.
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (localStorage.getItem("recomp-install-dismissed") === "1") return;
    if (els.installBanner) els.installBanner.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideInstallBanner();
  });
}

function hideInstallBanner() {
  if (els.installBanner) els.installBanner.hidden = true;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

async function triggerInstall() {
  if (isStandalone()) {
    setStatus(els.installHint, "Already installed — you're running the app version.");
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBanner();
    setStatus(
      els.installHint,
      choice && choice.outcome === "accepted"
        ? "Installing… check your home screen."
        : "Install dismissed. You can tap this button again anytime."
    );
    return;
  }
  // No native prompt available — show platform-specific manual steps.
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    setStatus(els.installHint, "On iPhone/iPad: tap the Share icon, then 'Add to Home Screen'.");
  } else {
    setStatus(els.installHint, "Open your browser menu (⋮) and tap 'Install app' / 'Add to Home screen'.");
  }
}

/* ---------- Helpers ---------- */

