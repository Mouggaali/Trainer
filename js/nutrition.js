// Nutrition targets for hypertrophy + adaptive calorie goal (MacroFactor-style).
// Rules: docs/TRAINING_PRINCIPLES.md → "Voeding". Pure functions; state is passed in.

const DAY = 86400000;
export const KCAL_PER_KG = 7700;

export const ACTIVITY = {
  low: { label: 'Zittend werk, verder weinig beweging', factor: 1.4 },
  mid: { label: 'Licht actief (veel lopen/staan)', factor: 1.55 },
  high: { label: 'Actief werk of veel sport naast de gym', factor: 1.7 },
};

/** Weekly weight change as fraction of bodyweight, per goal. */
export const GOALS = {
  bulk: { label: 'Aankomen (spiermassa)', rate: 0.0035 },
  maintain: { label: 'Gewicht houden', rate: 0 },
  cut: { label: 'Afvallen (vet kwijt)', rate: -0.005 },
};

export const MEALS = [
  { id: 'ontbijt', label: 'Ontbijt' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'diner', label: 'Diner' },
  { id: 'snack', label: 'Snacks' },
];

const round = (n, step = 1) => Math.round(n / step) * step;
const isoToMs = (iso) => new Date(`${iso}T12:00:00`).getTime();
const pad = (n) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD (food log dates are local days). */
export const localISO = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Mifflin-St Jeor resting energy × activity factor. */
export function estimateTdee({ sex, birthYear, heightCm, activity }, kg, now = Date.now()) {
  const age = new Date(now).getFullYear() - birthYear;
  const bmr = 10 * kg + 6.25 * heightCm - 5 * age + (sex === 'f' ? -161 : 5);
  return round(bmr * (ACTIVITY[activity]?.factor || ACTIVITY.mid.factor), 10);
}

/** Latest weighing in kg (or null). */
export function latestWeight(state) {
  const bw = [...(state.bodyweight || [])].sort((a, b) => a.date.localeCompare(b.date));
  return bw.at(-1)?.kg ?? null;
}

/** Daily targets { kcal, protein, fat, carbs } or null when there is no setup / bodyweight yet. */
export function targets(state) {
  const n = state.settings.nutrition;
  const kg = latestWeight(state);
  if (!n?.tdee || !kg) return null;
  const rate = GOALS[n.goal]?.rate ?? 0;
  const kcal = n.kcalOverride || round(n.tdee + (rate * kg * KCAL_PER_KG) / 7, 10);
  const protein = round((n.proteinPerKg || 2) * kg);
  const fat = round(Math.max(0.8 * kg, (0.2 * kcal) / 9));
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
}

export function sumEntries(entries) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) for (const k in t) t[k] += e[k] || 0;
  return t;
}

/** Nutrients for `grams` of a food with per-100 g values. */
export function nutrientsFor(per100, grams) {
  const f = grams / 100;
  return {
    kcal: Math.round(per100.kcal * f),
    protein: Math.round(per100.protein * f * 10) / 10,
    carbs: Math.round(per100.carbs * f * 10) / 10,
    fat: Math.round(per100.fat * f * 10) / 10,
  };
}

/** Slope (per day) of a least-squares line through [{ t, y }]. */
function slope(points) {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.t, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of points) { num += (p.t - mx) * (p.y - my); den += (p.t - mx) ** 2; }
  return den ? num / den : 0;
}

/**
 * Weight trend over the last `days` days: least-squares line through the weighings (the fit itself smooths
 * day-to-day water swings). → { kgPerWeek, count } or null when there are fewer than 3 weighings.
 */
export function weightTrend(state, now = Date.now(), days = 21) {
  const from = localISO(now - days * DAY);
  const recent = (state.bodyweight || []).filter((b) => b.date >= from).map((b) => ({ t: isoToMs(b.date) / DAY, y: b.kg }));
  if (recent.length < 3) return null;
  return { kgPerWeek: slope(recent) * 7, count: recent.length };
}

/** Average daily intake over logged days in the last `days` days (today excluded: it is not complete yet). */
export function intakeStats(state, now = Date.now(), days = 21) {
  const today = localISO(now);
  const from = localISO(now - days * DAY);
  const perDay = new Map();
  for (const e of state.foodLog || []) {
    if (e.date >= from && e.date < today) perDay.set(e.date, (perDay.get(e.date) || 0) + (e.kcal || 0));
  }
  const vals = [...perDay.values()].filter((k) => k >= 800); // ignore clearly incomplete days
  return { days: vals.length, avgKcal: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
}

/**
 * Weekly adaptive step. Returns { due: false } when not a week since the last adjustment,
 * { due: true, ok: false, reason } with too little data, or { due: true, ok: true, tdee, kcal, ... }.
 */
export function adaptiveCheck(state, now = Date.now()) {
  const n = state.settings.nutrition;
  if (!n?.tdee || n.kcalOverride) return { due: false };
  if (n.adjustedAt && now - n.adjustedAt < 7 * DAY) return { due: false };
  const trend = weightTrend(state, now);
  const intake = intakeStats(state, now);
  if (!trend || intake.days < 10) {
    const need = [];
    if (intake.days < 10) need.push(`${10 - intake.days} gelogde dagen`);
    if (!trend) need.push('minstens 3 wegingen');
    return { due: true, ok: false, reason: `Voor de slimme aanpassing heeft je trainer nog ${need.join(' en ')} in de laatste 3 weken nodig.` };
  }
  const estimate = intake.avgKcal - (trend.kgPerWeek / 7) * KCAL_PER_KG;
  const blended = 0.7 * n.tdee + 0.3 * estimate;
  const tdee = round(Math.max(n.tdee - 150, Math.min(n.tdee + 150, blended)), 10);
  const before = targets(state)?.kcal;
  const after = targets({ ...state, settings: { ...state.settings, nutrition: { ...n, tdee } } })?.kcal;
  return { due: true, ok: true, tdee, before, after, kgPerWeek: trend.kgPerWeek, avgKcal: Math.round(intake.avgKcal), estimate: Math.round(estimate) };
}

/** Bodyweight on a date: last weighing on or before it, else the first weighing (null without weighings). */
function weightOn(sortedBw, iso) {
  let kg = sortedBw[0]?.kg ?? null;
  for (const b of sortedBw) { if (b.date <= iso) kg = b.kg; else break; }
  return kg;
}

/** Protein target (g) for a date, or null without a weighing. Same rounding as targets(). */
export function proteinGoalOn(state, iso) {
  const bw = [...(state.bodyweight || [])].sort((a, b) => a.date.localeCompare(b.date));
  const kg = weightOn(bw, iso);
  return kg == null ? null : round((state.settings.nutrition?.proteinPerKg || 2) * kg);
}

/** Dates (YYYY-MM-DD, sorted) on which logged protein reached that day's protein target. */
export function proteinDays(state) {
  const bw = [...(state.bodyweight || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!bw.length) return [];
  const ppk = state.settings.nutrition?.proteinPerKg || 2;
  const perDay = new Map();
  for (const e of state.foodLog || []) perDay.set(e.date, (perDay.get(e.date) || 0) + (e.protein || 0));
  return [...perDay.entries()]
    .filter(([iso, p]) => p >= round(ppk * weightOn(bw, iso)))
    .map(([iso]) => iso)
    .sort();
}

/** Longest run of consecutive calendar days in a sorted list of YYYY-MM-DD dates. */
export function longestDayRun(dates) {
  let best = 0, run = 0, prev = null;
  for (const iso of dates) {
    run = prev && Math.round((isoToMs(iso) - isoToMs(prev)) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = iso;
  }
  return best;
}
