import { getState, update, getExercise, exerciseSessions, exportData, importData, resetData } from '../store.js';
import { esc, on, go, icon, fmtNum, fmtVolume, confirmDialog, toast, relDays } from '../ui.js';
import { barChart, lineChart } from '../charts.js';
import { workingSets } from '../progression.js';
import { weeklyStats, weekStreak, bestE1rm, exerciseRecords, trainedExercises, setVolume } from '../stats.js';
import { REST_OPTIONS, restLabel } from './templates.js';
import { renderParty } from './team.js';
import { syncInfo, statusText, setNewPassword, syncNow, logout } from '../sync.js';

let selEx = null;
let metric = 'e1rm';

const METRICS = {
  e1rm: { label: 'e1RM', fn: (sets) => bestE1rm(sets) },
  max: { label: 'Max kg', fn: (sets) => Math.max(0, ...workingSets(sets).map((s) => s.kg || 0)) },
  volume: { label: 'Volume', fn: (sets) => setVolume(sets) },
};

export function renderProfile() {
  const s = getState();
  const weeks = weeklyStats(8);
  const goal = s.settings.weeklyGoal;
  const thisWeek = weeks.at(-1);
  const lastWeek = weeks.at(-2);
  const trained = trainedExercises();
  if (!selEx || !trained.some((t) => t.id === selEx)) selEx = trained[0]?.id || null;

  let progress = '<p class="empty">Rond een training af om je progressie te zien.</p>';
  if (selEx) {
    const sessions = exerciseSessions(selEx);
    const points = sessions.map((x) => ({ x: x.date, y: Math.round(METRICS[metric].fn(x.sets) * 10) / 10 })).filter((p) => p.y > 0);
    const first = points.at(-1)?.y, last = points[0]?.y;
    const diff = first != null && last != null ? last - first : 0;
    progress = `
      <select class="select" data-input="prof-ex">${trained.map((t) => `<option value="${esc(t.id)}" ${t.id === selEx ? 'selected' : ''}>${esc(getExercise(t.id).name)} (${t.count}×)</option>`).join('')}</select>
      <div class="segmented">${Object.entries(METRICS).map(([k, m]) => `<button class="${k === metric ? 'on' : ''}" data-action="prof-metric" data-m="${k}">${m.label}</button>`).join('')}</div>
      ${points.length > 1 ? `<div class="delta ${diff > 0 ? 'text-green' : diff < 0 ? 'text-red' : 'muted'}">${diff > 0 ? '+' : ''}${fmtNum(diff, 1)} kg sinds je eerste sessie (${points.length} sessies)</div>` : ''}
      ${lineChart({ series: [{ name: getExercise(selEx).name, points }] })}
      <button class="link-btn" data-action="go" data-href="#/exercise/${esc(selEx)}">Details van deze oefening ${icon('chevronRight')}</button>`;
  }

  const records = trained.slice(0, 8).map((t) => {
    const r = exerciseRecords(t.id);
    if (!r.e1rm) return '';
    return `<button class="list-item" data-action="go" data-href="#/exercise/${esc(t.id)}">
      <div class="li-main"><div class="li-title">${esc(getExercise(t.id).name)}</div>
      <div class="li-sub">${fmtNum(r.e1rm.set.kg)} kg × ${r.e1rm.set.reps} · ${relDays(r.e1rm.date)}</div></div>
      <span class="pr-val">${fmtNum(r.e1rm.value, 1)}<small> kg</small></span></button>`;
  }).join('');

  return `
    <header class="page-head">
      <h1>Team</h1>
      <button class="icon-btn accent" data-action="go" data-href="#/settings" aria-label="Instellingen">${icon('gear')}</button>
    </header>
    ${renderParty()}
    <div class="muted small sync-line" data-sync-status>${esc(statusText())}</div>

    <section class="stat-grid stat-grid-3">
      <div class="stat"><div class="stat-label">Deze week</div><div class="stat-val">${thisWeek.count}<small>/${goal}</small></div></div>
      <div class="stat"><div class="stat-label">${icon('flame')} Streak</div><div class="stat-val">${weekStreak()}<small> wk</small></div></div>
      <div class="stat"><div class="stat-label">Volume wk</div><div class="stat-val">${fmtVolume(thisWeek.volume)}</div>
        <div class="stat-sub">${lastWeek.volume ? `vorige: ${fmtVolume(lastWeek.volume)}` : ''}</div></div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Trainingen per week</h2><div class="muted small">Doel: ${goal} per week</div></div></div>
      ${barChart({ labels: weeks.map((w) => { const d = new Date(w.start); return `${d.getDate()}/${d.getMonth() + 1}`; }), values: weeks.map((w) => w.count), goal, highlight: weeks.length - 1 })}
    </section>

    <section class="card">
      <div class="card-head"><h2>Progressie per oefening</h2></div>
      ${progress}
    </section>

    ${records ? `<section class="card"><div class="card-head"><h2>${icon('trophy')} Records (e1RM)</h2></div><div class="list list-flat">${records}</div></section>` : ''}

    <button class="card card-tap row-between" data-action="go" data-href="#/body">
      <div><strong>Lichaam</strong><div class="muted small">Gewicht en omtrekmaten bijhouden</div></div>${icon('chevronRight')}
    </button>`;
}

