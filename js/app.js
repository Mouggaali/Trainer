import { getState, update, subscribe } from './store.js';
import { actions, on, setRerender, icon, esc, fmtClock, fmtElapsed, fmtNum, toast, closeSheet } from './ui.js';
import { playRestSound } from './sound.js';
import { renderHome, renderTemplateEditor } from './views/templates.js';
import { renderActive, nextSet } from './views/active.js';
import { cancelRestPush } from './push.js';
import { renderHistory, renderWorkoutDetail } from './views/history.js';
import { renderProfile, renderSettings, mountSettings } from './views/profile.js';
import { renderExercises, mountExercises, renderExerciseDetail } from './views/exercises.js';
import { renderBody, renderMeasureForm } from './views/body.js';
import { renderMonsterDetail } from './views/team.js';
import { renderWorkoutEdit } from './views/workout-edit.js';
import { initSync, onSyncChange, statusText, gateState } from './sync.js';
import { renderLogin, renderSplash } from './views/login.js';

const routes = {
  workout: { render: renderHome, tab: 'workout' },
  active: { render: renderActive, tab: null },
  template: { render: renderTemplateEditor, tab: 'workout' },
  history: { render: (id) => (id ? renderWorkoutDetail(id) : renderHistory()), tab: 'history' },
  'workout-edit': { render: renderWorkoutEdit, tab: 'history' },
  profile: { render: renderProfile, tab: 'profile' },
  settings: { render: renderSettings, mount: mountSettings, tab: 'profile' },
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

// Keep the screen awake during a workout so the rest timer and next set stay visible.
let wakeLock = null;
let wakePending = false;
async function syncWakeLock() {
  const s = getState();
  const want = lastGate === 'open' && !!s.active && s.settings.keepAwake !== false && !document.hidden;
  if (!('wakeLock' in navigator) || wakePending) return;
  try {
    if (want && !wakeLock) {
      wakePending = true;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      const w = wakeLock;
      wakeLock = null;
      await w.release();
    }
  } catch {
    wakeLock = null; // e.g. low battery mode or not allowed
  } finally {
    wakePending = false;
  }
}

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
  syncWakeLock();
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
  const n = nextSet(getState().active, r.ex ?? 0);
  const next = n
    ? `<div class="rest-next"><small>Volgende</small><b>${esc(n.name)}</b><span>${n.kg != null ? `${fmtNum(n.kg)} kg × ` : ''}${n.reps ?? '–'} reps · ${n.label}</span></div>`
    : '<div class="rest-next"><small>Volgende</small><b>Alle sets gedaan!</b><span>Tik op Klaar om af te ronden</span></div>';
  el.innerHTML = `
    <div class="rest rest-has-next">${next}
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
  // App is visible at the end of the rest (screen on): cancel the lock-screen push to avoid a double alert.
  if (left <= 3 && !document.hidden && !r.pushCancelled) {
    r.pushCancelled = true;
    cancelRestPush();
  }
  if (left <= 0) {
    update((s) => { s.active.rest = null; }, { silent: true });
    renderRestBar();
    if (getState().settings.sound) {
      playRestSound();
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

window.addEventListener('hashchange', () => { closeSheet(); view.scrollTop = 0; render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); syncWakeLock(); });

// iOS home-screen app: some iOS versions make the layout viewport shorter than the screen (by about the
// status-bar height), leaving a strip under the tabbar. Measure the gap and let the body extend over it.
export function screenInfo() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const portrait = innerHeight > innerWidth;
  const raw = screen.height - innerHeight;
  const gap = standalone && portrait && raw > 0 && raw <= 100 ? raw : 0;
  return { standalone, inner: innerHeight, screen: screen.height, gap };
}
function fixStandaloneGap() {
  document.documentElement.style.setProperty('--ios-gap', `${screenInfo().gap}px`);
}
fixStandaloneGap();
setTimeout(fixStandaloneGap, 300);
addEventListener('resize', fixStandaloneGap);
addEventListener('orientationchange', () => setTimeout(fixStandaloneGap, 300));

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
