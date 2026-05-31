// Pure, reusable helpers shared across features: date math, formatting,
// parsing, and generic DOM utilities. No app-state dependencies.

// ---- Dates ----
export function getDateKey(d) {
  return d.toISOString().slice(0, 10);
}

export function ymd(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(dateKey, n) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getMonthKey(d) {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function getMondayDateStr(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return getDateKey(d);
}

export function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function monShortYr(d) {
  return `${d.toLocaleDateString(undefined, { month: "short" })} '${String(d.getFullYear()).slice(2)}`;
}

// ---- Numbers / parsing ----
export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function numberVal(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function entryCalories(e) {
  if (Number.isFinite(e.calories) && e.calories > 0) return e.calories;
  return e.protein * 4 + e.carbs * 4 + e.fats * 9;
}

// Parse a quantity string like "1.5 kg" / "900 g" / "10 scoops" into a
// normalized { value, unit } so stock can be compared against a threshold.
// Weight units are normalized to grams, volume to ml. Returns null if no
// number is found.
export function parseQty(str) {
  if (str === null || str === undefined) return null;
  const m = String(str)
    .trim()
    .match(/(-?[\d.]+)\s*([a-z]+)?/i);
  if (!m) return null;
  let value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  let unit = (m[2] || "").toLowerCase();
  if (unit === "kg" || unit === "kgs") {
    value *= 1000;
    unit = "g";
  } else if (unit === "g" || unit === "gm" || unit === "gms" || unit === "grams") {
    unit = "g";
  } else if (unit === "l" || unit === "ltr") {
    value *= 1000;
    unit = "ml";
  } else if (unit === "scoop" || unit === "scoops") {
    unit = "scoops";
  } else if (unit === "tub" || unit === "tubs") {
    unit = "tubs";
  }
  return { value, unit };
}

// True when current stock is at or below the reorder threshold (same unit).
export function isStockLow(currentStock, reorderBelow) {
  const cur = parseQty(currentStock);
  const re = parseQty(reorderBelow);
  if (!cur || !re) return false;
  if (cur.unit !== re.unit) return false;
  return cur.value <= re.value;
}

// ---- Strings / HTML ----
export function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---- Generic DOM helpers ----
export function tdText(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

export function tdNode(node) {
  const td = document.createElement("td");
  td.appendChild(node);
  return td;
}

// Enable/disable every input/button/select inside a form or container.
export function setControlsEnabled(root, enabled) {
  if (!root) return;
  root.querySelectorAll("input, button, select, textarea").forEach((el) => {
    el.disabled = !enabled;
  });
}

// Returns whether the period is editable. The lock-note banner is intentionally
// suppressed — past/future periods are obviously read-only (controls disabled),
// so the extra warning is redundant.
export function setLockNote(noteEl, editable, selectedKey, todayKey, unit) {
  if (noteEl) noteEl.hidden = true;
  return editable;
}

export function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", isError);
}

export function haptic(pattern) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      /* ignored */
    }
  }
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
