import { allExercises, getExercise, update, uid, exerciseSessions, getState } from '../store.js';
import { MUSCLES, EQUIPMENT, slug } from '../exercise-library.js';
import { esc, on, go, sheetPromise, closeSheet, icon, fmtNum, fmtDate, toast, num, confirmDialog, setLabel } from '../ui.js';
import { lineChart } from '../charts.js';
import { recommend, workingSets } from '../progression.js';
import { bestE1rm, exerciseRecords, trainedExercises, setVolume } from '../stats.js';

let query = '';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function exerciseListHtml(q, action) {
  const counts = new Map(trainedExercises().map((t) => [t.id, t.count]));
  const nq = norm(q.trim());
  const list = allExercises().filter((e) => !nq || norm(e.name).includes(nq) || norm(e.muscle).includes(nq));
  if (!list.length) return `<p class="empty">Geen oefening gevonden. Maak een nieuwe aan.</p>`;
  return MUSCLES.map((m) => {
    const items = list.filter((e) => (e.muscle || 'Overig') === m).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) return '';
    return `<div class="list-group-title">${m}</div><div class="list">${items.map((e) => `
      <button class="list-item" data-action="${action}" data-value="${esc(e.id)}">
        <div class="li-main"><div class="li-title">${esc(e.name)}</div>
        <div class="li-sub">${EQUIPMENT[e.equipment] || ''}${e.custom ? ' · eigen' : ''}</div></div>
        ${counts.get(e.id) ? `<span class="badge">${counts.get(e.id)}×</span>` : ''}
        ${icon('chevronRight', 'muted')}
      </button>`).join('')}</div>`;
  }).join('');
}

export function renderExercises() {
  return `
    <header class="page-head">
      <h1>Oefeningen</h1>
      <button class="icon-btn accent" data-action="ex-new" aria-label="Nieuwe oefening">${icon('plus')}</button>
    </header>
    <label class="search">${icon('search')}<input id="ex-search" type="search" placeholder="Zoek oefening of spiergroep" value="${esc(query)}" autocomplete="off"></label>
    <div id="ex-list">${exerciseListHtml(query, 'ex-open')}</div>`;
}

export function mountExercises() {
  const input = document.getElementById('ex-search');
  input.addEventListener('input', () => {
    query = input.value;
    document.getElementById('ex-list').innerHTML = exerciseListHtml(query, 'ex-open');
  });
}

/** Planned sets for an exercise outside a template: from a template that contains it, else last session. */
export function plannedSetsFor(exerciseId) {
  for (const t of getState().templates) {
    const te = t.exercises.find((e) => e.exerciseId === exerciseId);
    if (te) return te.sets;
  }
  const last = exerciseSessions(exerciseId)[0];
  if (last) return last.sets.filter((s) => s.done).map((s) => ({ kg: s.kg, reps: s.target?.reps ?? s.reps, warmup: s.warmup }));
  return [{ kg: null, reps: 10 }, { kg: null, reps: 10 }, { kg: null, reps: 10 }];
}

const setTxt = (s) => (s.kg ? `${fmtNum(s.kg)} kg × ${s.reps ?? 0}` : `${s.reps ?? 0} reps`);

