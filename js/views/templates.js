import { getState, update, uid, getExercise, exerciseSessions, templateLastPerformed } from '../store.js';
import { esc, on, go, icon, relDays, sheetPromise, choose, confirmDialog, toast, num, fmtNum, fmtElapsed, setLabel, closeSheet } from '../ui.js';
import { recommend } from '../progression.js';
import { trainedDaysThisWeek } from '../stats.js';
import { pickExercise } from './exercises.js';
import { computeTeam, TEAM } from '../game/xp.js';
import { monsterSprite } from '../game/monsters.js';
import { startWorkout } from './active.js';

const DAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
export const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 105, 120, 135, 150, 180, 210, 240, 300];
export const restLabel = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Uit');

function nextTemplateId() {
  const ts = getState().templates;
  if (!ts.length) return null;
  // Least recently performed template = next in the weekly rotation.
  return [...ts].sort((a, b) => (templateLastPerformed(a.id) || 0) - (templateLastPerformed(b.id) || 0))[0].id;
}

export function renderHome() {
  const s = getState();
  const days = trainedDaysThisWeek();
  const today = (new Date().getDay() + 6) % 7;
  const goal = s.settings.weeklyGoal;
  const nextId = nextTemplateId();
  const forms = Object.fromEntries(computeTeam(s).team.map((t) => [t.muscle, t.form]));

  const active = s.active ? `
    <div class="card active-card" data-action="go" data-href="#/active" role="button" tabindex="0">
      <div class="pulse"></div>
      <div class="li-main"><div class="li-title">Training bezig: ${esc(s.active.name)}</div>
      <div class="li-sub" data-elapsed="${s.active.startedAt}">${fmtElapsed(Date.now() - s.active.startedAt)}</div></div>
      <button class="icon-btn icon-btn-sm danger" data-action="wo-cancel" aria-label="Training annuleren">${icon('x')}</button>
      <span class="btn btn-primary btn-sm">Verder</span>
    </div>` : '';

  const cards = s.templates.map((t) => {
    const last = templateLastPerformed(t.id);
    return `
      <div class="tpl-card ${t.id === nextId ? 'is-next' : ''}" data-action="tpl-preview" data-id="${t.id}" role="button" tabindex="0">
        <div class="tpl-head"><h3>${esc(t.name)}</h3>
          <button class="icon-btn icon-btn-sm" data-action="tpl-menu" data-id="${t.id}" aria-label="Opties">${icon('more')}</button></div>
        ${t.id === nextId ? '<span class="next-badge">Volgende</span>' : ''}
        <p class="tpl-list">${t.exercises.map((e) => esc(getExercise(e.exerciseId).name)).join(', ') || '<em>Leeg</em>'}</p>
        <div class="tpl-team">${[...new Set(t.exercises.map((e) => getExercise(e.exerciseId).muscle))].filter((m) => TEAM.includes(m)).map((m) => monsterSprite(m, forms[m], 28, 'sprite')).join('')}</div>
        <div class="tpl-foot">${icon('history')} ${last ? relDays(last) : 'Nog niet gedaan'}</div>
      </div>`;
  }).join('');

  return `
    <header class="page-head"><h1>Training</h1></header>
    ${active}
    <section class="card week-card">
      <div class="row-between"><strong>Deze week</strong><span class="${days.size >= goal ? 'text-green' : 'muted'}">${days.size}/${goal} trainingen</span></div>
      <div class="week-strip">${DAYS.map((d, i) => `<div class="wd ${days.has(i) ? 'on' : ''} ${i === today ? 'today' : ''}"><span>${d}</span><i>${days.has(i) ? icon('check') : ''}</i></div>`).join('')}</div>
    </section>

    <h2 class="section-title">Snel starten</h2>
    <button class="btn btn-primary btn-block btn-lg" data-action="wo-start-empty">Lege training starten</button>

    <div class="section-head">
      <h2 class="section-title">Mijn templates (${s.templates.length})</h2>
      <button class="btn btn-soft btn-sm" data-action="go" data-href="#/template/new">${icon('plus')} Template</button>
    </div>
    <div class="tpl-grid">${cards || '<p class="empty">Nog geen templates. Maak er een aan.</p>'}</div>`;
}

