import { getState, update, uid } from '../store.js';
import { esc, on, go, icon, fmtNum, fmtDate, todayISO, isoToTs, num, confirmDialog, toast, sheetPromise } from '../ui.js';
import { lineChart } from '../charts.js';
import { renderFood, mountFood } from './food.js';
import { navyBodyFat, bodyFatCategory } from '../nutrition.js';

const PART_KEY = 'trainer.bodyPart';
function lastPart() { try { return localStorage.getItem(PART_KEY) || 'food'; } catch { return 'food'; } }
function rememberPart(p) { try { localStorage.setItem(PART_KEY, p); } catch { /* private mode */ } }

/** Lichaam tab: Voeding or Gewicht & maten (`#/body/food`, `#/body/weight`). */
export function renderBodyTab(part) {
  const p = part === 'weight' || part === 'food' ? part : lastPart();
  rememberPart(p);
  return `
    <header class="page-head"><h1>Lichaam</h1></header>
    <div class="segmented">
      <button class="${p === 'food' ? 'on' : ''}" data-action="go" data-href="#/body/food">Voeding</button>
      <button class="${p === 'weight' ? 'on' : ''}" data-action="go" data-href="#/body/weight">Gewicht &amp; maten</button>
    </div>
    ${p === 'food' ? renderFood() : renderBody()}`;
}

export function mountBodyTab(part) {
  if ((part === 'weight' || part === 'food' ? part : lastPart()) === 'food') mountFood();
}

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

// BMI categories (WHO). For strength athletes BMI overestimates fat: muscle weighs too.
const BMI_CATS = [
  { max: 18.5, label: 'Ondergewicht', cls: 'is-low' },
  { max: 25, label: 'Gezond gewicht', cls: 'is-ok' },
  { max: 30, label: 'Overgewicht', cls: 'is-mid' },
  { max: Infinity, label: 'Obesitas', cls: 'is-high' },
];

/** BMI card: latest weight / height², with the WHO band and the waist-to-height ratio when a waist is measured. */
function bmiCard(latest, lastM) {
  const h = getState().profile.body?.heightCm;
  if (!h) {
    return `<section class="card">
      <div class="card-head"><div><h2>BMI</h2><div class="muted small">Vul je lengte in om je BMI te zien</div></div>
        <button class="btn btn-soft btn-sm" data-action="bmi-height">${icon('edit')} Lengte</button></div>
    </section>`;
  }
  if (!latest) return '';
  const m = h / 100;
  const bmi = latest.kg / (m * m);
  const cat = BMI_CATS.find((c) => bmi < c.max);
  // scale 15–35 → 0–100%
  const pos = (v) => Math.max(0, Math.min(100, ((v - 15) / 20) * 100));
  const waist = lastM?.values?.waist;
  const whtr = waist ? waist / h : null;
  return `<section class="card">
    <div class="card-head"><div><h2>BMI</h2><div class="muted small">${fmtNum(latest.kg, 1)} kg · ${fmtNum(h, 0)} cm</div></div>
      <div class="big-num">${fmtNum(bmi, 1)}</div></div>
    <div class="bmi-scale">
      <span style="left:0;width:${pos(18.5)}%" class="is-low"></span>
      <span style="left:${pos(18.5)}%;width:${pos(25) - pos(18.5)}%" class="is-ok"></span>
      <span style="left:${pos(25)}%;width:${pos(30) - pos(25)}%" class="is-mid"></span>
      <span style="left:${pos(30)}%;width:${100 - pos(30)}%" class="is-high"></span>
      <i style="left:${pos(bmi)}%"></i>
    </div>
    <div class="bmi-labels"><span>18,5</span><span>25</span><span>30</span></div>
    <p class="bmi-cat ${cat.cls}">${cat.label}</p>
    ${whtr ? `<p class="muted small">Taille/lengte: <b>${fmtNum(whtr, 2)}</b> ${whtr < 0.5 ? '(gezond, onder 0,5)' : '(boven 0,5: let op buikvet)'}</p>` : ''}
    <p class="muted small">Let op: BMI ziet geen verschil tussen spieren en vet. Bij krachtsporters valt hij vaak hoger uit
      dan hun vetpercentage doet vermoeden; je taille (in je metingen) zegt meer.
      <button class="link-btn link-inline" data-action="bmi-height">Lengte/geslacht wijzigen</button></p>
  </section>`;
}

/** Weighing on or before a date (else the first one). */
function weightAt(bw, iso) {
  let kg = bw[0]?.kg ?? null;
  for (const b of bw) { if (b.date <= iso) kg = b.kg; else break; }
  return kg;
}

/** Body-fat estimate (Navy method) per measurement, with fat and lean mass from the weighing of that day. */
function bodyFatSeries(bw, ms) {
  const body = getState().profile.body || {};
  return ms.map((m) => {
    const bf = navyBodyFat({ sex: body.sex, heightCm: body.heightCm, waist: m.values.waist, neck: m.values.neck, hips: m.values.hips });
    if (bf == null) return null;
    const kg = weightAt(bw, m.date);
    return { date: m.date, bf, kg, fat: kg != null ? (kg * bf) / 100 : null, lean: kg != null ? kg * (1 - bf / 100) : null };
  }).filter(Boolean);
}

