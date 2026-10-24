import { getState, update, uid, getExercise, exerciseSessions } from '../store.js';
import { esc, on, go, icon, fmtNum, fmtElapsed, fmtDate, fmtDuration, fmtVolume, choose, sheetPromise, toast, num, unlockAudio, setLabel, xpPop, sfx, dialogSequence } from '../ui.js';
import { setXpPreview, workoutGains, XP } from '../game/xp.js';
import { monsterSprite, monsterName } from '../game/monsters.js';
import { expBar, pct } from './team.js';
import { recommend } from '../progression.js';
import { bestE1rm, workoutVolume, workoutSetCount } from '../stats.js';
import { pickExercise, plannedSetsFor } from './exercises.js';
import { pickRest, restLabel } from './templates.js';

function buildExercise(exerciseId, planned, restSec) {
  const s = getState();
  const ex = getExercise(exerciseId);
  const rec = recommend(ex, exerciseSessions(exerciseId), planned);
  const auto = s.settings.autoApply && rec.type !== 'new';
  const sets = planned.map((p, i) => {
    const r = rec.sets[i] || {};
    const kg = auto ? r.kg ?? p.kg : p.kg;
    const reps = auto ? r.reps ?? p.reps : p.reps;
    return { id: uid(), kg: kg ?? null, reps: reps ?? null, done: false, warmup: !!p.warmup, target: { kg: r.kg ?? p.kg ?? null, reps: r.reps ?? p.reps ?? null } };
  });
  return { uid: uid(), exerciseId, restSec: restSec ?? s.settings.defaultRest, targetSets: planned.filter((p) => !p.warmup).length, sets, rec };
}

export async function startWorkout(templateId) {
  const s = getState();
  if (s.active) {
    const v = await choose('Er loopt al een training', `"${s.active.name}" is nog bezig.`, [
      { label: 'Ga verder met huidige', value: 'resume', style: 'btn-primary' },
      { label: 'Huidige annuleren en nieuwe starten', value: 'replace', style: 'btn-danger-soft' },
      { label: 'Terug', value: '' },
    ]);
    if (v === 'resume') return go('#/active');
    if (v !== 'replace') return;
  }
  const t = templateId ? s.templates.find((x) => x.id === templateId) : null;
  const active = {
    id: uid(),
    templateId: t ? t.id : null,
    name: t ? t.name : 'Training',
    startedAt: Date.now(),
    rest: null,
    exercises: t ? t.exercises.map((te) => buildExercise(te.exerciseId, te.sets, te.restSec)) : [],
  };
  update((st) => { st.active = active; });
  go('#/active');
}

const REC_UI = {
  increase: { cls: 'up', icon: 'trendUp' },
  hold: { cls: 'hold', icon: 'equal' },
  deload: { cls: 'down', icon: 'trendDown' },
  new: { cls: 'new', icon: 'sparkle' },
};

function recApplied(we) {
  return we.sets.every((st, i) => st.done || st.warmup || !we.rec.sets[i]
    || (st.kg === we.rec.sets[i].kg && st.reps === we.rec.sets[i].reps));
}

