// 8 trainer badges (original, FireRed-inspired). Derived from the history like XP — never stored.
import { getState } from '../store.js';
import { startOfWeek } from '../ui.js';
import { computeTeam, EVOLVE_AT } from './xp.js';
import { workoutVolume, bestE1rm } from '../stats.js';

const WEEK = 7 * 86400000;

// glyph: 6×6 pattern drawn in the middle of a 12×12 medal; color/shade = medal metal
export const BADGES = [
  { id: 'start', name: 'Start', color: '#58a8f8', shade: '#2060b0', desc: 'Rond je eerste training af.',
    glyph: ['..ww..', '..ww..', 'wwwwww', '.wwww.', '.w..w.', 'w....w'] },
  { id: 'ritme', name: 'Ritme', color: '#f89038', shade: '#b05010', desc: 'Haal 4 weken op rij je weekdoel.',
    glyph: ['..w...', '..ww..', '.www..', '.wwww.', 'wwwwww', '.wwww.'] },
  { id: 'ijzer', name: 'IJzer', color: '#a8b0c0', shade: '#606878', desc: 'Haal 10 weken op rij je weekdoel.',
    glyph: ['......', 'w....w', 'ww..ww', 'wwwwww', 'ww..ww', 'w....w'] },
  { id: 'evolutie', name: 'Evolutie', color: '#b070e8', shade: '#6830a8', desc: `Laat een monster evolueren (Lv${EVOLVE_AT[0]}).`,
    glyph: ['..ww..', '.wwww.', 'wwwwww', 'wwwwww', '.wwww.', '..ww..'] },
  { id: 'team', name: 'Team', color: '#58c870', shade: '#208838', desc: 'Train je hele team: alle 6 monsters Lv10+.',
    glyph: ['wwwwww', 'wwwwww', 'wwwwww', '.wwww.', '.wwww.', '..ww..'] },
  { id: 'bank', name: 'Bank', color: '#e84838', shade: '#a01810', desc: 'Bench Press (Barbell) e1RM ≥ je lichaamsgewicht.',
    glyph: ['w....w', 'wwwwww', 'w....w', '......', 'wwwwww', '.w..w.'] },
  { id: 'ton', name: 'Ton', color: '#788090', shade: '#383e4c', desc: '5.000 kg volume in één training.',
    glyph: ['.wwww.', '.w..w.', '.wwww.', 'wwwwww', 'wwwwww', '.wwww.'] },
  { id: 'kampioen', name: 'Kampioen', color: '#f8d030', shade: '#b08000', desc: 'Rond 50 trainingen af.',
    glyph: ['wwwwww', 'wwwwww', '.wwww.', '..ww..', '..ww..', '.wwww.'] },
];

/** Longest run of consecutive weeks that reached the weekly goal. */
export function maxGoalStreak(workouts, goal) {
  const counts = new Map();
  for (const w of workouts) {
    const k = startOfWeek(w.startedAt);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const weeks = [...counts.entries()].filter(([, n]) => n >= goal).map(([k]) => k).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const k of weeks) {
    run = prev != null && Math.round((k - prev) / WEEK) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

function latestBodyweight(state) {
  const bw = [...(state.bodyweight || [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return bw ? bw.kg : null;
}

/** All badges with progress: [{ ...badge, earned, cur, goal, text }] */
export function computeBadges(state = getState()) {
  const ws = state.workouts;
  const n = ws.length;
  const goal = state.settings.weeklyGoal || 3;
  const streak = maxGoalStreak(ws, goal);
  const levels = computeTeam(state).team.map((t) => t.level);
  const bw = latestBodyweight(state);
  const bench = Math.max(0, ...ws.flatMap((w) => w.exercises.filter((e) => e.exerciseId === 'bench-press-barbell').map((e) => bestE1rm(e.sets))));
  const ton = Math.max(0, ...ws.map(workoutVolume));
  const r = Math.round;

  const P = {
    start: { cur: n, goal: 1, text: `${Math.min(n, 1)}/1 training` },
    ritme: { cur: streak, goal: 4, text: `Langste reeks: ${streak}/4 weken` },
    ijzer: { cur: streak, goal: 10, text: `Langste reeks: ${streak}/10 weken` },
    evolutie: { cur: Math.max(...levels), goal: EVOLVE_AT[0], text: `Hoogste monster: Lv${Math.max(...levels)}/${EVOLVE_AT[0]}` },
    team: { cur: Math.min(...levels), goal: 10, text: `Laagste monster: Lv${Math.min(...levels)}/10` },
    bank: bw
      ? { cur: bench, goal: bw, text: `Bench e1RM ${r(bench)}/${r(bw)} kg` }
      : { cur: 0, goal: 1, text: 'Log eerst je lichaamsgewicht bij Lichaam.', noData: true },
    ton: { cur: ton, goal: 5000, text: `Beste training: ${r(ton).toLocaleString('nl-NL')}/5.000 kg` },
    kampioen: { cur: n, goal: 50, text: `${n}/50 trainingen` },
  };
  return BADGES.map((b) => {
    const p = P[b.id];
    return { ...b, ...p, earned: !p.noData && p.cur >= p.goal };
  });
}

/** Badges that were earned by this workout (not yet earned before it). */
export function newBadges(workoutId, state = getState()) {
  const w = state.workouts.find((x) => x.id === workoutId);
  if (!w) return [];
  const before = computeBadges({ ...state, workouts: state.workouts.filter((x) => x.id !== w.id && x.startedAt <= w.startedAt) });
  const after = computeBadges({ ...state, workouts: state.workouts.filter((x) => x.startedAt <= w.startedAt) });
  return after.filter((b, i) => b.earned && !before[i].earned);
}

// ---------- Pixel medal ----------
const INK = '#283040';

function medalGrid(b, earned) {
  const fill = earned ? b.color : '#9098a8';
  const shade = earned ? b.shade : '#707888';
  const glyph = earned ? '#f8f8f0' : '#5c6474';
  const px = Array.from({ length: 12 }, () => Array(12).fill(null));
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const d = Math.hypot(x - 5.5, y - 5.5);
      if (d > 5.9) continue;
      if (d > 4.9) px[y][x] = INK;
      else if (earned && x + y <= 5) px[y][x] = '#ffffff';
      else px[y][x] = x + y >= 14 ? shade : fill;
    }
  }
  b.glyph.forEach((row, gy) => [...row].forEach((c, gx) => { if (c === 'w') px[gy + 3][gx + 3] = glyph; }));
  return px;
}

export function badgeSvg(id, earned, size = 40, cls = '') {
  const b = BADGES.find((x) => x.id === id);
  if (!b) return '';
  const px = medalGrid(b, earned);
  let rects = '';
  px.forEach((row, y) => {
    let x = 0;
    while (x < 12) {
      if (!row[x]) { x++; continue; }
      let w = 1;
      while (x + w < 12 && row[x + w] === row[x]) w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${row[x]}"/>`;
      x += w;
    }
  });
  return `<svg class="badge-svg ${cls}" width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
