import { getState, update, uid, getExercise, finishedWorkouts } from '../store.js';
import { esc, on, go, icon, fmtNum, fmtDate, fmtTime, fmtDuration, fmtVolume, confirmDialog, toast, setLabel } from '../ui.js';
import { e1rm, workingSets } from '../progression.js';
import { workoutVolume, workoutSetCount, bestSet } from '../stats.js';

const setTxt = (s) => (s.kg ? `${fmtNum(s.kg)} kg × ${s.reps ?? 0}` : `${s.reps ?? 0} reps`);

export function renderHistory() {
  const list = finishedWorkouts();
  if (!list.length) {
    return `<header class="page-head"><h1>Geschiedenis</h1></header>
      <div class="empty-state">${icon('history')}<p>Nog geen trainingen afgerond.</p>
      <button class="btn btn-primary" data-action="go" data-href="#/workout">Start je eerste training</button></div>`;
  }
  let month = '';
  const html = list.map((w) => {
    const m = fmtDate(w.startedAt, { month: 'long', year: 'numeric' });
    const head = m !== month ? `<div class="list-group-title cap">${m}</div>` : '';
    month = m;
    return `${head}
      <button class="card card-tap hist-card" data-action="go" data-href="#/history/${w.id}">
        <div class="row-between"><h3>${esc(w.name)}</h3>${w.prs?.length ? `<span class="pr-badge">${icon('trophy')} ${w.prs.length} PR</span>` : ''}</div>
        <div class="muted small">${fmtDate(w.startedAt, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtTime(w.startedAt)}</div>
        <div class="hist-meta"><span>${icon('history')} ${fmtDuration(w.finishedAt - w.startedAt)}</span><span>${icon('dumbbell')} ${fmtVolume(workoutVolume(w))}</span><span>${icon('check')} ${workoutSetCount(w)} sets</span></div>
        <div class="hist-ex">
          <div class="hist-ex-row muted small"><span>Oefening</span><span>Beste set</span></div>
          ${w.exercises.map((e) => {
            const b = bestSet(e.sets);
            return `<div class="hist-ex-row"><span>${workingSets(e.sets).length} × ${esc(getExercise(e.exerciseId).name)}</span><span>${b ? setTxt(b) : '–'}</span></div>`;
          }).join('')}
        </div>
      </button>`;
  }).join('');
  return `<header class="page-head"><h1>Geschiedenis</h1><span class="muted">${list.length} trainingen</span></header>${html}`;
}

export function renderWorkoutDetail(id) {
  const w = getState().workouts.find((x) => x.id === id);
  if (!w) return `<header class="page-head"><button class="icon-btn" data-action="back">${icon('chevronLeft')}</button></header><p class="empty">Training niet gevonden.</p>`;
  return `
    <header class="page-head">
      <button class="icon-btn" data-action="back" aria-label="Terug">${icon('chevronLeft')}</button>
      <h1 class="h-sm">${esc(w.name)}</h1>
      <button class="icon-btn accent" data-action="go" data-href="#/workout-edit/${w.id}" aria-label="Training bewerken">${icon('edit')}</button>
    </header>
    <p class="muted">${fmtDate(w.startedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${fmtTime(w.startedAt)}–${fmtTime(w.finishedAt)}</p>
    <div class="stat-grid stat-grid-3">
      <div class="stat"><div class="stat-label">Duur</div><div class="stat-val">${fmtDuration(w.finishedAt - w.startedAt)}</div></div>
      <div class="stat"><div class="stat-label">Volume</div><div class="stat-val">${fmtVolume(workoutVolume(w))}</div></div>
      <div class="stat"><div class="stat-label">Sets</div><div class="stat-val">${workoutSetCount(w)}</div></div>
    </div>
    ${w.exercises.map((e) => `
      <section class="card">
        <div class="row-between"><button class="ex-name ex-link" data-action="go" data-href="#/exercise/${esc(e.exerciseId)}">${esc(getExercise(e.exerciseId).name)}</button>
        ${w.prs?.includes(e.exerciseId) ? `<span class="pr-badge">${icon('trophy')} PR</span>` : ''}</div>
        <div class="detail-sets">
          <div class="ds-row muted small"><span>Set</span><span>Gedaan</span><span>Doel</span><span>e1RM</span></div>
          ${e.sets.map((s, i) => `<div class="ds-row ${s.warmup ? 'warmup' : ''}">
            <span class="set-tag">${setLabel(e.sets, i)}</span><span>${setTxt(s)}${s.rir != null ? ` <i class="rir-inline">RIR ${s.rir >= 3 ? '3+' : s.rir}</i>` : ''}</span>
            <span class="muted">${s.target?.reps ? (s.target.kg ? `${fmtNum(s.target.kg)} × ${s.target.reps}` : `${s.target.reps}`) : '–'}</span>
            <span class="muted">${s.kg && !s.warmup ? fmtNum(e1rm(s.kg, s.reps), 1) : '–'}</span></div>`).join('')}
        </div>
      </section>`).join('')}
    <button class="btn btn-soft btn-block" data-action="go" data-href="#/workout-edit/${w.id}">${icon('edit')} Training bewerken</button>
    <button class="btn btn-soft btn-block" data-action="hist-to-template" data-id="${w.id}">${icon('copy')} Opslaan als nieuw template</button>
    <button class="btn btn-danger-soft btn-block" data-action="hist-delete" data-id="${w.id}">${icon('trash')} Training verwijderen</button>`;
}

on({
  'hist-delete': async (el) => {
    if (!(await confirmDialog('Training verwijderen?', 'Dit kan niet ongedaan worden gemaakt. Je advies en statistieken worden opnieuw berekend.', 'Verwijderen', true))) return;
    update((s) => { s.workouts = s.workouts.filter((w) => w.id !== el.dataset.id); });
    go('#/history');
  },
  'hist-to-template': (el) => {
    const w = getState().workouts.find((x) => x.id === el.dataset.id);
    update((s) => {
      s.templates.push({
        id: uid(), name: `${w.name} (kopie)`, updatedAt: Date.now(),
        exercises: w.exercises.map((e) => ({
          exerciseId: e.exerciseId, restSec: e.restSec, ...(e.repRange ? { repRange: e.repRange } : {}),
          sets: e.sets.map((x) => ({ kg: x.kg, reps: x.target?.reps ?? x.reps, ...(x.warmup ? { warmup: true } : {}) })),
        })),
      });
    });
    toast('Template aangemaakt');
    go('#/workout');
  },
});