function exerciseCard(we, ei, a) {
  const ex = getExercise(we.exerciseId);
  const last = exerciseSessions(we.exerciseId).find((x) => x.workoutId !== a.id);
  const r = we.rec;
  const ui = REC_UI[r?.type] || REC_UI.new;
  const first = r?.sets.filter((x) => !x.warmup).reduce((a, x) => (!a || (x.kg || 0) > (a.kg || 0) ? x : a), null);
  const summary = first ? (first.kg ? `${fmtNum(first.kg)} kg × ${first.reps ?? '?'}` : first.reps ? `${first.reps} reps` : '') : '';
  const banner = r ? `
    <div class="rec rec-${ui.cls}">
      <div class="rec-icon">${icon(ui.icon)}</div>
      <div class="rec-body"><div class="rec-title">${esc(r.title)}${summary ? ` · ${summary}` : ''}</div>
      <div class="rec-text">${esc(r.message)}</div></div>
      ${r.type !== 'new' && !recApplied(we) ? `<button class="btn btn-soft btn-sm" data-action="wo-apply-rec" data-ex="${ei}">Toepassen</button>` : ''}
    </div>` : '';

  const rows = we.sets.map((st, si) => {
    const prev = last?.sets[si];
    const prevTxt = prev ? (prev.kg ? `${fmtNum(prev.kg)} kg × ${prev.reps ?? 0}` : `${prev.reps ?? 0} reps`) : '—';
    return `
      <div class="set-row ${st.done ? 'done' : ''} ${st.warmup ? 'warmup' : ''}">
        <button class="set-num" data-action="wo-set-menu" data-ex="${ei}" data-set="${si}">${setLabel(we.sets, si)}</button>
        <div class="set-prev">${prevTxt}</div>
        <input class="set-input" inputmode="decimal" enterkeyhint="next" data-input="wo-set" data-live data-field="kg" data-ex="${ei}" data-set="${si}" value="${fmtNum(st.kg)}" placeholder="${prev?.kg ? fmtNum(prev.kg) : '–'}">
        <input class="set-input" inputmode="numeric" enterkeyhint="done" data-input="wo-set" data-live data-field="reps" data-ex="${ei}" data-set="${si}" value="${st.reps ?? ''}" placeholder="${prev?.reps ?? st.target?.reps ?? '–'}">
        <button class="set-check" data-action="wo-check" data-ex="${ei}" data-set="${si}" aria-label="Set afvinken">${icon('check')}</button>
      </div>`;
  }).join('');

  return `
    <section class="card ex-card">
      <div class="ex-head">
        <button class="ex-name ex-link" data-action="go" data-href="#/exercise/${esc(we.exerciseId)}">${esc(ex.name)}</button>
        <button class="chip chip-btn" data-action="wo-rest" data-ex="${ei}">${icon('timer')} ${restLabel(we.restSec)}</button>
        <button class="icon-btn icon-btn-sm" data-action="wo-ex-menu" data-ex="${ei}" aria-label="Opties">${icon('more')}</button>
      </div>
      ${banner}
      <div class="set-table">
        <div class="set-row set-head"><span>Set</span><span>Vorige</span><span>kg</span><span>Reps</span><span>${icon('check')}</span></div>
        ${rows}
      </div>
      <button class="btn btn-ghost btn-block btn-sm" data-action="wo-add-set" data-ex="${ei}">${icon('plus')} Set toevoegen (${restLabel(we.restSec)})</button>
    </section>`;
}

export function renderActive() {
  const a = getState().active;
  if (!a) {
    return `<div class="empty-state">${icon('dumbbell')}<p>Geen actieve training.</p>
      <button class="btn btn-primary" data-action="go" data-href="#/workout">Naar training</button></div>`;
  }
  const all = a.exercises.flatMap((e) => e.sets);
  const done = all.filter((x) => x.done).length;
  return `
    <header class="wo-top">
      <div class="wo-top-left">
        <button class="icon-btn" data-action="go" data-href="#/workout" aria-label="Minimaliseren">${icon('chevronDown')}</button>
        <button class="icon-btn danger" data-action="wo-cancel" aria-label="Training annuleren">${icon('x')}</button>
      </div>
      <div class="wo-clock" data-elapsed="${a.startedAt}">${fmtElapsed(Date.now() - a.startedAt)}</div>
      <button class="btn btn-green btn-sm" data-action="wo-finish">Klaar</button>
    </header>
    <div class="wo-progress"><i style="width:${all.length ? (done / all.length) * 100 : 0}%"></i></div>
    <input class="title-input" data-input="wo-name" data-live value="${esc(a.name)}">
    <div class="muted small wo-date">${icon('calendar')} ${fmtDate(a.startedAt, { weekday: 'long', day: 'numeric', month: 'long' })} · ${done}/${all.length} sets</div>
    ${a.exercises.map((we, ei) => exerciseCard(we, ei, a)).join('')}
    <button class="btn btn-soft btn-block" data-action="wo-add-ex">${icon('plus')} Oefening toevoegen</button>
    <button class="btn btn-danger-soft btn-block" data-action="wo-cancel">Training annuleren</button>`;
}

const ix = (el) => ({ ex: Number(el.dataset.ex), set: Number(el.dataset.set) });

function prevBest(exerciseId, workoutId) {
  return Math.max(0, ...exerciseSessions(exerciseId).filter((x) => x.workoutId !== workoutId).map((x) => bestE1rm(x.sets)));
}

