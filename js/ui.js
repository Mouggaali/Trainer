// UI helpers: action registry, formatting, icons, bottom sheets, toast, sound.

// ---------- Actions (event delegation, wired in app.js) ----------
export const actions = {};
export function on(map) { Object.assign(actions, map); }

let _rerender = () => {};
export function setRerender(fn) { _rerender = fn; }
export function rerender() { _rerender(); }
export function go(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

// ---------- Formatting ----------
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function num(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
export function fmtNum(n, d = 2) {
  if (n == null || n === '') return '';
  return String(Math.round(n * 10 ** d) / 10 ** d);
}
export function fmtVolume(kg) {
  return kg >= 10000 ? `${fmtNum(kg / 1000, 1)}t` : `${Math.round(kg)} kg`;
}
const pad = (n) => String(n).padStart(2, '0');
export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}
export function fmtElapsed(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function fmtDuration(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}u ${pad(m % 60)}m`;
}
export function fmtDate(ts, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ts).toLocaleDateString('nl-NL', opts);
}
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}
export function startOfDay(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
}
export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export function relDays(ts) {
  const d = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (d <= 0) return 'Vandaag';
  if (d === 1) return 'Gisteren';
  if (d < 7) return `${d} dagen geleden`;
  if (d < 14) return '1 week geleden';
  if (d < 60) return `${Math.floor(d / 7)} weken geleden`;
  return fmtDate(ts, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const isoToTs = (iso) => new Date(`${iso}T12:00:00`).getTime();
export const setLabel = (sets, i) => (sets[i].warmup ? 'W' : String(sets.slice(0, i + 1).filter((s) => !s.warmup).length));

// ---------- Icons ----------
const P = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 9.5v5M21 9.5v5M6 12h12"/>',
  body: '<circle cx="12" cy="4.5" r="2"/><path d="M5 9h14M12 9v6M12 15l-3 6M12 15l3 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 14v4M8 21h8"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 2.5 2 3-3z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  trendUp: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  trendDown: '<path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/>',
  equal: '<path d="M5 9h14M5 15h14"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  download: '<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>',
  upload: '<path d="M12 20V8M6 13l6-6 6 6M4 4h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- Bottom sheet ----------
let sheetResolve = null;

export function openSheet(html, { className = '' } = {}) {
  const root = document.getElementById('sheet');
  if (sheetResolve) { const r = sheetResolve; sheetResolve = null; r(null); }
  root.innerHTML = `<div class="sheet-backdrop" data-action="sheet-dismiss"></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  root.classList.add('open');
  document.body.classList.add('sheet-open');
  return root.querySelector('.sheet');
}

export function closeSheet(value = null) {
  const root = document.getElementById('sheet');
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('sheet-open');
  const r = sheetResolve;
  sheetResolve = null;
  if (r) r(value);
}

/** Opens a sheet and returns { el, result } where result resolves with the chosen value (or null). */
export function sheetPromise(html, opts) {
  const el = openSheet(html, opts);
  const result = new Promise((res) => { sheetResolve = res; });
  return { el, result };
}

/** options: [{ label, value, style }] → Promise<value|null> */
export function choose(title, text, options) {
  return sheetPromise(`
    <h3 class="sheet-title">${esc(title)}</h3>
    ${text ? `<p class="sheet-text">${esc(text)}</p>` : ''}
    <div class="sheet-actions">
      ${options.map((o) => `<button class="btn ${o.style || 'btn-secondary'} btn-block" data-action="sheet-resolve" data-value="${esc(o.value)}">${o.icon ? icon(o.icon) : ''}${esc(o.label)}</button>`).join('')}
    </div>`).result;
}

export async function confirmDialog(title, text, okLabel = 'OK', danger = false) {
  const v = await choose(title, text, [
    { label: okLabel, value: 'ok', style: danger ? 'btn-danger' : 'btn-primary' },
    { label: 'Annuleren', value: '' },
  ]);
  return v === 'ok';
}

on({
  'sheet-dismiss': () => closeSheet(null),
  'sheet-resolve': (el) => closeSheet(el.dataset.value),
  go: (el) => go(el.dataset.href),
});

// ---------- Toast ----------
let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- Sound ----------
let audioCtx;
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* no audio */ }
}
export function beep() {
  if (!audioCtx) return;
  [0, 0.22, 0.44].forEach((t) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = t === 0.44 ? 1175 : 880;
    o.connect(g); g.connect(audioCtx.destination);
    const st = audioCtx.currentTime + t;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.35, st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.18);
    o.start(st); o.stop(st + 0.2);
  });
}
