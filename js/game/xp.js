// Monster XP engine. XP is derived from the workout history (never stored), so past workouts count
// and deleting a workout stays consistent. Rules: docs/GAME_DESIGN.md.
import { getState, getExercise } from '../store.js';
import { sessionHit, workingSets } from '../progression.js';
import { startOfWeek } from '../ui.js';

export const TEAM = ['Borst', 'Rug', 'Schouders', 'Armen', 'Benen', 'Core'];
export const XP = { set: 10, secondary: 5, exercise: 15, workout: 25, pr: 50, weekGoal: 50 };
export const WEEK_SET_CAP = 20; // working sets per muscle per week that earn set-XP
export const MAX_LEVEL = 100;
export const EVOLVE_AT = [16, 36];

/** Total XP needed to reach `level`. */
export const xpForLevel = (level) => (level <= 1 ? 0 : 6 * level * level);

export function levelFor(xp) {
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(Math.sqrt(xp / 6))));
}

export function levelInfo(xp) {
  const level = levelFor(xp);
  const base = xpForLevel(level);
  const next = level >= MAX_LEVEL ? null : xpForLevel(level + 1);
  return {
    xp,
    level,
    into: xp - base,
    needed: next == null ? 0 : next - base,
    form: level >= EVOLVE_AT[1] ? 2 : level >= EVOLVE_AT[0] ? 1 : 0,
  };
}

const zero = () => Object.fromEntries(TEAM.map((m) => [m, 0]));

/** XP earned by one workout. `ctx` carries weekly counters across chronological workouts. */
function gainsFor(w, ctx, goal) {
  const gains = zero();
  const add = (m, v) => { if (m in gains) gains[m] += v; };
  const week = startOfWeek(w.startedAt);
  if (ctx.week !== week) Object.assign(ctx, { week, sets: zero(), workouts: 0, goalHit: false });

  const setsPer = zero();
  for (const e of w.exercises) {
    const ex = getExercise(e.exerciseId);
    const ws = workingSets(e.sets);
    for (let i = 0; i < ws.length; i++) {
      if (!(ex.muscle in ctx.sets)) break; // 'Overig' earns nothing
      if (ctx.sets[ex.muscle] < WEEK_SET_CAP) {
        add(ex.muscle, XP.set);
        if (ex.secondary && ex.secondary !== ex.muscle) add(ex.secondary, XP.secondary);
      }
      ctx.sets[ex.muscle]++;
      setsPer[ex.muscle]++;
    }
    if (ws.length && sessionHit({ sets: e.sets, targetSets: e.targetSets })) add(ex.muscle, XP.exercise);
    if (w.prs?.includes(e.exerciseId)) add(ex.muscle, XP.pr);
  }

  const total = TEAM.reduce((a, m) => a + setsPer[m], 0);
  if (total) for (const m of TEAM) add(m, Math.round((XP.workout * setsPer[m]) / total));

  ctx.workouts++;
  let weekGoal = false;
  if (!ctx.goalHit && ctx.workouts >= goal) {
    ctx.goalHit = true;
    weekGoal = true;
    for (const m of TEAM) add(m, XP.weekGoal);
  }
  return { gains, weekGoal };
}

function run(state, onWorkout) {
  const goal = state.settings.weeklyGoal || 3;
  const totals = zero();
  const ctx = {};
  for (const w of [...state.workouts].sort((a, b) => a.startedAt - b.startedAt)) {
    const { gains, weekGoal } = gainsFor(w, ctx, goal);
    onWorkout?.(w, gains, weekGoal, totals);
    for (const m of TEAM) totals[m] += gains[m];
  }
  return { totals, ctx };
}

/** Current team: per muscle level info + sets this week, plus trainer level. */
export function computeTeam(state = getState()) {
  const { totals, ctx } = run(state);
  const thisWeek = ctx.week === startOfWeek(Date.now());
  const team = TEAM.map((m) => ({ muscle: m, ...levelInfo(totals[m]), setsThisWeek: thisWeek ? ctx.sets[m] : 0 }));
  const totalXp = TEAM.reduce((a, m) => a + totals[m], 0);
  return { team, totalXp, trainerLevel: levelFor(totalXp / TEAM.length) };
}

/** What one finished workout did for each monster (for the end-of-workout screen). */
export function workoutGains(workoutId, state = getState()) {
  let result = null;
  run(state, (w, gains, weekGoal, totals) => {
    if (w.id !== workoutId) return;
    result = {
      weekGoal,
      monsters: TEAM.filter((m) => gains[m] > 0).map((m) => {
        const before = levelInfo(totals[m]);
        const after = levelInfo(totals[m] + gains[m]);
        return { muscle: m, gained: gains[m], before, after, leveledUp: after.level > before.level, evolved: after.form > before.form };
      }),
    };
  });
  return result;
}

/** XP a newly checked working set of this exercise earns right now (respects the weekly cap). */
export function setXpPreview(exerciseId, state = getState()) {
  const ex = getExercise(exerciseId);
  if (!TEAM.includes(ex.muscle)) return null;
  const week = startOfWeek(Date.now());
  let count = 0;
  const countIn = (w) => {
    for (const e of w.exercises) {
      if (getExercise(e.exerciseId).muscle === ex.muscle) count += workingSets(e.sets).length;
    }
  };
  state.workouts.filter((w) => startOfWeek(w.startedAt) === week).forEach(countIn);
  if (state.active) countIn(state.active); // includes the set just checked
  const xp = count <= WEEK_SET_CAP ? XP.set : 0;
  return { muscle: ex.muscle, xp, secondary: xp && ex.secondary ? { muscle: ex.secondary, xp: XP.secondary } : null, capped: !xp };
}