async function finishWorkout() {
  const a = getState().active;
  const all = a.exercises.flatMap((e) => e.sets);
  const done = all.filter((x) => x.done).length;
  if (!done) {
    const v = await choose('Nog geen sets afgevinkt', 'Vink sets af met het groene vinkje. Wil je de training annuleren?', [
      { label: 'Training annuleren', value: 'cancel', style: 'btn-danger' },
      { label: 'Terug naar training', value: '' },
    ]);
    if (v === 'cancel') { update((s) => { s.active = null; }); go('#/workout'); }
    return;
  }
  let mode = 'drop';
  if (done < all.length) {
    const v = await choose(`${all.length - done} set(s) niet afgevinkt`, 'Wat wil je met deze sets doen?', [
      { label: 'Niet-afgevinkte sets weglaten', value: 'drop', style: 'btn-primary' },
      { label: 'Alles als voltooid markeren', value: 'complete' },
      { label: 'Terug naar training', value: '' },
    ]);
    if (!v) return;
    mode = v;
  }

  const w = structuredClone(a);
  w.finishedAt = Date.now();
  delete w.rest;
  w.exercises = w.exercises.map(({ rec, ...e }) => ({
    ...e,
    sets: e.sets
      .map((x) => (mode === 'complete' && !x.done && x.reps != null ? { ...x, done: true } : x))
      .filter((x) => x.done),
  })).filter((e) => e.sets.length);
  const prs = w.exercises.filter((e) => {
    const before = prevBest(e.exerciseId, w.id);
    return before > 0 && bestE1rm(e.sets) > before + 0.01;
  }).map((e) => e.exerciseId);
  w.prs = prs;

  update((s) => { s.workouts.push(w); s.active = null; });

  const tpl = w.templateId && getState().templates.find((t) => t.id === w.templateId);
  if (tpl) {
    const v = await choose('Template bijwerken?', `"${tpl.name}" bijwerken met de oefeningen, sets en gewichten van vandaag? Je doel-reps blijven staan.`, [
      { label: 'Bijwerken', value: 'yes', style: 'btn-primary' },
      { label: 'Niet bijwerken', value: '' },
    ]);
    if (v === 'yes') {
      update((s) => {
        const t = s.templates.find((x) => x.id === w.templateId);
        const toTpl = (e) => ({
          exerciseId: e.exerciseId,
          restSec: e.restSec,
          sets: e.sets.map((x) => ({ kg: x.kg, reps: x.target?.reps ?? x.reps, ...(x.warmup ? { warmup: true } : {}) })),
        });
        // Update performed exercises in place; skipped ones stay as they were; new ones are appended.
        const done = new Map(w.exercises.map((e) => [e.exerciseId, e]));
        t.exercises = t.exercises.map((te) => {
          const e = done.get(te.exerciseId);
          if (!e) return te;
          done.delete(te.exerciseId);
          return toTpl(e);
        }).concat([...done.values()].map(toTpl));
        t.updatedAt = Date.now();
      });
    }
  }
  showSummary(w);
}

