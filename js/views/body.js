import { getState, update, uid } from '../store.js';
import { esc, on, go, icon, fmtNum, fmtDate, todayISO, isoToTs, num, confirmDialog, toast } from '../ui.js';
import { lineChart } from '../charts.js';

export const MEASURE_PARTS = [
  { key: 'biceps', label: 'Biceps (gespannen)', sides: true },
  { key: 'forearm', label: 'Onderarm', sides: true },
  { key: 'thigh', label: 'Bovenbeen', sides: true },
  { key: 'calf', label: 'Kuit', sides: true },
  { key: 'neck', label: 'Nek' },
  { key: 'shoulders', label: 'Schouders' },
  { key: 'chest', label: 'Borst' },
  { key: 'waist', label: 'Taille (navel)' },
  { key: 'hips', label: 'Heupen' },
  { key: 'bodyfat', label: 'Vetpercentage', unit: '%' },
];
const keysOf = (p) => (p.sides ? [`${p.key}_L`, `${p.key}_R`] : [p.key]);

let chartPart = 'biceps';

const byDate = (a, b) => a.date.localeCompare(b.date);

function deltaHtml(cur, prev, higherIsGood = true) {
  if (cur == null || prev == null) return '';
  const d = Math.round((cur - prev) * 10) / 10;
  if (!d) return '<span class="dl muted">±0</span>';
  const good = higherIsGood ? d > 0 : d < 0;
  return `<span class="dl ${good ? 'text-green' : 'text-red'}">${d > 0 ? '+' : ''}${fmtNum(d, 1)}</span>`;
}

