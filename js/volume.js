// Weekly volume per muscle group: hard working sets per week, the main volume measure for hypertrophy.
// Rules: docs/TRAINING_PRINCIPLES.md (primary muscle 1 set, secondary muscle 0.5 set, warm-ups don't count).
import { getState, getExercise, allExercises } from './store.js';
import { workingSets } from './progression.js';
import { startOfWeek } from './ui.js';
import { TEAM } from './game/xp.js';

const WEEK = 7 * 86400000;

/** Weekly working-set targets [min, max] per muscle group. */
export const TARGETS = {
  Borst: [10, 20], Rug: [10, 20], Schouders: [10, 20], Armen: [10, 20], Benen: [10, 20], Core: [6, 12],
};

const zero = () => Object.fromEntries(TEAM.map((m) => [m, 0]));

function addExercise(out, e) {
  const n = workingSets(e.sets || []).length;
  if (!n) return;
  const ex = getExercise(e.exerciseId);
  if (ex.muscle in out) out[ex.muscle] += n;
  if (ex.secondary && ex.secondary !== ex.muscle && ex.secondary in out) out[ex.secondary] += n / 2;
}

/** Sets per muscle in the week starting at `weekStart` (finished workouts + the running workout). */
export function weekSets(weekStart, state = getState()) {
  const out = zero();
  const end = weekStart + WEEK;
  for (const w of state.workouts) {
    if (w.startedAt >= weekStart && w.startedAt < end) w.exercises.forEach((e) => addExercise(out, e));
  }
  const a = state.active;
  if (a && a.startedAt >= weekStart && a.startedAt < end) a.exercises.forEach((e) => addExercise(out, e));
  return out;
}

/** The exercise with this primary muscle that the user does most, else the first one in the library. */
function suggestExercise(muscle, state) {
  const counts = new Map();
  for (const w of state.workouts) {
    for (const e of w.exercises) {
      if (getExercise(e.exerciseId).muscle === muscle) counts.set(e.exerciseId, (counts.get(e.exerciseId) || 0) + 1);
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? getExercise(best[0]).name : allExercises().find((x) => x.muscle === muscle)?.name;
}

const fmt = (n) => String(Math.round(n * 2) / 2).replace('.', ',');

/**
 * Volume per muscle for this week (`weeksAgo` = 0) or an earlier week, plus at most 2 trainer tips.
 * rows: [{ muscle, sets, min, max, status: 'low' | 'ok' | 'high' }]
 */
export function volumeReport(weeksAgo = 0, state = getState(), now = Date.now()) {
  const start = startOfWeek(now) - weeksAgo * WEEK;
  const sets = weekSets(start, state);
  const rows = TEAM.map((muscle) => {
    const [min, max] = TARGETS[muscle];
    const v = sets[muscle];
    return { muscle, sets: v, min, max, status: v < min ? 'low' : v > max ? 'high' : 'ok' };
  });

  const tips = [];
  const day = (new Date(now).getDay() + 6) % 7; // 0 = Monday
  const low = rows.filter((r) => r.status === 'low').sort((a, b) => a.sets / a.min - b.sets / b.min)[0];
  if (low) {
    const left = low.min - low.sets;
    const ex = suggestExercise(low.muscle, state);
    const eg = ex ? ` Bijv. ${ex}.` : '';
    if (weeksAgo) tips.push(`${low.muscle} bleef ${fmt(left)} sets onder het minimum van ${low.min}.`);
    else if (day <= 1) tips.push(`${low.muscle}: deze week nog ${fmt(left)} sets te gaan voor de groeizone.${eg}`);
    else tips.push(`${low.muscle}: nog ${fmt(left)} sets tot je minimum van ${low.min}.${eg}`);
  }
  const high = rows.filter((r) => r.status === 'high').sort((a, b) => b.sets / b.max - a.sets / a.max)[0];
  if (high) tips.push(`${high.muscle} zit boven ${high.max} sets: meer levert weinig extra op, herstel gaat voor.`);
  if (!tips.length) tips.push('Alle spiergroepen in de groeizone. Sterk bezig!');
  return { rows, tips, weekStart: start };
}