/** FireRed-style EXP / level-up / evolution sequence after a workout. */
async function playGains(w) {
  const g = workoutGains(w.id);
  if (!g || !g.monsters.length) return;
  const nicks = getState().profile.monsterNames || {};
  const sound = getState().settings.sound;
  const stage = (m, form, lvl, into, needed, extra = '') => `
    <div class="gain-card ${extra}">
      <div class="gain-sprite">${monsterSprite(m, form, 128, 'sprite')}</div>
      <div class="gain-info"><div class="row-between"><b>${esc(monsterName(m, form, nicks))}</b><b>Lv${lvl}</b></div>
      ${expBar(into, needed)}</div>
    </div>`;
  const steps = [];
  if (g.weekGoal) {
    steps.push({ text: `Weekdoel gehaald! Je hele team krijgt ${XP.weekGoal} EXP. extra!`, stage: '<div class="gain-banner">★ WEEKDOEL ★</div>', onShow: () => sound && sfx('levelup') });
  }
  for (const r of g.monsters) {
    const { before: b, after: a } = r;
    const name = monsterName(r.muscle, b.form, nicks);
    steps.push({
      text: `${name} kreeg ${r.gained} EXP. punten!`,
      stage: stage(r.muscle, b.form, b.level, b.into, b.needed),
      onShow: (el) => {
        const bar = el.querySelector('.exp-bar > i');
        if (!bar) return;
        bar.style.width = r.leveledUp ? '100%' : `${pct(a.into, a.needed)}%`;
        if (sound) sfx('xp');
      },
    });
    if (r.leveledUp) {
      steps.push({
        text: `${name} is gegroeid naar Lv${a.level}!`,
        stage: stage(r.muscle, b.form, a.level, a.into, a.needed),
        onShow: () => sound && sfx('levelup'),
      });
    }
    if (r.evolved) {
      const newName = monsterName(r.muscle, a.form, nicks);
      steps.push({ text: `Wat? ${name} evolueert!`, stage: stage(r.muscle, b.form, a.level, a.into, a.needed, 'evolving') });
      steps.push({
        text: `Gefeliciteerd! ${name} is geëvolueerd tot ${newName}!`,
        stage: `<div class="evolve-flash"></div>${stage(r.muscle, a.form, a.level, a.into, a.needed)}`,
        onShow: () => sound && sfx('evolve'),
      });
    }
  }
  await dialogSequence(steps);
}

async function showSummary(w) {
  await playGains(w);
  const prs = w.prs.map((id) => `<li>${icon('trophy')} ${esc(getExercise(id).name)} <span class="muted">· ${fmtNum(bestE1rm(w.exercises.find((e) => e.exerciseId === id).sets), 1)} kg e1RM</span></li>`).join('');
  const { result } = sheetPromise(`
    <div class="summary">
      <div class="summary-emoji">💪</div>
      <h3 class="sheet-title">Training voltooid!</h3>
      <p class="muted">${esc(w.name)} · ${fmtDate(w.startedAt, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div class="stat-grid stat-grid-3">
        <div class="stat"><div class="stat-label">Duur</div><div class="stat-val">${fmtDuration(w.finishedAt - w.startedAt)}</div></div>
        <div class="stat"><div class="stat-label">Volume</div><div class="stat-val">${fmtVolume(workoutVolume(w))}</div></div>
        <div class="stat"><div class="stat-label">Sets</div><div class="stat-val">${workoutSetCount(w)}</div></div>
      </div>
      ${prs ? `<h4 class="pr-title">Nieuwe records</h4><ul class="pr-list">${prs}</ul>` : ''}
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="detail">Bekijk details</button>
        <button class="btn btn-secondary btn-block" data-action="sheet-resolve" data-value="">Sluiten</button>
      </div>
    </div>`);
  const v = await result;
  go(v === 'detail' ? `#/history/${w.id}` : '#/workout');
}