export function renderBody() {
  const s = getState();
  const bw = [...s.bodyweight].sort(byDate);
  const latest = bw.at(-1);
  const monthAgo = bw.filter((x) => isoToTs(x.date) <= Date.now() - 28 * 86400000).at(-1);
  const ms = [...s.measurements].sort(byDate);
  const lastM = ms.at(-1), prevM = ms.at(-2);

  const part = MEASURE_PARTS.find((p) => p.key === chartPart) || MEASURE_PARTS[0];
  const series = keysOf(part).map((k, i) => ({
    name: part.sides ? (i ? 'Rechts' : 'Links') : part.label,
    cls: i ? 'alt' : '',
    points: ms.filter((m) => m.values[k] != null).map((m) => ({ x: isoToTs(m.date), y: m.values[k] })),
  }));

  const table = lastM ? `
    <div class="m-table">
      <div class="m-row m-head"><span>Meetpunt</span><span>Links</span><span>Rechts</span></div>
      ${MEASURE_PARTS.map((p) => {
        const unit = p.unit || 'cm';
        const good = !['waist', 'hips', 'bodyfat'].includes(p.key);
        if (p.sides) {
          const [l, r] = keysOf(p);
          if (lastM.values[l] == null && lastM.values[r] == null) return '';
          return `<div class="m-row"><span>${p.label}</span>
            <span>${lastM.values[l] != null ? `${fmtNum(lastM.values[l], 1)} ${deltaHtml(lastM.values[l], prevM?.values[l], good)}` : '–'}</span>
            <span>${lastM.values[r] != null ? `${fmtNum(lastM.values[r], 1)} ${deltaHtml(lastM.values[r], prevM?.values[r], good)}` : '–'}</span></div>`;
        }
        if (lastM.values[p.key] == null) return '';
        return `<div class="m-row"><span>${p.label}</span><span class="m-span">${fmtNum(lastM.values[p.key], 1)} ${unit} ${deltaHtml(lastM.values[p.key], prevM?.values[p.key], good)}</span></div>`;
      }).join('')}
    </div>
    <p class="muted small">Laatste meting: ${fmtDate(isoToTs(lastM.date), { day: 'numeric', month: 'long', year: 'numeric' })}${prevM ? ` · verschil t.o.v. ${fmtDate(isoToTs(prevM.date), { day: 'numeric', month: 'short' })}` : ''}</p>` : '<p class="empty">Nog geen metingen.</p>';

  return `
    <header class="page-head"><h1>Lichaam</h1></header>

    <section class="card">
      <div class="card-head"><div><h2>Lichaamsgewicht</h2>
        <div class="muted small">${latest ? `${fmtDate(isoToTs(latest.date), { day: 'numeric', month: 'short' })}` : 'Weeg jezelf ’s ochtends, nuchter'}</div></div>
        ${latest ? `<div class="big-num">${fmtNum(latest.kg, 1)}<small> kg</small> ${monthAgo ? deltaHtml(latest.kg, monthAgo.kg) : ''}</div>` : ''}</div>
      ${lineChart({ series: [{ name: 'Gewicht', points: bw.map((x) => ({ x: isoToTs(x.date), y: x.kg })) }] })}
      <div class="inline-form">
        <input type="date" id="bw-date" value="${todayISO()}" max="${todayISO()}">
        <input id="bw-kg" inputmode="decimal" placeholder="kg" value="">
        <button class="btn btn-primary" data-action="bw-add">Opslaan</button>
      </div>
      ${bw.length ? `<details class="log"><summary>Alle wegingen (${bw.length})</summary>
        ${[...bw].reverse().map((x) => `<div class="log-row"><span>${fmtDate(isoToTs(x.date), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span><span>${fmtNum(x.kg, 1)} kg</span>
        <button class="icon-btn icon-btn-sm danger" data-action="bw-del" data-id="${x.id}" aria-label="Verwijderen">${icon('trash')}</button></div>`).join('')}</details>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Omtrekmaten</h2><div class="muted small">in cm, links en rechts apart</div></div>
        <button class="btn btn-primary btn-sm" data-action="go" data-href="#/measure/new">${icon('plus')} Meting</button></div>
      ${table}
    </section>

    ${ms.length ? `<section class="card">
      <div class="card-head"><h2>Verloop</h2></div>
      <select class="select" data-input="body-part">${MEASURE_PARTS.map((p) => `<option value="${p.key}" ${p.key === chartPart ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
      ${lineChart({ series })}
    </section>
    <section class="card"><div class="card-head"><h2>Alle metingen</h2></div><div class="list list-flat">
      ${[...ms].reverse().map((m) => `<button class="list-item" data-action="go" data-href="#/measure/${m.id}">
        <div class="li-main"><div class="li-title">${fmtDate(isoToTs(m.date), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div class="li-sub">${Object.keys(m.values).length} waarden</div></div>${icon('chevronRight', 'muted')}</button>`).join('')}
    </div></section>` : ''}`;
}

export function renderMeasureForm(id) {
  const s = getState();
  const m = id === 'new' ? null : s.measurements.find((x) => x.id === id);
  const prev = [...s.measurements].sort(byDate).filter((x) => x.id !== id).at(-1);
  const v = m?.values || {};
  const field = (k, label) => `<label class="m-field"><span>${label}</span>
    <input inputmode="decimal" data-mkey="${k}" value="${fmtNum(v[k], 1)}" placeholder="${prev?.values[k] != null ? fmtNum(prev.values[k], 1) : '–'}"></label>`;
  return `
    <header class="page-head sticky-head">
      <button class="link-btn" data-action="back">Annuleer</button>
      <h1 class="h-sm">${m ? 'Meting bewerken' : 'Nieuwe meting'}</h1>
      <button class="btn btn-primary btn-sm" data-action="m-save" data-id="${esc(id)}">Opslaan</button>
    </header>
    <section class="card form">
      <label>Datum<input type="date" id="m-date" value="${m?.date || todayISO()}" max="${todayISO()}"></label>
      <p class="muted small">Meet op hetzelfde moment van de dag, met een flexibel meetlint. Grijze getallen = vorige meting.</p>
    </section>
    <section class="card">
      <div class="m-grid-head"><span></span><span>Links</span><span>Rechts</span></div>
      ${MEASURE_PARTS.filter((p) => p.sides).map((p) => `<div class="m-grid"><span class="m-label">${p.label}</span>${field(`${p.key}_L`, 'L')}${field(`${p.key}_R`, 'R')}</div>`).join('')}
    </section>
    <section class="card">
      ${MEASURE_PARTS.filter((p) => !p.sides).map((p) => `<div class="m-grid m-grid-single"><span class="m-label">${p.label}${p.unit ? ` (${p.unit})` : ''}</span>${field(p.key, '')}</div>`).join('')}
    </section>
    ${m ? `<button class="btn btn-danger-soft btn-block" data-action="m-del" data-id="${m.id}">${icon('trash')} Meting verwijderen</button>` : ''}`;
}

on({
  'bw-add': () => {
    const kg = num(document.getElementById('bw-kg').value);
    const date = document.getElementById('bw-date').value || todayISO();
    if (!kg || kg < 20 || kg > 400) return toast('Vul een geldig gewicht in');
    update((s) => {
      const existing = s.bodyweight.find((x) => x.date === date);
      if (existing) existing.kg = kg;
      else s.bodyweight.push({ id: uid(), date, kg });
    });
    toast('Gewicht opgeslagen');
  },
  'bw-del': async (el) => {
    if (!(await confirmDialog('Weging verwijderen?', null, 'Verwijderen', true))) return;
    update((s) => { s.bodyweight = s.bodyweight.filter((x) => x.id !== el.dataset.id); });
  },
  'body-part': (el) => { chartPart = el.value; go(location.hash); },
  'm-save': (el) => {
    const values = {};
    document.querySelectorAll('[data-mkey]').forEach((i) => { const n = num(i.value); if (n != null) values[i.dataset.mkey] = n; });
    if (!Object.keys(values).length) return toast('Vul minstens één maat in');
    const date = document.getElementById('m-date').value || todayISO();
    const id = el.dataset.id;
    update((s) => {
      const m = s.measurements.find((x) => x.id === id);
      if (m) { m.date = date; m.values = values; }
      else s.measurements.push({ id: uid(), date, values });
    });
    toast('Meting opgeslagen');
    go('#/body');
  },
  'm-del': async (el) => {
    if (!(await confirmDialog('Meting verwijderen?', null, 'Verwijderen', true))) return;
    update((s) => { s.measurements = s.measurements.filter((x) => x.id !== el.dataset.id); });
    go('#/body');
  },
});