function previewSheet(id) {
  const t = getState().templates.find((x) => x.id === id);
  if (!t) return;
  const last = templateLastPerformed(id);
  const rows = t.exercises.map((te) => {
    const ex = getExercise(te.exerciseId);
    const rec = recommend(ex, exerciseSessions(te.exerciseId), te.sets);
    const work = te.sets.filter((x) => !x.warmup).length;
    const cls = { increase: 'up', hold: 'hold', deload: 'down', new: 'new' }[rec.type];
    const ic = { increase: 'trendUp', hold: 'equal', deload: 'trendDown', new: 'sparkle' }[rec.type];
    return `<div class="pv-row"><div class="li-main"><div class="li-title">${work} × ${esc(ex.name)}</div>
      <div class="li-sub">${esc(ex.muscle)}</div></div>
      <span class="rec-pill rec-pill-${cls}">${icon(ic)}${esc(rec.title)}</span></div>`;
  }).join('');
  sheetPromise(`
    <div class="sheet-head"><button class="icon-btn" data-action="sheet-dismiss" aria-label="Sluiten">${icon('x')}</button>
      <h3>${esc(t.name)}</h3><button class="link-btn" data-action="tpl-edit" data-id="${id}">Bewerk</button></div>
    <p class="muted small">Laatst gedaan: ${last ? relDays(last) : 'nog nooit'}</p>
    <div class="pv-list">${rows || '<p class="empty">Geen oefeningen</p>'}</div>
    <button class="btn btn-primary btn-block btn-lg" data-action="tpl-start" data-id="${id}">Start training</button>`);
}

// ---------- Template editor ----------
let draft = null;

function ensureDraft(id) {
  if (draft && draft._for === id) return draft;
  const src = id === 'new' ? { id: uid(), name: '', exercises: [] } : getState().templates.find((t) => t.id === id);
  if (!src) return null;
  draft = { ...structuredClone(src), _for: id };
  return draft;
}