on({
  'wo-name': (el) => update((s) => { s.active.name = el.value; }, { silent: true }),
  'wo-set': (el) => {
    const { ex, set } = ix(el);
    const v = num(el.value);
    update((s) => {
      const st = s.active.exercises[ex].sets[set];
      st[el.dataset.field] = el.dataset.field === 'reps' && v != null ? Math.round(v) : v;
    }, { silent: true });
  },
  'wo-check': (el) => {
    unlockAudio();
    const { ex, set } = ix(el);
    const a = getState().active;
    const we = a.exercises[ex];
    const st = we.sets[set];
    const rect = el.getBoundingClientRect();
    if (!st.done) {
      const prev = exerciseSessions(we.exerciseId).find((x) => x.workoutId !== a.id)?.sets[set];
      const reps = st.reps ?? prev?.reps ?? st.target?.reps;
      if (reps == null) { toast('Vul eerst het aantal reps in'); return; }
      update((s) => {
        const t = s.active.exercises[ex].sets[set];
        t.reps = reps;
        if (t.kg == null && prev?.kg) t.kg = prev.kg;
        t.done = true;
        s.active.rest = we.restSec > 0 ? { endsAt: Date.now() + we.restSec * 1000, total: we.restSec } : null;
      });
      if (navigator.vibrate) navigator.vibrate(30);
      if (!st.warmup) {
        const p = setXpPreview(we.exerciseId);
        if (p) {
          xpPop(rect, p.capped ? 'MAX deze week' : `+${p.xp} EXP.`);
          if (p.xp && getState().settings.sound) sfx('xp');
        }
      }
    } else {
      update((s) => { s.active.exercises[ex].sets[set].done = false; });
    }
  },
  'wo-set-menu': async (el) => {
    const { ex, set } = ix(el);
    const st = getState().active.exercises[ex].sets[set];
    const v = await choose(`Set ${setLabel(getState().active.exercises[ex].sets, set)}`, null, [
      { label: st.warmup ? 'Markeer als werkset' : 'Markeer als warming-up', value: 'warm', icon: 'flame' },
      { label: 'Set verwijderen', value: 'del', icon: 'trash', style: 'btn-danger-soft' },
      { label: 'Annuleren', value: '' },
    ]);
    if (v === 'warm') update((s) => { const t = s.active.exercises[ex].sets[set]; t.warmup = !t.warmup; });
    if (v === 'del') update((s) => { s.active.exercises[ex].sets.splice(set, 1); });
  },
  'wo-add-set': (el) => {
    const ex = Number(el.dataset.ex);
    update((s) => {
      const sets = s.active.exercises[ex].sets;
      const last = sets.at(-1);
      sets.push({ id: uid(), kg: last?.kg ?? null, reps: last?.reps ?? null, done: false, warmup: false, target: { ...(last?.target || { kg: null, reps: 10 }) } });
    });
  },
  'wo-apply-rec': (el) => {
    const ex = Number(el.dataset.ex);
    update((s) => {
      const we = s.active.exercises[ex];
      we.sets.forEach((st, i) => {
        const r = we.rec.sets[i];
        if (r && !st.done && !st.warmup) { st.kg = r.kg; st.reps = r.reps; }
      });
    });
  },
  'wo-rest': async (el) => {
    const ex = Number(el.dataset.ex);
    const v = await pickRest(getState().active.exercises[ex].restSec);
    if (v != null) update((s) => { s.active.exercises[ex].restSec = v; });
  },
  'wo-ex-menu': async (el) => {
    const i = Number(el.dataset.ex);
    const we = getState().active.exercises[i];
    const v = await choose(getExercise(we.exerciseId).name, null, [
      { label: 'Progressie bekijken', value: 'view', icon: 'trendUp' },
      { label: 'Omhoog', value: 'up', icon: 'up' },
      { label: 'Omlaag', value: 'down', icon: 'down' },
      { label: 'Oefening verwijderen', value: 'del', icon: 'trash', style: 'btn-danger-soft' },
      { label: 'Annuleren', value: '' },
    ]);
    if (v === 'view') return go(`#/exercise/${we.exerciseId}`);
    update((s) => {
      const list = s.active.exercises;
      if (v === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      if (v === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      if (v === 'del') list.splice(i, 1);
    });
  },
  'wo-add-ex': async () => {
    const id = await pickExercise();
    if (!id) return;
    const we = buildExercise(id, plannedSetsFor(id), null);
    update((s) => { s.active.exercises.push(we); });
  },
  'wo-finish': () => finishWorkout(),
  'wo-cancel': async () => {
    const a = getState().active;
    const done = a ? a.exercises.flatMap((e) => e.sets).filter((x) => x.done).length : 0;
    const text = done
      ? `Je hebt al ${done} set(s) afgevinkt. Bij annuleren wordt niets opgeslagen en krijg je geen EXP.`
      : 'Per ongeluk gestart? Er wordt niets opgeslagen.';
    const v = await choose('Training annuleren?', text, [
      { label: 'Ja, annuleren', value: 'yes', style: 'btn-danger' },
      { label: 'Doorgaan met trainen', value: '' },
    ]);
    if (v === 'yes') { update((s) => { s.active = null; }); toast('Training geannuleerd'); go('#/workout'); }
  },
  'rest-adj': (el) => update((s) => {
    const r = s.active?.rest;
    if (!r) return;
    const d = Number(el.dataset.d);
    r.endsAt += d * 1000;
    r.total = Math.max(1, r.total + d);
    if (r.endsAt <= Date.now()) s.active.rest = null;
  }),
  'rest-skip': () => update((s) => { if (s.active) s.active.rest = null; }),
});
