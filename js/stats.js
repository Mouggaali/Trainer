import { getState, finishedWorkouts, exerciseSessions } from './store.js';
import { e1rm, workingSets } from './progression.js';
import { startOfWeek } from './ui.js';

const WEEK = 7 * 86400000;

export function setVolume(sets) {
  return workingSets(sets).reduce((a, s) => a + (s.kg || 0) * (s.reps || 0), 0);
}

export function workoutVolume(w) {
  return w.exercises.reduce((a, e) => a + setVolume(e.sets), 0);
}

export function workoutSetCount(w) {
  return w.exercises.reduce((a, e) => a + workingSets(e.sets).length, 0);
}

/** Last `n` weeks (oldest first): [{ start, count, volume }] */
export function weeklyStats(n = 8) {
  const now = startOfWeek(Date.now());
  const weeks = Array.from({ length: n }, (_, i) => ({ start: now - (n - 1 - i) * WEEK, count: 0, volume: 0 }));
  for (const w of getState().workouts) {
    const ws = startOfWeek(w.startedAt);
    const wk = weeks.find((x) => x.start === ws);
    if (wk) { wk.count++; wk.volume += workoutVolume(w); }
  }
  return weeks;
}

/** Consecutive weeks reaching the weekly goal (current week counts once reached). */
export function weekStreak() {
  const goal = getState().settings.weeklyGoal || 3;
  const weeks = weeklyStats(104);
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].count >= goal) streak++;
    else if (i === weeks.length - 1) continue; // current week still in progress
    else break;
  }
  return streak;
}

/** Days (0=Mon..6=Sun) trained this week. */
export function trainedDaysThisWeek() {
  const ws = startOfWeek(Date.now());
  const days = new Set();
  for (const w of getState().workouts) {
    if (startOfWeek(w.startedAt) === ws) days.add((new Date(w.startedAt).getDay() + 6) % 7);
  }
  return days;
}

export function bestE1rm(sets) {
  return Math.max(0, ...workingSets(sets).map((s) => e1rm(s.kg, s.reps)));
}

export function bestSet(sets) {
  let best = null;
  for (const s of workingSets(sets)) {
    const v = e1rm(s.kg, s.reps) || (s.reps || 0) / 1000;
    if (!best || v > best.v) best = { ...s, v };
  }
  return best;
}

/** Records for one exercise. */
export function exerciseRecords(exerciseId) {
  const sessions = exerciseSessions(exerciseId);
  const rec = { e1rm: null, heaviest: null, volume: null, reps: null, sessions: sessions.length };
  for (const s of sessions) {
    for (const set of workingSets(s.sets)) {
      const v = e1rm(set.kg, set.reps);
      if (v && (!rec.e1rm || v > rec.e1rm.value)) rec.e1rm = { value: v, set, date: s.date };
      if (set.kg && (!rec.heaviest || set.kg > rec.heaviest.value)) rec.heaviest = { value: set.kg, set, date: s.date };
      if (set.reps && (!rec.reps || set.reps > rec.reps.value)) rec.reps = { value: set.reps, set, date: s.date };
    }
    const vol = setVolume(s.sets);
    if (vol && (!rec.volume || vol > rec.volume.value)) rec.volume = { value: vol, date: s.date };
  }
  return rec;
}

/** Exercises with history, most frequently trained first. */
export function trainedExercises() {
  const counts = new Map();
  for (const w of finishedWorkouts()) {
    for (const e of w.exercises) {
      if (e.sets.some((s) => s.done)) counts.set(e.exerciseId, (counts.get(e.exerciseId) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, count: n }));
}
