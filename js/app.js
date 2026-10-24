import { getState, update, subscribe } from './store.js';
import { actions, on, setRerender, icon, esc, fmtClock, fmtElapsed, beep, toast, closeSheet } from './ui.js';
import { renderHome, renderTemplateEditor } from './views/templates.js';
import { renderActive } from './views/active.js';
import { renderHistory, renderWorkoutDetail } from './views/history.js';
import { renderProfile, renderSettings } from './views/profile.js';
import { renderExercises, mountExercises, renderExerciseDetail } from './views/exercises.js';
import { renderBody, renderMeasureForm } from './views/body.js';
import { renderMonsterDetail } from './views/team.js';
import { initSync, onSyncChange, statusText, gateState } from './sync.js';
import { renderLogin, renderSplash } from './views/login.js';

const routes = {
  workout: { render: renderHome, tab: 'workout' },
  active: { render: renderActive, tab: null },
  template: { render: renderTemplateEditor, tab: 'workout' },
  history: { render: (id) => (id ? renderWorkoutDetail(id) : renderHistory()), tab: 'history' },
  profile: { render: renderProfile, tab: 'profile' },
  settings: { render: renderSettings, tab: 'profile' },
  exercises: { render: (id) => renderExercises(id), mount: mountExercises, tab: 'exercises' },
  exercise: { render: renderExerciseDetail, tab: 'exercises' },
  monster: { render: renderMonsterDetail, tab: 'profile' },
  body: { render: renderBody, tab: 'body' },
  measure: { render: renderMeasureForm, tab: 'body' },
};

const TABS = [
  { id: 'profile', label: 'Team', icon: 'user', href: '#/profile' },
  { id: 'history', label: 'Historie', icon: 'history', href: '#/history' },
  { id: 'workout', label: 'Training', icon: 'plus', href: '#/workout' },
  { id: 'exercises', label: 'Oefeningen', icon: 'dumbbell', href: '#/exercises' },
  { id: 'body', label: 'Lichaam', icon: 'ruler', href: '#/body' },
];

function parseRoute() {
  const [root, param] = location.hash.replace(/^#\/?/, '').split('/');
  return { root: routes[root] ? root : 'workout', param: param ? decodeURIComponent(param) : undefined };
}

const view = document.getElementById('view');

let lastGate = null;

function render() {
  lastGate = gateState();
  if (lastGate !== 'open') {
    // Login gate: nothing of the app is shown until the user is signed in.
    view.innerHTML = lastGate === 'splash' ? renderSplash() : renderLogin();
    document.body.dataset.route = 'login';
    for (const id of ['tabbar', 'workout-bar', 'rest-bar']) document.getElementById(id).innerHTML = '';
    document.body.classList.remove('has-workout-bar', 'has-rest');
    return;
  }
  const { root, param } = parseRoute();
  const r = routes[root];
  view.innerHTML = r.render(param);
  r.mount?.(param);
  document.body.dataset.route = root;
  renderTabbar(r.tab);
  renderWorkoutBar(root);
  renderRestBar();
}

function renderTabbar(tab) {
  document.getElementById('tabbar').innerHTML = TABS.map((t) => `
    <a href="${t.href}" class="tab ${t.id === tab ? 'on' : ''} ${t.id === 'workout' ? 'tab-main' : ''}">
      ${icon(t.icon)}<span>${t.label}</span></a>`).join('');
}

function renderWorkoutBar(root) {
  const a = getState().active;
  const el = document.getElementById('workout-bar');
  const show = a && root !== 'active';
  document.body.classList.toggle('has-workout-bar', !!show);
  el.innerHTML = show ? `
    <a href="#/active" class="wbar"><span class="pulse"></span>
      <span class="wbar-name">${esc(a.name)}</span>
      <span class="wbar-time" data-elapsed="${a.startedAt}">${fmtElapsed(Date.now() - a.startedAt)}</span>
      ${icon('chevronRight')}</a>` : '';
}

function renderRestBar() {
  const r = getState().active?.rest;
  const el = document.getElementById('rest-bar');
  document.body.classList.toggle('has-rest', !!r);
  if (!r) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="rest">
      <div class="rest-fill" data-rest-fill></div>
      <button class="rest-btn" data-action="rest-adj" data-d="-15">−15</button>
      <div class="rest-mid"><small>Rust</small><span data-rest-left>${fmtClock((r.endsAt - Date.now()) / 1000)}</span></div>
      <button class="rest-btn" data-action="rest-adj" data-d="15">+15</button>
      <button class="rest-btn rest-skip" data-action="rest-skip">Skip</button>
    </div>`;
  tick();
}

function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = fmtElapsed(now - Number(el.dataset.elapsed)); });
  if (lastGate !== 'open') return;
  const a = getState().active;
  const r = a?.rest;
  if (!r) return;
  const left = (r.endsAt - now) / 1000;
  if (left <= 0) {
    update((s) => { s.active.rest = null; }, { silent: true });
    renderRestBar();
    if (getState().settings.sound) {
      beep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    toast('Rust voorbij — volgende set! 💪');
    return;
  }
  const t = document.querySelector('[data-rest-left]');
  if (t) t.textContent = fmtClock(left);
  const f = document.querySelector('[data-rest-fill]');
  if (f) f.style.width = `${Math.max(0, Math.min(100, (left / r.total) * 100))}%`;
}

// ---------- Event delegation ----------
on({ back: () => (history.length > 1 ? history.back() : (location.hash = '#/workout')) });

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});
const onInput = (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  if (e.type === 'input' && !('live' in el.dataset)) return;
  if (e.type === 'change' && 'live' in el.dataset) return;
  actions[el.dataset.input]?.(el, e);
};
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
document.addEventListener('focusin', (e) => { if (e.target.matches('.set-input')) setTimeout(() => e.target.select(), 0); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

window.addEventListener('hashchange', () => { closeSheet(); window.scrollTo(0, 0); render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

setRerender(render);
subscribe(render);
onSyncChange((kind) => {
  if (kind === 'recovery') { location.hash = '#/settings'; return render(); }
  if (kind === 'auth' || gateState() !== lastGate) return render();
  document.querySelectorAll('[data-sync-status]').forEach((el) => { el.textContent = statusText(); });
});
render();
setInterval(tick, 250);
initSync();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