function signed(n, d = 1) { return `${n > 0 ? '+' : ''}${fmtNum(n, d)}`; }

function bodyFatCard(bw, ms) {
  const body = getState().profile.body || {};
  const female = body.sex === 'f';
  const need = female ? 'taille, heupen en nek' : 'taille (op navelhoogte) en nek';
  if (!body.heightCm) return '';
  const series = bodyFatSeries(bw, ms);
  const last = series.at(-1);
  if (!last) {
    return `<section class="card">
      <div class="card-head"><div><h2>Vetpercentage</h2><div class="muted small">Schatting met de Navy-methode</div></div></div>
      <p class="sheet-text">Meet je ${need} bij een nieuwe meting, dan schat je trainer je vetpercentage en zie je of je aankomt in spieren of in vet.</p>
      <button class="btn btn-primary btn-block" data-action="go" data-href="#/measure/new">${icon('plus')} Meting</button>
    </section>`;
  }
  const first = series[0];
  const cat = bodyFatCategory(last.bf, body.sex);
  const manual = [...ms].reverse().find((m) => m.values.bodyfat != null);
  let change = '';
  if (series.length > 1 && last.lean != null && first.lean != null) {
    const dLean = last.lean - first.lean;
    const dFat = last.fat - first.fat;
    const verdict = dLean > 0 && dFat <= dLean ? 'Je komt vooral aan in spiermassa. Zo moet een bulk eruitzien!'
      : dLean > 0 ? 'Je komt meer aan in vet dan in spieren: overweeg je caloriedoel iets te verlagen.'
      : dFat < 0 ? 'Je verliest vet. Hou je eiwit hoog om je spieren te behouden.'
      : 'Nog weinig verandering; meet elke 2–4 weken voor een duidelijk beeld.';
    change = `<div class="goal-grid">
      <div><span>Vetvrije massa</span><b>${signed(dLean)} kg</b></div>
      <div><span>Vetmassa</span><b>${signed(dFat)} kg</b></div>
    </div>
    <p class="food-tip">${verdict} <span class="muted">(sinds ${fmtDate(isoToTs(first.date), { day: 'numeric', month: 'short' })})</span></p>`;
  }
  return `<section class="card">
    <div class="card-head"><div><h2>Vetpercentage</h2><div class="muted small">Schatting (Navy-methode) · ${fmtDate(isoToTs(last.date), { day: 'numeric', month: 'short' })}</div></div>
      <div class="big-num">${fmtNum(last.bf, 1)}<small>%</small></div></div>
    <p class="bmi-cat ${cat.cls}">${cat.label}</p>
    ${last.lean != null ? `<div class="goal-grid">
      <div><span>Vetvrije massa</span><b>${fmtNum(last.lean, 1)} kg</b></div>
      <div><span>Vetmassa</span><b>${fmtNum(last.fat, 1)} kg</b></div>
    </div>` : ''}
    ${change}
    ${series.length > 1 ? lineChart({ series: [{ name: 'Vet %', points: series.map((x) => ({ x: isoToTs(x.date), y: x.bf })) }] }) : ''}
    ${manual ? `<p class="muted small">Zelf ingevuld (${fmtDate(isoToTs(manual.date), { day: 'numeric', month: 'short' })}): ${fmtNum(manual.values.bodyfat, 1)}%.</p>` : ''}
    <p class="muted small">Gebaseerd op ${need} en je lengte. Een schatting (±3–4%), maar op hetzelfde moment en op dezelfde plek gemeten
      laat hij goed zien welke kant het op gaat.</p>
  </section>`;
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

    ${bmiCard(latest, lastM)}
    ${bodyFatCard(bw, ms)}

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
  'bmi-height': async () => {
    const body = getState().profile.body || {};
    const cur = body.heightCm;
    const { el, result } = sheetPromise(`
      <h3 class="sheet-title">Lengte en geslacht</h3>
      <p class="sheet-text">Nodig voor je BMI en de schatting van je vetpercentage.</p>
      <form class="form">
        <label>Lengte in cm<input id="h-cm" inputmode="numeric" value="${cur || ''}" placeholder="180"></label>
        <label>Geslacht<select id="h-sex"><option value="m" ${body.sex !== 'f' ? 'selected' : ''}>Man</option><option value="f" ${body.sex === 'f' ? 'selected' : ''}>Vrouw</option></select></label>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="ok">Opslaan</button>
          <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button>
        </div>
      </form>`);
    const input = el.querySelector('#h-cm');
    let v = input.value;
    let sex = el.querySelector('#h-sex').value;
    input.addEventListener('input', () => { v = input.value; });
    el.querySelector('#h-sex').addEventListener('change', (e) => { sex = e.target.value; });
    if ((await result) !== 'ok') return;
    const h = num(v);
    if (!(h > 120 && h < 230)) return toast('Vul een lengte tussen 120 en 230 cm in');
    update((s) => { s.profile.body = { ...(s.profile.body || {}), heightCm: Math.round(h), sex }; });
  },
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
    go('#/body/weight');
  },
  'm-del': async (el) => {
    if (!(await confirmDialog('Meting verwijderen?', null, 'Verwijderen', true))) return;
    update((s) => { s.measurements = s.measurements.filter((x) => x.id !== el.dataset.id); });
    go('#/body/weight');
  },
});