export function renderSettings() {
  const s = getState();
  const st = s.settings;
  return `
    <header class="page-head">
      <button class="icon-btn" data-action="back" aria-label="Terug">${icon('chevronLeft')}</button>
      <h1 class="h-sm">Instellingen</h1><span></span>
    </header>
    <section class="card form">
      <label>Naam<input data-input="set-name" data-live value="${esc(s.profile.name)}" placeholder="Je naam"></label>
      <label>Trainingen per week (doel)
        <select data-input="set-goal">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === st.weeklyGoal ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Standaard rusttijd
        <select data-input="set-rest">${REST_OPTIONS.map((v) => `<option value="${v}" ${v === st.defaultRest ? 'selected' : ''}>${restLabel(v)}</option>`).join('')}</select></label>
      <label class="check-row"><input type="checkbox" data-input="set-auto" ${st.autoApply ? 'checked' : ''}> Gewichtsadvies automatisch invullen bij start</label>
      <label class="check-row"><input type="checkbox" data-input="set-sound" ${st.sound ? 'checked' : ''}> Geluid + trilling als de rust voorbij is</label>
      <label class="check-row"><input type="checkbox" data-input="set-awake" ${st.keepAwake !== false ? 'checked' : ''}> Scherm aan houden tijdens een training</label>
    </section>

    ${syncCard()}

    <h2 class="section-title">Data</h2>
    <section class="card">
      <p class="muted small">Je data staat altijd ook lokaal op dit apparaat, zodat de app offline werkt.
      Een JSON-export is een extra back-up.</p>
      <button class="btn btn-soft btn-block" data-action="data-export">${icon('download')} Exporteer back-up (JSON)</button>
      <label class="btn btn-soft btn-block file-btn">${icon('upload')} Importeer back-up<input type="file" accept="application/json,.json" data-input="data-import" hidden></label>
      <button class="btn btn-danger-soft btn-block" data-action="data-reset">${icon('trash')} Alle data wissen</button>
    </section>
    <p class="muted small center">Trainer v0.1</p>`;
}

function syncCard() {
  const i = syncInfo();
  let body;
  if (i.status === 'unconfigured') {
    body = '<p class="muted small">Nog niet ingesteld. Run <code>node tools/build-config.js</code> om js/config.js te maken.</p>';
  } else if (i.recovery) {
    body = `<p class="muted small">Kies een nieuw wachtwoord voor <strong>${esc(i.email || '')}</strong>.</p>
      <form class="form" onsubmit="return false">
        <label>Nieuw wachtwoord<input type="password" id="sync-newpw" autocomplete="new-password" minlength="6"></label>
        <button class="btn btn-primary btn-block" data-action="sync-newpw">Wachtwoord opslaan</button>
      </form>`;
  } else if (i.email) {
    body = `<div class="li-title">${esc(i.email)}</div><div class="muted small" data-sync-status>${esc(statusText())}</div>
      <button class="btn btn-soft btn-block" data-action="sync-now">Nu synchroniseren</button>
      <button class="btn btn-secondary btn-block" data-action="sync-logout">Uitloggen</button>`;
  } else {
    body = `<div class="muted small" data-sync-status>${esc(statusText())}</div>`;
  }
  return `<h2 class="section-title">Cloud-sync</h2><section class="card">${body}</section>`;
}

const busy = async (el, fn) => {
  el.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || 'Er ging iets mis'); } finally { el.disabled = false; }
};

on({
  'sync-newpw': (el) => busy(el, async () => {
    const pw = document.getElementById('sync-newpw').value;
    if (pw.length < 6) throw new Error('Wachtwoord moet minstens 6 tekens zijn');
    await setNewPassword(pw);
    toast('Nieuw wachtwoord opgeslagen');
  }),
  'sync-now': (el) => busy(el, syncNow),
  'sync-logout': async (el) => {
    if (!(await confirmDialog('Uitloggen?', 'Je data blijft veilig in de cloud en wordt van dit apparaat gewist. Log opnieuw in om alles terug te krijgen.', 'Uitloggen'))) return;
    busy(el, logout);
  },
  'prof-ex': (el) => { selEx = el.value; go(location.hash); },
  'prof-metric': (el) => { metric = el.dataset.m; go(location.hash); },
  'set-name': (el) => update((s) => { s.profile.name = el.value; }, { silent: true }),
  'set-goal': (el) => update((s) => { s.settings.weeklyGoal = Number(el.value); }),
  'set-rest': (el) => update((s) => { s.settings.defaultRest = Number(el.value); }),
  'set-auto': (el) => update((s) => { s.settings.autoApply = el.checked; }),
  'set-sound': (el) => update((s) => { s.settings.sound = el.checked; }),
  'set-awake': (el) => update((s) => { s.settings.keepAwake = el.checked; }),
  'data-export': () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'data-import': async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (!(await confirmDialog('Back-up importeren?', 'Je huidige data wordt vervangen door de back-up.', 'Importeren', true))) return;
    try { importData(text); toast('Back-up geïmporteerd'); } catch (e) { toast(e.message || 'Import mislukt'); }
  },
  'data-reset': async () => {
    if (!(await confirmDialog('Alle data wissen?', 'Trainingen, templates, gewicht en maten worden verwijderd. Exporteer eerst een back-up!', 'Alles wissen', true))) return;
    resetData();
    toast('Data gewist');
    go('#/workout');
  },
});

