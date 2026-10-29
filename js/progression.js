// Weight recommendation engine. Rules are documented in docs/TRAINING_PRINCIPLES.md.

// [upper body, lower body] increment in kg
const BASE_INC = {
  barbell: [2.5, 5], smith: [2.5, 5], machine: [2.5, 5], cable: [2.5, 2.5],
  dumbbell: [2, 2], kettlebell: [4, 4], bodyweight: [2.5, 2.5], other: [2.5, 2.5],
};
const ROUND = {
  barbell: 1.25, smith: 1.25, machine: 1.25, cable: 1.25,
  dumbbell: 1, kettlebell: 2, bodyweight: 1.25, other: 0.5,
};
const DELOAD_AFTER = 3; // consecutive missed sessions at the same top weight

const r2 = (v) => Math.round(v * 100) / 100;
export const roundTo = (v, step) => r2(Math.round(v / step) * step);
const fmt = (v) => String(r2(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function e1rm(kg, reps) {
  if (!kg || !reps) return 0;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

export function incrementFor(ex, topKg) {
  if (ex.increment) return ex.increment;
  const [up, low] = BASE_INC[ex.equipment] || BASE_INC.other;
  let inc = ex.lower ? low : up;
  if (ex.equipment !== 'dumbbell' && ex.equipment !== 'kettlebell' && topKg > 0) {
    const step = ROUND[ex.equipment] || 0.5;
    const cap = Math.max(step, Math.floor((topKg * 0.1) / step) * step);
    inc = Math.min(inc, cap);
  }
  return r2(inc);
}

export const workingSets = (sets) => sets.filter((s) => s.done && !s.warmup);
const targetReps = (s) => s?.target?.reps ?? s?.reps ?? 0;
const topKg = (session) => Math.max(0, ...workingSets(session.sets).map((s) => s.kg || 0));
/** Average RIR (reps in reserve, 3 = "3+") of the sets that have one; null when none recorded. */
const avgRir = (sets) => {
  const v = sets.map((s) => s.rir).filter((r) => r != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Double step for an "easy" session, but never more than 15% of the weight (small cable/dumbbell weights). */
const bigStep = (ex, top, delta) => (!ex.increment && delta * 2 <= top * 0.15 ? r2(delta * 2) : delta);

/** A rep range {min, max} or null. */
export const validRange = (r) => (r && r.min > 0 && r.max >= r.min ? r : null);

/** The session reached its own targets (all planned working sets, each at its target reps). Used by XP too. */
export function sessionHit(session) {
  const w = workingSets(session.sets);
  if (!w.length) return false;
  const need = session.targetSets || w.length;
  return w.length >= need && w.every((s) => (s.reps || 0) >= targetReps(s));
}

/** Range mode: every planned working set reached the top of the range. */
function rangeTopped(session, range) {
  const w = workingSets(session.sets);
  const need = session.targetSets || w.length;
  return w.length > 0 && w.length >= need && w.every((s) => (s.reps || 0) >= range.max);
}

/** Range mode: a set fell below the bottom of the range, or planned sets are missing. */
function rangeMissed(session, range) {
  const w = workingSets(session.sets);
  const need = session.targetSets || w.length;
  return w.length < need || w.some((s) => (s.reps || 0) < range.min);
}

/**
 * @param ex        exercise (equipment, lower, increment)
 * @param sessions  previous sessions of this exercise, newest first
 * @param planned   planned sets [{kg, reps, warmup}] (template)
 * @param range     optional rep range {min, max} → double progression (reps first, then weight)
 * @returns {{type:'new'|'increase'|'reps'|'hold'|'deload', title, message, delta, range, sets:[{kg, reps, warmup}]}}
 */
export function recommend(ex, sessions, planned, range = null) {
  planned = planned?.length ? planned : [{ kg: null, reps: 10 }, { kg: null, reps: 10 }, { kg: null, reps: 10 }];
  range = validRange(range);
  if (range) return recommendRange(ex, sessions, planned, range);

  if (!sessions.length) {
    return {
      type: 'new',
      title: 'Eerste sessie',
      message: 'Kies een gewicht waarbij je nog 1–2 reps over hebt. Daarna bepaal ik de stappen.',
      delta: 0,
      range: null,
      sets: planned.map((p) => ({ kg: p.kg, reps: p.reps, warmup: !!p.warmup })),
    };
  }

  const last = sessions[0];
  const lastW = workingSets(last.sets);
  const top = topKg(last);
  const bodyweight = top === 0;
  const hit = sessionHit(last);
  const rir = avgRir(lastW);

  let type, title, message, delta = 0;
  if (hit) {
    type = 'increase';
    if (bodyweight) {
      const maxReps = Math.max(...lastW.map((s) => s.reps || 0));
      title = '+1 rep per set';
      message = maxReps >= 15
        ? 'Je zit op 15+ reps. Tijd om gewicht toe te voegen (bv. 2.5–5 kg) en terug naar 8 reps.'
        : 'Alle sets gehaald. Probeer per set 1 rep meer.';
    } else {
      const surplus = Math.min(...lastW.map((s) => (s.reps || 0) - targetReps(s)));
      const easy = surplus >= 3 || (rir != null && rir >= 3);
      delta = incrementFor(ex, top);
      if (easy) delta = bigStep(ex, top, delta);
      title = `+${fmt(delta)} kg`;
      if (surplus >= 3) message = `Ruim gehaald (${surplus}+ reps over op elke set). Grotere stap omhoog.`;
      else if (rir != null && rir >= 3) message = 'Alle reps gehaald met 3+ reps over. Grotere stap omhoog.';
      else if (rir === 0) message = 'Gehaald, maar tot het gaatje. Kleine stap omhoog; houd 1–2 reps over voor herstel.';
      else message = 'Alle sets en reps gehaald vorige keer. Tijd voor meer gewicht.';
    }
  } else {
    let streak = 0;
    for (const s of sessions) {
      if (!sessionHit(s) && topKg(s) === top) streak++;
      else break;
    }
    if (streak >= DELOAD_AFTER && !bodyweight) {
      type = 'deload';
      title = 'Deload −10%';
      message = `${streak}× achter elkaar niet gehaald op ${fmt(top)} kg. Even terug en sterker opbouwen.`;
    } else {
      type = 'hold';
      const done = lastW.reduce((a, s) => a + (s.reps || 0), 0);
      const goal = lastW.reduce((a, s) => a + targetReps(s), 0) || 1;
      title = 'Zelfde gewicht';
      message = done / goal >= 0.9
        ? 'Bijna alle reps gehaald. Zelfde gewicht, pak nu álle reps.'
        : 'Nog niet alle sets gehaald. Zelfde gewicht, focus op techniek en volle reps.';
    }
  }

  const step = ROUND[ex.equipment] || 0.5;
  let wi = 0;
  const sets = planned.map((p) => {
    if (p.warmup) return { kg: p.kg, reps: p.reps, warmup: true };
    const base = lastW.length ? lastW[Math.min(wi, lastW.length - 1)] : null;
    wi++;
    const baseKg = base?.kg ?? p.kg;
    const goalReps = p.reps ?? (targetReps(base) || 10);
    let kg = baseKg;
    let reps = goalReps;
    if (baseKg) {
      if (type === 'increase') kg = r2(baseKg + delta);
      if (type === 'deload') kg = roundTo(baseKg * 0.9, step);
    }
    if (bodyweight) reps = type === 'increase' ? (base?.reps ?? goalReps) + 1 : Math.max(goalReps, targetReps(base));
    return { kg: kg ?? null, reps, warmup: false };
  });

  return { type, title, message, delta, range: null, sets };
}

/** Double progression inside a rep range: add reps until every set hits `max`, then add weight and go back to `min`. */
function recommendRange(ex, sessions, planned, range) {
  const { min, max } = range;
  if (!sessions.length) {
    return {
      type: 'new',
      title: 'Eerste sessie',
      message: `Kies een gewicht waarmee je ${min}–${max} reps haalt met nog 1–2 reps over.`,
      delta: 0,
      range,
      sets: planned.map((p) => ({ kg: p.kg, reps: p.warmup ? p.reps : clamp(p.reps ?? min, min, max), warmup: !!p.warmup })),
    };
  }

  const last = sessions[0];
  const lastW = workingSets(last.sets);
  const top = topKg(last);
  const bodyweight = top === 0;
  const rir = avgRir(lastW);

  let type, title, message, delta = 0, bump = 1;
  if (rangeTopped(last, range)) {
    type = 'increase';
    if (bodyweight) {
      title = 'Bovenkant bereikt';
      message = `Alle sets op ${max} reps. Voeg gewicht toe (bv. 2.5–5 kg) en begin weer op ${min} reps.`;
    } else {
      delta = incrementFor(ex, top);
      if (rir != null && rir >= 3) delta = bigStep(ex, top, delta);
      title = `+${fmt(delta)} kg · ${min} reps`;
      message = rir != null && rir >= 3
        ? `Alle sets op ${max} reps met 3+ reps over. Grotere stap omhoog, terug naar ${min} reps.`
        : `Alle sets op ${max} reps gehaald. Meer gewicht en terug naar ${min} reps.`;
    }
  } else if (rangeMissed(last, range)) {
    let streak = 0;
    for (const s of sessions) {
      if (rangeMissed(s, range) && topKg(s) === top) streak++;
      else break;
    }
    if (streak >= DELOAD_AFTER && !bodyweight) {
      type = 'deload';
      title = 'Deload −10%';
      message = `${streak}× onder de ${min} reps op ${fmt(top)} kg. Even terug en sterker opbouwen.`;
    } else {
      type = 'hold';
      title = `Zelfde gewicht · ${min}+ reps`;
      message = `Niet elke set haalde ${min} reps. Zelfde gewicht, eerst alle sets binnen ${min}–${max} reps.`;
    }
  } else {
    type = 'reps';
    bump = rir != null && rir >= 3 ? 2 : 1;
    title = `+${bump} rep${bump > 1 ? 's' : ''} per set`;
    message = bump > 1
      ? `Ruim binnen ${min}–${max} reps met 3+ reps over. Zelfde gewicht, 2 reps meer per set.`
      : `Zelfde gewicht, probeer per set 1 rep meer (doel: ${max} reps op alle sets).`;
  }

  const step = ROUND[ex.equipment] || 0.5;
  let wi = 0;
  const sets = planned.map((p) => {
    if (p.warmup) return { kg: p.kg, reps: p.reps, warmup: true };
    const base = lastW.length ? lastW[Math.min(wi, lastW.length - 1)] : null;
    wi++;
    const baseKg = base?.kg ?? p.kg;
    let kg = baseKg;
    let reps = min;
    if (type === 'increase') {
      if (baseKg) kg = r2(baseKg + delta);
      reps = bodyweight ? max : min;
    } else if (type === 'deload') {
      if (baseKg) kg = roundTo(baseKg * 0.9, step);
    } else if (type === 'reps') {
      reps = clamp((base?.reps ?? min) + bump, min, max);
    }
    return { kg: kg ?? null, reps, warmup: false };
  });

  return { type, title, message, delta, range, sets };
}
