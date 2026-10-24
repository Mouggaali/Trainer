// Single source of truth. All persistence goes through this module so a cloud
// backend (Supabase, see docs/DATABASE_SETUP.md) can be plugged in later.
import { EXERCISES } from './exercise-library.js';

const KEY = 'trainer.v1';
const VERSION = 1;
const listeners = new Set();
const saveHooks = new Set();

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function seedTemplates() {
  const S = (n, reps = 10, kgs = []) => Array.from({ length: n }, (_, i) => ({ kg: kgs[i] ?? null, reps }));
  const t = (name, items) => ({
    id: uid(), name, updatedAt: Date.now(),
    exercises: items.map(([exerciseId, sets, restSec]) => ({ exerciseId, sets, restSec })),
  });
  // Taken from the user's Strong templates (see docs/USER_PROFILE.md).
  return [
    t('Maandag', [
      ['squat-machine', S(4, 10, [20, 21.25, 21.25, 21.25]), 150],
      ['bench-press-barbell', S(4, 10, [25, 27.5]), 135],
      ['pendlay-row-barbell', S(4), 120],
      ['seated-overhead-press-dumbbell', S(3), 120],
      ['romanian-deadlift-barbell', S(3), 120],
      ['ab-wheel', S(3), 90],
    ]),
    t('Woensdag', [
      ['deadlift-barbell', S(3), 180],
      ['incline-bench-press-dumbbell', S(3), 120],
      ['pull-up', S(3), 120],
      ['leg-press', S(3), 120],
    ]),
    t('Vrijdag', [
      ['hack-squat', S(3), 150],
      ['pec-deck-machine', S(3), 90],
      ['seated-row-cable', S(3), 120],
      ['overhead-press-barbell', S(3), 120],
    ]),
  ];
}

function defaults() {
  return {
    version: VERSION,
    modifiedAt: 0,
    profile: { name: '' },
    settings: { weeklyGoal: 3, defaultRest: 120, autoApply: true, sound: true },
    customExercises: [],
    exerciseOverrides: {},
    templates: seedTemplates(),
    workouts: [],
    bodyweight: [],
    measurements: [],
    active: null,
  };
}

function migrate(data) {
  const base = defaults();
  const out = { ...base, ...data };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  out.profile = { ...base.profile, ...(data.profile || {}) };
  // Future: if (out.version < 2) { ...; out.version = 2; }
  out.version = VERSION;
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('Kon data niet laden', e);
  }
  return defaults();
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Kon data niet opslaan', e);
  }
}
save();

export const getState = () => state;

export function update(fn, { silent = false } = {}) {
  fn(state);
  state.modifiedAt = Date.now();
  save();
  saveHooks.forEach((h) => h());
  if (!silent) listeners.forEach((l) => l());
}

/** Called after every local change (used by sync.js to schedule an upload). */
export function onSave(fn) {
  saveHooks.add(fn);
}

/** Replace all data with a remote copy without triggering save hooks (no sync echo). */
export function replaceState(data) {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, migrate(data));
  save();
  listeners.forEach((l) => l());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Exercises ----------
export function allExercises() {
  return [
    ...EXERCISES.map((e) => ({ ...e, ...(state.exerciseOverrides[e.id] || {}) })),
    ...state.customExercises,
  ];
}

export function getExercise(id) {
  return allExercises().find((e) => e.id === id) || { id, name: id, equipment: 'other', muscle: 'Overig' };
}

// ---------- Workouts ----------
export function finishedWorkouts() {
  return [...state.workouts].sort((a, b) => b.startedAt - a.startedAt);
}

/** Sessions of one exercise, newest first: { workoutId, date, sets, targetSets } */
export function exerciseSessions(exerciseId) {
  const out = [];
  for (const w of finishedWorkouts()) {
    const e = w.exercises.find((x) => x.exerciseId === exerciseId);
    if (e && e.sets.some((s) => s.done)) {
      out.push({ workoutId: w.id, date: w.startedAt, sets: e.sets, targetSets: e.targetSets });
    }
  }
  return out;
}

export function templateLastPerformed(templateId) {
  const w = finishedWorkouts().find((x) => x.templateId === templateId);
  return w ? w.startedAt : null;
}

// ---------- Backup ----------
export function exportData() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.workouts) || !Array.isArray(data.templates)) {
    throw new Error('Geen geldig back-upbestand');
  }
  delete data.exportedAt;
  update((s) => { Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, migrate(data)); });
}

export function resetData() {
  update((s) => { Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, defaults()); });
}
