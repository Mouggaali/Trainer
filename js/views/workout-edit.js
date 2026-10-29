// Edit a finished workout afterwards (wrong weight, forgotten set, wrong date).
// Works on a draft copy; XP, badges, advice and records are derived, so they follow automatically.
import { getState, update, uid, getExercise } from '../store.js';
import { esc, on, go, icon, num, fmtNum, setLabel, toast, confirmDialog, choose } from '../ui.js';
import { workoutPrs } from '../stats.js';
import { pickExercise } from './exercises.js';

let draft = null;

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isoTime = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function ensureDraft(id) {
  if (draft && draft._for === id) return draft;
  const w = getState().workouts.find((x) => x.id === id);
  if (!w) return null;
  draft = {
    ...structuredClone(w),
    _for: id,
    _date: isoDate(w.startedAt),
    _time: isoTime(w.startedAt),
    _minutes: Math.max(1, Math.round((w.finishedAt - w.startedAt) / 60000)),
  };
  return draft;
}

export function renderWorkoutEdit(id) {
  const d = ensureDraft(id);
  if (!d) return `<header class="page-head"><button class="icon-btn" data-action="back">${icon('chevronLeft')}</button></header><p class="empty">Training niet gevonden.</p>`;
  const blocks = d.exercises.map((e, ei) => `
    <section class="card ex-card">
      <div class="ex-head">
        <div class="ex-name">${esc(getExercise(e.exerciseId).name)}</div>
        <button class="icon-btn icon-btn-sm danger" data-action="we-ex-del" data-ex="${ei}" aria-label="Oefening verwijderen">${icon('trash')}</button>
      </div>
      <div class="set-table edit-table">
        <div class="set-row set-head"><span>Set</span><span>kg</span><span>Reps</span><span>RIR</span><span></span></div>
        ${e.sets.map((st, si) => `
          <div class="set-row ${st.warmup ? 'warmup' : ''}">
            <button class="set-num" data-action="we-set-warm" data-ex="${ei}" data-set="${si}" title="Tik: warming-up aan/uit">${setLabel(e.sets, si)}</button>
            <input class="set-input" inputmode="decimal" data-input="we-set" data-live data-field="kg" data-ex="${ei}" data-set="${si}" value="${fmtNum(st.kg)}" placeholder="kg">
            <input class="set-input" inputmode="numeric" data-input="we-set" data-live data-field="reps" data-ex="${ei}" data-set="${si}" value="${st.reps ?? ''}" placeholder="reps">
            <input class="set-input" inputmode="numeric" data-input="we-set" data-live data-field="rir" data-ex="${ei}" data-set="${si}" value="${st.rir ?? ''}" placeholder="–" aria-label="Reps over (0–3)">
            <button class="icon-btn icon-btn-sm danger" data-action="we-set-del" data-ex="${ei}" data-set="${si}" aria-label="Set verwijderen">${icon('x')}</button>
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-block btn-sm" data-action="we-set-add" data-ex="${ei}">${icon('plus')} Set toevoegen</button>
    </section>`).join('');

  return `
    <header class="page-head sticky-head">
      <button class="link-btn" data-action="we-cancel">Annuleer</button>
      <h1 class="h-sm">Training bewerken</h1>
      <button class="btn btn-primary btn-sm" data-action="we-save">Opslaan</button>
    </header>
    <input class="title-input" data-input="we-name" data-live value="${esc(d.name)}" placeholder="Naam van de training">
    <section class="card form we-when">
      <label>Datum<input type="date" data-input="we-date" value="${d._date}"></label>
      <label>Starttijd<input type="time" data-input="we-time" value="${d._time}"></label>
      <label>Duur (min)<input inputmode="numeric" data-input="we-minutes" data-live value="${d._minutes}"></label>
    </section>
    <p class="muted small hint">RIR = hoeveel reps je nog had gekund (0–3, 3 = 3 of meer). Leeg laten mag.</p>
    ${blocks}
    <button class="btn btn-soft btn-block" data-action="we-add-ex">${icon('plus')} Oefening toevoegen</button>`;
}

const ix = (el) => ({ ex: Number(el.dataset.ex), set: Number(el.dataset.set) });
const redraw = () => go(location.hash);

on({
  'we-name': (el) => { draft.name = el.value; },
  'we-date': (el) => { draft._date = el.value; },
  'we-time': (el) => { draft._time = el.value; },
  'we-minutes': (el) => { draft._minutes = Math.round(num(el.value) || 0); },
  'we-set': (el) => {
    const { ex, set } = ix(el);
    const st = draft.exercises[ex].sets[set];
    const v = num(el.value);
    const f = el.dataset.field;
    if (f === 'kg') st.kg = v;
    if (f === 'reps') st.reps = v == null ? null : Math.round(v);
    if (f === 'rir') { if (v == null) delete st.rir; else st.rir = Math.max(0, Math.min(3, Math.round(v))); }
  },
  'we-set-warm': (el) => { const { ex, set } = ix(el); const st = draft.exercises[ex].sets[set]; st.warmup = !st.warmup; redraw(); },
  'we-set-del': (el) => { const { ex, set } = ix(el); draft.exercises[ex].sets.splice(set, 1); redraw(); },
  'we-set-add': (el) => {
    const sets = draft.exercises[Number(el.dataset.ex)].sets;
    const last = sets.at(-1);
    sets.push({ id: uid(), kg: last?.kg ?? null, reps: last?.reps ?? null, done: true, warmup: false, target: { kg: last?.kg ?? null, reps: last?.reps ?? null } });
    redraw();
  },
  'we-ex-del': async (el) => {
    const i = Number(el.dataset.ex);
    const v = await choose(`${getExercise(draft.exercises[i].exerciseId).name} verwijderen?`, 'Alle sets van deze oefening in deze training verdwijnen.', [
      { label: 'Verwijderen', value: 'del', style: 'btn-danger' },
      { label: 'Annuleren', value: '' },
    ]);
    if (v === 'del') { draft.exercises.splice(i, 1); redraw(); }
  },
  'we-add-ex': async () => {
    const id = await pickExercise();
    if (!id) return;
    draft.exercises.push({ uid: uid(), exerciseId: id, restSec: getState().settings.defaultRest, targetSets: 1, sets: [{ id: uid(), kg: null, reps: null, done: true, warmup: false, target: { kg: null, reps: null } }] });
    redraw();
  },
  'we-cancel': async () => {
    if (!(await confirmDialog('Wijzigingen weggooien?', null, 'Weggooien', true))) return;
    const id = draft?._for;
    draft = null;
    go(id ? `#/history/${id}` : '#/history');
  },
  'we-save': () => {
    const { _for, _date, _time, _minutes, ...w } = draft;
    const start = new Date(`${_date}T${_time || '12:00'}:00`).getTime();
    if (!Number.isFinite(start)) return toast('Vul een geldige datum en tijd in');
    if (start > Date.now()) return toast('Een training kan niet in de toekomst liggen');
    w.name = (w.name || '').trim() || 'Training';
    w.startedAt = start;
    w.finishedAt = start + Math.max(1, _minutes || 1) * 60000;
    w.exercises = w.exercises
      .map((e) => ({
        ...e,
        sets: e.sets.filter((x) => x.reps != null && x.reps > 0).map((x) => ({ ...x, done: true, target: x.target || { kg: x.kg, reps: x.reps } })),
      }))
      .filter((e) => e.sets.length);
    w.exercises.forEach((e) => { e.targetSets = Math.max(1, e.sets.filter((x) => !x.warmup).length); });
    if (!w.exercises.length) return toast('Een training heeft minstens één set met reps nodig');
    update((s) => {
      const i = s.workouts.findIndex((x) => x.id === w.id);
      if (i < 0) return;
      s.workouts[i] = w;
      // Records depend on the order of workouts, so recompute them for everything.
      for (const x of [...s.workouts].sort((a, b) => a.startedAt - b.startedAt)) x.prs = workoutPrs(x, s.workouts);
    });
    draft = null;
    toast('Training opgeslagen');
    go(`#/history/${w.id}`);
  },
});