export function renderTemplateEditor(id) {
  const d = ensureDraft(id);
  if (!d) return '<p class="empty">Template niet gevonden.</p>';
  const blocks = d.exercises.map((te, ei) => {
    const ex = getExercise(te.exerciseId);
    return `
    <section class="card ex-card">
      <div class="ex-head">
        <div class="ex-name">${esc(ex.name)}</div>
        <button class="chip chip-btn" data-action="tpl-rest" data-ex="${ei}">${icon('timer')} ${restLabel(te.restSec)}</button>
        <button class="icon-btn icon-btn-sm" data-action="tpl-ex-menu" data-ex="${ei}" aria-label="Opties">${icon('more')}</button>
      </div>
      <div class="set-table tpl-table">
        <div class="set-row set-head"><span>Set</span><span>kg</span><span>Reps</span><span></span></div>
        ${te.sets.map((st, si) => `
          <div class="set-row ${st.warmup ? 'warmup' : ''}">
            <button class="set-num" data-action="tpl-set-warm" data-ex="${ei}" data-set="${si}" title="Tik: warming-up aan/uit">${setLabel(te.sets, si)}</button>
            <input class="set-input" inputmode="decimal" data-input="tpl-set" data-live data-field="kg" data-ex="${ei}" data-set="${si}" value="${fmtNum(st.kg)}" placeholder="kg">
            <input class="set-input" inputmode="numeric" data-input="tpl-set" data-live data-field="reps" data-ex="${ei}" data-set="${si}" value="${st.reps ?? ''}" placeholder="reps">
            <button class="icon-btn icon-btn-sm danger" data-action="tpl-set-del" data-ex="${ei}" data-set="${si}" aria-label="Set verwijderen">${icon('x')}</button>
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-block btn-sm" data-action="tpl-set-add" data-ex="${ei}">${icon('plus')} Set toevoegen</button>
    </section>`;
  }).join('');

  return `
    <header class="page-head sticky-head">
      <button class="link-btn" data-action="tpl-cancel">Annuleer</button>
      <h1 class="h-sm">${id === 'new' ? 'Nieuw template' : 'Template bewerken'}</h1>
      <button class="btn btn-primary btn-sm" data-action="tpl-save">Opslaan</button>
    </header>
    <input class="title-input" data-input="tpl-name" data-live value="${esc(d.name)}" placeholder="Naam, bv. Maandag – Push">
    <p class="muted small hint">Tip: tik op een setnummer om er een warming-up set (W) van te maken. Die telt niet mee voor het advies.</p>
    ${blocks}
    <button class="btn btn-soft btn-block" data-action="tpl-add-ex">${icon('plus')} Oefening toevoegen</button>
    ${id !== 'new' ? `<button class="btn btn-danger-soft btn-block" data-action="tpl-delete" data-id="${id}">${icon('trash')} Template verwijderen</button>` : ''}`;
}

const ix = (el) => ({ ex: Number(el.dataset.ex), set: Number(el.dataset.set) });
const redraw = () => go(location.hash);

export async function pickRest(current) {
  const { result } = sheetPromise(`
    <h3 class="sheet-title">Rusttijd tussen sets</h3>
    <div class="rest-grid">${REST_OPTIONS.map((v) => `<button class="btn ${v === current ? 'btn-primary' : 'btn-secondary'}" data-action="sheet-resolve" data-value="${v}">${restLabel(v)}</button>`).join('')}</div>`);
  const v = await result;
  return v == null ? null : Number(v);
}

on({
  'tpl-preview': (el, e) => { if (!e.target.closest('[data-action="tpl-menu"]')) previewSheet(el.dataset.id); },
  'tpl-start': (el) => { closeSheet(); startWorkout(el.dataset.id); },
  'tpl-edit': (el) => { closeSheet(); draft = null; go(`#/template/${el.dataset.id}`); },
  'tpl-menu': async (el, e) => {
    e.stopPropagation();
    const id = el.dataset.id;
    const v = await choose(getState().templates.find((t) => t.id === id)?.name || 'Template', null, [
      { label: 'Bewerken', value: 'edit', icon: 'edit' },
      { label: 'Dupliceren', value: 'dup', icon: 'copy' },
      { label: 'Verwijderen', value: 'del', icon: 'trash', style: 'btn-danger-soft' },
      { label: 'Annuleren', value: '' },
    ]);
    if (v === 'edit') { draft = null; go(`#/template/${id}`); }
    if (v === 'dup') update((s) => { const t = s.templates.find((x) => x.id === id); s.templates.push({ ...structuredClone(t), id: uid(), name: `${t.name} (kopie)`, updatedAt: Date.now() }); });
    if (v === 'del' && (await confirmDialog('Template verwijderen?', 'Je trainingsgeschiedenis blijft bewaard.', 'Verwijderen', true))) {
      update((s) => { s.templates = s.templates.filter((t) => t.id !== id); });
    }
  },
  'tpl-name': (el) => { draft.name = el.value; },
  'tpl-set': (el) => {
    const { ex, set } = ix(el);
    const st = draft.exercises[ex].sets[set];
    st[el.dataset.field] = el.dataset.field === 'reps' ? (num(el.value) == null ? null : Math.round(num(el.value))) : num(el.value);
  },
  'tpl-set-add': (el) => {
    const sets = draft.exercises[Number(el.dataset.ex)].sets;
    const last = sets.at(-1);
    sets.push({ kg: last?.kg ?? null, reps: last?.reps ?? 10 });
    redraw();
  },
  'tpl-set-del': (el) => { const { ex, set } = ix(el); draft.exercises[ex].sets.splice(set, 1); redraw(); },
  'tpl-set-warm': (el) => { const { ex, set } = ix(el); const st = draft.exercises[ex].sets[set]; st.warmup = !st.warmup || undefined; redraw(); },
  'tpl-rest': async (el) => {
    const te = draft.exercises[Number(el.dataset.ex)];
    const v = await pickRest(te.restSec);
    if (v != null) { te.restSec = v; redraw(); }
  },
  'tpl-ex-menu': async (el) => {
    const i = Number(el.dataset.ex);
    const v = await choose(getExercise(draft.exercises[i].exerciseId).name, null, [
      { label: 'Omhoog', value: 'up', icon: 'up' },
      { label: 'Omlaag', value: 'down', icon: 'down' },
      { label: 'Vervangen', value: 'swap', icon: 'copy' },
      { label: 'Verwijderen', value: 'del', icon: 'trash', style: 'btn-danger-soft' },
      { label: 'Annuleren', value: '' },
    ]);
    const list = draft.exercises;
    if (v === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (v === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    if (v === 'del') list.splice(i, 1);
    if (v === 'swap') { const id = await pickExercise('Oefening vervangen'); if (id) list[i].exerciseId = id; }
    redraw();
  },
  'tpl-add-ex': async () => {
    const id = await pickExercise();
    if (!id) return;
    draft.exercises.push({ exerciseId: id, restSec: getState().settings.defaultRest, sets: [{ kg: null, reps: 10 }, { kg: null, reps: 10 }, { kg: null, reps: 10 }] });
    redraw();
  },
  'tpl-cancel': () => { draft = null; go('#/workout'); },
  'tpl-save': () => {
    const { _for, ...t } = draft;
    t.name = t.name.trim() || 'Template';
    t.updatedAt = Date.now();
    update((s) => {
      const i = s.templates.findIndex((x) => x.id === t.id);
      if (i >= 0) s.templates[i] = t; else s.templates.push(t);
    });
    draft = null;
    toast('Template opgeslagen');
    go('#/workout');
  },
  'tpl-delete': async (el) => {
    if (!(await confirmDialog('Template verwijderen?', 'Je trainingsgeschiedenis blijft bewaard.', 'Verwijderen', true))) return;
    update((s) => { s.templates = s.templates.filter((t) => t.id !== el.dataset.id); });
    draft = null;
    go('#/workout');
  },
  'wo-start-empty': () => startWorkout(null),
});