export function renderExerciseDetail(id) {
  const ex = getExercise(id);
  const sessions = exerciseSessions(id);
  const rec = exerciseRecords(id);
  const weighted = sessions.some((s) => workingSets(s.sets).some((x) => x.kg));
  const points = sessions.map((s) => ({
    x: s.date,
    y: weighted ? Math.round(bestE1rm(s.sets) * 10) / 10 : Math.max(0, ...workingSets(s.sets).map((x) => x.reps || 0)),
  })).filter((p) => p.y > 0);
  const next = recommend(ex, sessions, plannedSetsFor(id));
  const firstNext = next.sets.filter((s) => !s.warmup).reduce((a, x) => (!a || (x.kg || 0) > (a.kg || 0) ? x : a), null);

  return `
    <header class="page-head">
      <button class="icon-btn" data-action="back" aria-label="Terug">${icon('chevronLeft')}</button>
      <h1 class="h-sm">${esc(ex.name)}</h1>
      <button class="icon-btn accent" data-action="ex-edit" data-id="${esc(id)}" aria-label="Bewerken">${icon('edit')}</button>
    </header>
    <div class="chips"><span class="chip">${esc(ex.muscle)}</span><span class="chip">${EQUIPMENT[ex.equipment] || ''}</span>${ex.increment ? `<span class="chip">stap ${fmtNum(ex.increment)} kg</span>` : ''}</div>

    <section class="card">
      <div class="card-head"><div><h2>${weighted ? 'Geschatte 1RM' : 'Max reps'}</h2><div class="muted small">per sessie</div></div></div>
      ${lineChart({ series: [{ name: ex.name, points }] })}
    </section>

    <section class="card rec-card rec-${next.type}">
      <div class="card-head"><h2>${icon('sparkle')} Advies volgende keer</h2></div>
      <div class="rec-big">${esc(next.title)}${firstNext && (firstNext.kg || firstNext.reps) ? ` · ${setTxt(firstNext)}` : ''}</div>
      <p class="muted">${esc(next.message)}</p>
    </section>

    <section class="stat-grid">
      <div class="stat"><div class="stat-label">e1RM</div><div class="stat-val">${rec.e1rm ? fmtNum(rec.e1rm.value, 1) : '–'}<small> kg</small></div><div class="stat-sub">${rec.e1rm ? setTxt(rec.e1rm.set) : ''}</div></div>
      <div class="stat"><div class="stat-label">Zwaarste set</div><div class="stat-val">${rec.heaviest ? fmtNum(rec.heaviest.value) : '–'}<small> kg</small></div><div class="stat-sub">${rec.heaviest ? setTxt(rec.heaviest.set) : ''}</div></div>
      <div class="stat"><div class="stat-label">Meeste reps</div><div class="stat-val">${rec.reps ? rec.reps.value : '–'}</div><div class="stat-sub">${rec.reps ? setTxt(rec.reps.set) : ''}</div></div>
      <div class="stat"><div class="stat-label">Sessies</div><div class="stat-val">${rec.sessions}</div><div class="stat-sub">${rec.volume ? `max ${Math.round(rec.volume.value)} kg vol.` : ''}</div></div>
    </section>

    <h2 class="section-title">Geschiedenis</h2>
    ${sessions.length ? sessions.map((s) => `
      <button class="card card-tap" data-action="go" data-href="#/history/${s.workoutId}">
        <div class="row-between"><strong>${fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><span class="muted small">${Math.round(setVolume(s.sets))} kg</span></div>
        <div class="set-lines">${s.sets.filter((x) => x.done).map((x, i, arr) => `<div><span class="set-tag">${setLabel(arr, i)}</span>${setTxt(x)}</div>`).join('')}</div>
      </button>`).join('') : '<p class="empty">Nog niet uitgevoerd.</p>'}
    ${ex.custom ? `<button class="btn btn-danger-soft btn-block" data-action="ex-delete" data-id="${esc(id)}">${icon('trash')} Oefening verwijderen</button>` : ''}`;
}

/** Create/edit exercise in a sheet. Resolves with the exercise id or null. */
export async function editExercise(id = null) {
  const ex = id ? getExercise(id) : { name: '', equipment: 'barbell', muscle: 'Borst', lower: false };
  const { result } = sheetPromise(`
    <h3 class="sheet-title">${id ? 'Oefening bewerken' : 'Nieuwe oefening'}</h3>
    <form class="form" id="ex-form" data-id="${esc(id || '')}" onsubmit="return false">
      <label>Naam<input name="name" value="${esc(ex.name)}" placeholder="bv. Cable Fly (Cable)" required></label>
      <label>Equipment<select name="equipment">${Object.entries(EQUIPMENT).map(([k, v]) => `<option value="${k}" ${k === ex.equipment ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Spiergroep<select name="muscle">${MUSCLES.map((m) => `<option ${m === ex.muscle ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Hulpspiergroep <span class="muted small">— krijgt halve EXP.</span><select name="secondary"><option value="">Geen</option>${MUSCLES.filter((m) => m !== 'Overig').map((m) => `<option ${m === ex.secondary ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="check-row"><input type="checkbox" name="lower" ${ex.lower ? 'checked' : ''}> Onderlichaam / hinge (grotere stappen)</label>
      <label>Eigen gewichtsstap (kg) <span class="muted small">— leeg = automatisch</span><input name="increment" inputmode="decimal" value="${fmtNum(ex.increment)}" placeholder="auto"></label>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-action="ex-form-save">Opslaan</button>
        <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button>
      </div>
    </form>`);
  return result;
}

/** Exercise picker sheet. Resolves with an exercise id or null. */
export async function pickExercise(title = 'Oefening toevoegen') {
  const { el, result } = sheetPromise(`
    <h3 class="sheet-title">${esc(title)}</h3>
    <label class="search">${icon('search')}<input id="pick-search" type="search" placeholder="Zoek oefening" autocomplete="off"></label>
    <button class="btn btn-soft btn-block" data-action="sheet-resolve" data-value="__new__">${icon('plus')} Nieuwe oefening maken</button>
    <div id="pick-list">${exerciseListHtml('', 'sheet-resolve')}</div>`, { className: 'sheet-tall' });
  const input = el.querySelector('#pick-search');
  input.addEventListener('input', () => { el.querySelector('#pick-list').innerHTML = exerciseListHtml(input.value, 'sheet-resolve'); });
  const v = await result;
  if (v === '__new__') return editExercise(null);
  return v || null;
}

on({
  'ex-open': (el) => go(`#/exercise/${el.dataset.value}`),
  'ex-new': async () => { const id = await editExercise(null); if (id) go(`#/exercise/${id}`); },
  'ex-edit': (el) => editExercise(el.dataset.id),
  'ex-form-save': () => {
    const form = document.getElementById('ex-form');
    const f = new FormData(form);
    const name = String(f.get('name') || '').trim();
    if (!name) return toast('Geef de oefening een naam');
    const data = {
      name,
      equipment: f.get('equipment'),
      muscle: f.get('muscle'),
      secondary: f.get('secondary') || undefined,
      lower: f.get('lower') === 'on',
      increment: num(f.get('increment')) || undefined,
    };
    let id = form.dataset.id;
    update((s) => {
      if (id) {
        const custom = s.customExercises.find((e) => e.id === id);
        if (custom) Object.assign(custom, data);
        else s.exerciseOverrides[id] = data;
      } else {
        id = `${slug(name)}-${uid().slice(-4)}`;
        s.customExercises.push({ id, ...data, custom: true });
      }
    });
    closeSheet(id);
    toast('Oefening opgeslagen');
  },
  'ex-delete': async (el) => {
    const id = el.dataset.id;
    const s = getState();
    const used = s.workouts.some((w) => w.exercises.some((e) => e.exerciseId === id))
      || s.templates.some((t) => t.exercises.some((e) => e.exerciseId === id));
    if (used) return toast('Deze oefening wordt nog gebruikt in een template of training');
    if (!(await confirmDialog('Oefening verwijderen?', getExercise(id).name, 'Verwijderen', true))) return;
    update((st) => { st.customExercises = st.customExercises.filter((e) => e.id !== id); });
    go('#/exercises');
  },
});
