// Food log (part of the Lichaam tab): day overview vs targets, add via barcode / search / own products,
// and the adaptive calorie goal. Rules: js/nutrition.js + docs/TRAINING_PRINCIPLES.md.
import { getState, update, uid } from '../store.js';
import { esc, on, go, icon, fmtNum, fmtDate, todayISO, isoToTs, num, toast, sheetPromise, confirmDialog, sfx, unlockAudio, dialogSequence } from '../ui.js';
import { barChart } from '../charts.js';
import {
  MEALS, GOALS, ACTIVITY, targets, sumEntries, nutrientsFor, latestWeight, estimateTdee, weightTrend,
  adaptiveCheck, localISO, proteinDays,
} from '../nutrition.js';
import { computeTeam, XP } from '../game/xp.js';
import { computeBadges, badgeSvg } from '../game/badges.js';
import { monsterName } from '../game/monsters.js';
import { productByBarcode, searchProducts, scanBarcode } from '../food-api.js';

const DAY = 86400000;
let foodDate = null; // YYYY-MM-DD shown on the food page (null = today)
let query = '';
let results = null; // Open Food Facts search results (null = no search yet)
let searching = false;

const day = () => foodDate || todayISO();
const shiftISO = (iso, d) => localISO(isoToTs(iso) + d * DAY);
const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label || id;
const g1 = (n) => fmtNum(n, 0);
/** 'g' or 'ml' (drinks). Nutrition values are always per 100 of that unit. */
const unitOf = (x) => (x?.unit === 'ml' ? 'ml' : 'g');

function dayLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'Vandaag';
  if (iso === shiftISO(today, -1)) return 'Gisteren';
  return fmtDate(isoToTs(iso), { weekday: 'short', day: 'numeric', month: 'short' });
}

function macroBar(label, val, goal, unit, cls = '') {
  const p = goal ? Math.min(100, (val / goal) * 100) : 0;
  const over = goal && val > goal * 1.1;
  return `<div class="macro ${cls} ${over ? 'is-over' : ''}">
    <div class="macro-head"><span>${label}</span><span><b>${g1(val)}</b>${goal ? `/${g1(goal)}` : ''} ${unit}</span></div>
    <div class="macro-bar"><i style="width:${p}%"></i></div>
  </div>`;
}

function trainerLine(t, tot) {
  if (!t) return '';
  const p = t.protein - tot.protein;
  const k = t.kcal - tot.kcal;
  if (!tot.kcal) return 'Log je eerste maaltijd van de dag. Eiwit bij elke maaltijd helpt je spieren het meest.';
  if (p <= 0) {
    const rest = k > 300 ? ` Nog ${g1(k)} kcal te gaan.` : k < -250 ? ` ${g1(-k)} kcal boven je doel.` : '';
    return `Eiwitdoel gehaald ✓ +${XP.protein} EXP. voor je team!${rest}`;
  }
  if (p > 25) return `Nog ${g1(p)} g eiwit te gaan, bv. magere kwark, kip of een shake.`;
  if (k > 300) return `Eiwit zit goed! Nog ${g1(k)} kcal te gaan voor je doel.`;
  if (k < -250) return `${g1(-k)} kcal boven je doel. Geen ramp, het weekgemiddelde telt.`;
  return 'Doel bijna of helemaal gehaald. Sterk bezig!';
}

/** Food page body (inside the Lichaam tab). */
export function renderFood() {
  const s = getState();
  const d = day();
  const entries = (s.foodLog || []).filter((e) => e.date === d);
  const tot = sumEntries(entries);
  const t = targets(s);
  const weighedToday = (s.bodyweight || []).some((b) => b.date === todayISO());
  const yday = shiftISO(d, -1);

  const summary = t ? `
    <section class="card food-sum">
      ${macroBar('Calorieën', tot.kcal, t.kcal, 'kcal', 'macro-kcal')}
      <div class="macro-grid">
        ${macroBar('Eiwit', tot.protein, t.protein, 'g', 'macro-p')}
        ${macroBar('Koolh.', tot.carbs, t.carbs, 'g', 'macro-c')}
        ${macroBar('Vet', tot.fat, t.fat, 'g', 'macro-f')}
      </div>
      <p class="food-tip">${esc(trainerLine(t, tot))}</p>
    </section>` : `
    <section class="card food-sum">
      <div class="row-between"><div><strong>Totaal</strong><div class="muted small">${g1(tot.kcal)} kcal · ${g1(tot.protein)} g eiwit</div></div></div>
      <p class="sheet-text">Stel je doel in: dan rekent je trainer uit hoeveel calorieën en eiwit je nodig hebt voor spiergroei.</p>
      <button class="btn btn-primary btn-block" data-action="food-setup">${icon('sparkle')} Doel instellen</button>
    </section>`;

  const meals = MEALS.map((m) => {
    const list = entries.filter((e) => e.meal === m.id);
    const kcal = list.reduce((a, e) => a + (e.kcal || 0), 0);
    const canCopy = !list.length && (s.foodLog || []).some((e) => e.date === yday && e.meal === m.id);
    return `<section class="card meal">
      <div class="card-head"><div><h2>${m.label}</h2>${list.length ? `<div class="muted small">${g1(kcal)} kcal</div>` : ''}</div>
        <button class="icon-btn accent" data-action="go" data-href="#/food-add/${m.id}" aria-label="${m.label} toevoegen">${icon('plus')}</button></div>
      ${list.length ? `<div class="list list-flat">${list.map((e) => `
        <button class="list-item food-row" data-action="food-entry" data-id="${e.id}">
          <div class="li-main"><div class="li-title">${esc(e.name)}</div>
          <div class="li-sub">${g1(e.grams)} ${unitOf(e)} · ${fmtNum(e.protein, 1)} g eiwit</div></div>
          <span class="food-kcal">${g1(e.kcal)}<small> kcal</small></span></button>`).join('')}</div>` : ''}
      ${list.length > 1 ? `<button class="link-btn" data-action="meal-save" data-meal="${m.id}">${icon('sparkle')} Opslaan als vaste maaltijd</button>` : ''}
      ${canCopy ? `<button class="link-btn" data-action="food-copy" data-meal="${m.id}">${icon('copy')} Kopieer van ${d === todayISO() ? 'gisteren' : 'vorige dag'}</button>` : ''}
    </section>`;
  }).join('');

  return `
    <div class="day-nav">
      <button class="icon-btn" data-action="food-day" data-d="-1" aria-label="Vorige dag">${icon('chevronLeft')}</button>
      <button class="day-label" data-action="food-day" data-d="0">${esc(dayLabel(d))}</button>
      <button class="icon-btn" data-action="food-day" data-d="1" aria-label="Volgende dag" ${d >= todayISO() ? 'disabled' : ''}>${icon('chevronRight')}</button>
    </div>
    ${!weighedToday && d === todayISO() ? `<button class="chip-btn weigh-chip" data-action="go" data-href="#/body/weight">Weeg je vandaag ${icon('chevronRight')}</button>` : ''}
    ${summary}
    ${meals}
    ${goalCard()}`;
}

function goalCard() {
  const s = getState();
  const n = s.settings.nutrition;
  const t = targets(s);
  if (!n?.tdee || !t) return '';
  const kg = latestWeight(s);
  const trend = weightTrend(s);
  const want = (GOALS[n.goal]?.rate || 0) * kg;
  const check = adaptiveCheck(s);
  const days = Array.from({ length: 14 }, (_, i) => shiftISO(todayISO(), i - 13));
  const perDay = days.map((iso) => Math.round(sumEntries((s.foodLog || []).filter((e) => e.date === iso)).kcal));
  const last = (n.history || []).at(-1);
  return `<section class="card">
    <div class="card-head"><div><h2>Je doel</h2><div class="muted small">${esc(GOALS[n.goal]?.label || '')}</div></div>
      <button class="btn btn-soft btn-sm" data-action="food-setup">${icon('edit')} Aanpassen</button></div>
    <div class="goal-grid">
      <div><span>Doel</span><b>${t.kcal} kcal</b></div>
      <div><span>Verbruik (schatting)</span><b>${n.tdee} kcal</b></div>
      <div><span>Gewichtstrend</span><b>${trend ? `${trend.kgPerWeek >= 0 ? '+' : ''}${fmtNum(trend.kgPerWeek, 2)} kg/wk` : '–'}</b></div>
      <div><span>Gewenst tempo</span><b>${want >= 0 ? '+' : ''}${fmtNum(want, 2)} kg/wk</b></div>
    </div>
    ${barChart({ labels: days.map((iso, i) => (i % 2 ? '' : String(new Date(isoToTs(iso)).getDate()))), values: perDay, goal: t.kcal, highlight: 13 })}
    <p class="muted small">${n.kcalOverride ? 'Je gebruikt een vast caloriedoel; de slimme aanpassing staat uit.'
      : check.due && !check.ok ? esc(check.reason)
      : `Elke week vergelijkt je trainer wat je eet met je gewichtstrend en past je doel aan.${last ? ` Laatste aanpassing: ${fmtDate(last.at, { day: 'numeric', month: 'short' })} → ${last.kcal} kcal.` : ''}`}</p>
  </section>`;
}

/** Runs the weekly adaptive step once when the food page is shown. */
export function mountFood() {
  const s = getState();
  const c = adaptiveCheck(s);
  if (!c.due || !c.ok) return;
  update((st) => {
    const n = st.settings.nutrition;
    n.tdee = c.tdee;
    n.adjustedAt = Date.now();
    n.history = [...(n.history || []), { at: Date.now(), tdee: c.tdee, kcal: c.after }].slice(-26);
  });
  const dir = c.after > c.before ? 'omhoog' : c.after < c.before ? 'omlaag' : 'gelijk';
  toast(`Doel ${dir}: ${c.before} → ${c.after} kcal (trend ${c.kgPerWeek >= 0 ? '+' : ''}${fmtNum(c.kgPerWeek, 2)} kg/wk)`);
}

// ---------- Add page ----------
export function renderFoodAdd(meal = 'snack') {
  const s = getState();
  const q = query.trim().toLowerCase();
  const mine = [...(s.foods || [])]
    .filter((f) => !q || `${f.name} ${f.brand || ''}`.toLowerCase().includes(q))
    .sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0))
    .slice(0, q ? 30 : 15);
  const savedMeals = [...(s.meals || [])]
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
  const item = (f, src, i) => `<button class="list-item" data-action="food-pick" data-src="${src}" data-i="${i}" data-meal="${esc(meal)}">
    <div class="li-main"><div class="li-title">${esc(f.name)}</div>
    <div class="li-sub">${f.brand ? `${esc(f.brand)} · ` : ''}${f.per100.kcal} kcal · ${fmtNum(f.per100.protein, 1)} g eiwit /100 ${unitOf(f)}</div></div>${icon('plus', 'muted')}</button>`;

  return `
    <header class="page-head sticky-head">
      <button class="icon-btn" data-action="back" aria-label="Terug">${icon('chevronLeft')}</button>
      <h1 class="h-sm">${esc(mealLabel(meal))} · ${esc(dayLabel(day()))}</h1><span></span>
    </header>
    <div class="food-actions">
      <button class="btn btn-primary" data-action="food-scan" data-meal="${esc(meal)}">${icon('search')} Scan barcode</button>
      <button class="btn btn-soft" data-action="food-new" data-meal="${esc(meal)}">${icon('plus')} Nieuw product</button>
    </div>
    <form class="search-form">
      <input class="select" id="food-q" type="search" enterkeyhint="search" placeholder="Zoek product, bv. magere kwark" value="${esc(query)}" data-input="food-q" data-live>
      <button class="btn btn-secondary" data-action="food-search">${searching ? '…' : 'Zoek'}</button>
    </form>
    <button class="link-btn" data-action="food-code" data-meal="${esc(meal)}">Barcode intypen</button>
    ${savedMeals.length ? `<h2 class="section-title">Vaste maaltijden</h2><div class="list">${savedMeals.map((sm) => `
      <button class="list-item" data-action="meal-pick" data-id="${sm.id}" data-meal="${esc(meal)}">
        <div class="li-main"><div class="li-title">${esc(sm.name)}</div>
        <div class="li-sub">${sm.items.length} producten · ${g1(mealTotals(sm).kcal)} kcal · ${fmtNum(mealTotals(sm).protein, 1)} g eiwit</div></div>${icon('plus', 'muted')}</button>`).join('')}</div>` : ''}
    ${mine.length ? `<h2 class="section-title">${q ? 'Mijn producten' : 'Recent'}</h2><div class="list">${mine.map((f) => item(f, 'mine', s.foods.indexOf(f))).join('')}</div>` : ''}
    ${results ? `<h2 class="section-title">Open Food Facts</h2>${results.length
      ? `<div class="list">${results.map((f, i) => item(f, 'off', i)).join('')}</div>`
      : '<p class="empty">Niets gevonden. Probeer een andere naam of voeg het product zelf toe.</p>'}` : ''}
    ${!mine.length && !savedMeals.length && !results ? '<p class="empty">Scan een barcode of zoek een product. Wat je toevoegt, komt hier bij Recent.</p>' : ''}`;
}

export function mountFoodAdd() {
  const input = document.getElementById('food-q');
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
}

async function runSearch() {
  const q = query.trim();
  if (q.length < 2 || searching) return;
  searching = true;
  go(location.hash);
  try {
    results = await searchProducts(q);
  } catch {
    results = null;
    toast('Zoeken lukt niet, ben je online?');
  }
  searching = false;
  go(location.hash);
}

/** Saves a product to "Mijn producten" (dedup by barcode or name+brand) and returns its id. */
function rememberFood(food, grams) {
  let id = food.id;
  update((s) => {
    s.foods = s.foods || [];
    let f = s.foods.find((x) => (id && x.id === id) || (food.barcode && x.barcode === food.barcode)
      || (x.name === food.name && (x.brand || '') === (food.brand || '')));
    if (!f) { f = { ...food, id: uid() }; s.foods.push(f); }
    f.usedAt = Date.now();
    f.lastGrams = grams;
    f.unit = unitOf(food);
    id = f.id;
  }, { silent: true });
  return id;
}

async function amountSheet(food, { grams, title = 'Toevoegen', del = false } = {}) {
  const start = grams || food.lastGrams || food.serving?.g || 100;
  let unit = unitOf(food);
  const quick = [...new Set([food.serving?.g, 100, food.lastGrams].filter((g) => g > 0))];
  const { el, result } = sheetPromise(`
    <h3 class="sheet-title">${esc(food.name)}</h3>
    <p class="sheet-text">${food.brand ? `${esc(food.brand)} · ` : ''}per 100 <span data-unit>${unit}</span>: ${food.per100.kcal} kcal · E ${fmtNum(food.per100.protein, 1)} · K ${fmtNum(food.per100.carbs, 1)} · V ${fmtNum(food.per100.fat, 1)}</p>
    <form class="form">
      <div class="amt-row"><label>Hoeveelheid<input id="amt-g" inputmode="decimal" value="${fmtNum(start, 1)}"></label>
        <div class="unit-toggle" role="group" aria-label="Eenheid">${['g', 'ml'].map((u) => `<button type="button" class="${u === unit ? 'on' : ''}" data-unit-set="${u}">${u}</button>`).join('')}</div></div>
      <div class="chip-row">${quick.map((g) => `<button type="button" class="chip-btn" data-g="${g}">${g === food.serving?.g ? `1 portie (${fmtNum(g, 0)} <span data-unit>${unit}</span>)` : `${fmtNum(g, 0)} <span data-unit>${unit}</span>`}</button>`).join('')}</div>
      <div class="amt-preview" id="amt-prev"></div>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="ok">${esc(title)}</button>
        ${del ? '<button class="btn btn-danger-soft btn-block" data-action="sheet-resolve" data-value="del" type="button">Verwijderen</button>' : ''}
        <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button>
      </div>
    </form>`);
  const input = el.querySelector('#amt-g');
  const prev = el.querySelector('#amt-prev');
  let value = start;
  const show = () => {
    const n = nutrientsFor(food.per100, value || 0);
    prev.innerHTML = `<b>${n.kcal} kcal</b> · ${fmtNum(n.protein, 1)} g eiwit · ${fmtNum(n.carbs, 1)} g koolh. · ${fmtNum(n.fat, 1)} g vet`;
  };
  input.addEventListener('input', () => { value = num(input.value) || 0; show(); });
  el.querySelectorAll('[data-unit-set]').forEach((b) => b.addEventListener('click', () => {
    unit = b.dataset.unitSet;
    el.querySelectorAll('[data-unit-set]').forEach((x) => x.classList.toggle('on', x === b));
    el.querySelectorAll('[data-unit]').forEach((x) => { x.textContent = unit; });
  }));
  el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { value = Number(b.dataset.g); input.value = fmtNum(value, 1); show(); }));
  show();
  const r = await result;
  if (r === 'del') return { del: true };
  if (r !== 'ok') return null;
  if (!(value > 0) || value > 5000) { toast('Vul een geldige hoeveelheid in'); return null; }
  return { grams: value, unit };
}

async function addFood(food, meal) {
  const r = await amountSheet(food);
  if (!r?.grams) return;
  food = { ...food, unit: r.unit };
  const foodId = rememberFood(food, r.grams);
  const snap = gameSnapshot();
  update((s) => {
    s.foodLog = s.foodLog || [];
    s.foodLog.push({ id: uid(), date: day(), meal, foodId, name: food.name, grams: r.grams, unit: r.unit, ...nutrientsFor(food.per100, r.grams) });
  }, { silent: true });
  toast(`${food.name} toegevoegd`);
  query = '';
  results = null;
  go('#/body/food');
  celebrate(snap);
}

// ---------- Protein goal → monster EXP ----------
/** Game state before a food change, to detect a newly reached protein goal afterwards. */
function gameSnapshot() {
  const s = getState();
  return {
    days: new Set(proteinDays(s)),
    levels: new Map(computeTeam(s).team.map((t) => [t.muscle, t])),
    badge: computeBadges(s).find((b) => b.id === 'eiwit')?.earned,
  };
}

async function celebrate(before) {
  const s = getState();
  const fresh = proteinDays(s).filter((d) => !before.days.has(d));
  if (!fresh.length) return;
  const sound = s.settings.sound;
  const nicks = s.profile.monsterNames || {};
  const when = fresh[0] === todayISO() ? '' : ` (${dayLabel(fresh[0]).toLowerCase()})`;
  const steps = [{
    text: `Eiwitdoel gehaald${when}! Je hele team krijgt +${XP.protein * fresh.length} EXP.`,
    stage: '<div class="gain-banner">★ EIWITDOEL ★</div>',
    onShow: () => sound && sfx('levelup'),
  }];
  for (const t of computeTeam(s).team) {
    const b = before.levels.get(t.muscle);
    if (b && t.level > b.level) {
      steps.push({ text: `${monsterName(t.muscle, b.form, nicks)} is gegroeid naar Lv${t.level}!`, onShow: () => sound && sfx('levelup') });
    }
    if (b && t.form > b.form) {
      steps.push({ text: `Wat? ${monsterName(t.muscle, b.form, nicks)} is geëvolueerd tot ${monsterName(t.muscle, t.form, nicks)}!`, onShow: () => sound && sfx('evolve') });
    }
  }
  const badge = computeBadges(s).find((b) => b.id === 'eiwit');
  if (badge?.earned && !before.badge) {
    steps.push({
      text: `Gefeliciteerd! Je hebt de EIWIT-BADGE verdiend! ${badge.desc}`,
      stage: `<div class="gain-card badge-gain">${badgeSvg('eiwit', true, 128)}<div class="gain-banner">★ NIEUWE BADGE ★</div></div>`,
      onShow: () => sound && sfx('levelup'),
    });
  }
  await dialogSequence(steps);
}

// ---------- Fixed meals ----------
const mealTotals = (sm) => sumEntries(sm.items.map((i) => nutrientsFor(i.per100, i.grams)));
const per100Of = (e, f) => f?.per100 || {
  kcal: (e.kcal / e.grams) * 100, protein: (e.protein / e.grams) * 100, carbs: (e.carbs / e.grams) * 100, fat: (e.fat / e.grams) * 100,
};

async function saveMeal(mealId) {
  const s = getState();
  const list = (s.foodLog || []).filter((e) => e.date === day() && e.meal === mealId);
  if (!list.length) return;
  const { el, result } = sheetPromise(`
    <h3 class="sheet-title">Vaste maaltijd opslaan</h3>
    <p class="sheet-text">${list.map((e) => `${esc(e.name)} (${g1(e.grams)} ${unitOf(e)})`).join(', ')}</p>
    <form class="form">
      <label>Naam<input id="meal-name" maxlength="40" value="${esc(mealLabel(mealId))}"></label>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="ok">Opslaan</button>
        <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button>
      </div>
    </form>`);
  const input = el.querySelector('#meal-name');
  let name = input.value;
  input.addEventListener('input', () => { name = input.value; });
  if ((await result) !== 'ok') return;
  name = name.trim() || mealLabel(mealId);
  update((st) => {
    st.meals = st.meals || [];
    st.meals.push({
      id: uid(), name, usedAt: Date.now(),
      items: list.map((e) => ({
        foodId: e.foodId, name: e.name, grams: e.grams, unit: unitOf(e),
        per100: per100Of(e, (st.foods || []).find((x) => x.id === e.foodId)),
      })),
    });
  }, { silent: true });
  toast(`"${name}" opgeslagen bij Vaste maaltijden`);
}

async function pickMeal(id, mealId) {
  const sm = (getState().meals || []).find((m) => m.id === id);
  if (!sm) return;
  const tot = mealTotals(sm);
  const { result } = sheetPromise(`
    <h3 class="sheet-title">${esc(sm.name)}</h3>
    <div class="list list-flat">${sm.items.map((i) => `<div class="list-item"><div class="li-main"><div class="li-title">${esc(i.name)}</div>
      <div class="li-sub">${g1(i.grams)} ${unitOf(i)}</div></div><span class="food-kcal">${g1(nutrientsFor(i.per100, i.grams).kcal)}<small> kcal</small></span></div>`).join('')}</div>
    <p class="amt-preview"><b>${g1(tot.kcal)} kcal</b> · ${fmtNum(tot.protein, 1)} g eiwit · ${fmtNum(tot.carbs, 1)} g koolh. · ${fmtNum(tot.fat, 1)} g vet</p>
    <div class="sheet-actions">
      <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="add">Alles toevoegen aan ${esc(mealLabel(mealId).toLowerCase())}</button>
      <button class="btn btn-danger-soft btn-block" data-action="sheet-resolve" data-value="del">Vaste maaltijd verwijderen</button>
      <button class="btn btn-secondary btn-block" data-action="sheet-dismiss">Annuleren</button>
    </div>`);
  const r = await result;
  if (r === 'del') {
    if (!(await confirmDialog(`"${sm.name}" verwijderen?`, 'Al gelogde maaltijden blijven staan.', 'Verwijderen', true))) return;
    update((st) => { st.meals = st.meals.filter((m) => m.id !== id); });
    return;
  }
  if (r !== 'add') return;
  const snap = gameSnapshot();
  update((st) => {
    const m = st.meals.find((x) => x.id === id);
    if (m) m.usedAt = Date.now();
    st.foodLog = st.foodLog || [];
    st.foodLog.push(...sm.items.map((i) => ({
      id: uid(), date: day(), meal: mealId, foodId: i.foodId, name: i.name, grams: i.grams, unit: unitOf(i), ...nutrientsFor(i.per100, i.grams),
    })));
  }, { silent: true });
  toast(`${sm.name} toegevoegd`);
  query = '';
  results = null;
  go('#/body/food');
  celebrate(snap);
}

async function productForm(meal, preset = {}) {
  const { el, result } = sheetPromise(`
    <h3 class="sheet-title">Nieuw product</h3>
    <p class="sheet-text">Neem de waarden per 100 g (of 100 ml bij drinken) over van het etiket.</p>
    <form class="form" id="np-form">
      <label>Naam<input name="name" value="${esc(preset.name || '')}" maxlength="80" placeholder="Magere kwark"></label>
      <label>Merk (optioneel)<input name="brand" value="${esc(preset.brand || '')}" maxlength="40"></label>
      <div class="np-grid">
        <label>kcal<input name="kcal" inputmode="decimal"></label>
        <label>Eiwit g<input name="protein" inputmode="decimal"></label>
        <label>Koolh. g<input name="carbs" inputmode="decimal"></label>
        <label>Vet g<input name="fat" inputmode="decimal"></label>
      </div>
      <label>Eenheid<select name="unit"><option value="g">gram (eten)</option><option value="ml">ml (drinken)</option></select></label>
      <label>Portie (optioneel)<input name="serving" inputmode="decimal" placeholder="bv. 150"></label>
      ${preset.barcode ? `<p class="muted small">Barcode ${esc(preset.barcode)}</p>` : ''}
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="ok">Opslaan</button>
        <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button>
      </div>
    </form>`);
  const form = el.querySelector('#np-form');
  let data = new FormData(form);
  form.addEventListener('input', () => { data = new FormData(form); });
  if ((await result) !== 'ok') return;
  const f = data;
  const name = String(f.get('name') || '').trim();
  const kcal = num(f.get('kcal'));
  if (!name || kcal == null) return toast('Vul minstens naam en kcal in');
  const serving = num(f.get('serving'));
  const food = {
    name, brand: String(f.get('brand') || '').trim() || undefined, barcode: preset.barcode,
    per100: { kcal: Math.round(kcal), protein: num(f.get('protein')) || 0, carbs: num(f.get('carbs')) || 0, fat: num(f.get('fat')) || 0 },
    serving: serving > 0 ? { label: `${serving} ${f.get('unit') === 'ml' ? 'ml' : 'g'}`, g: serving } : undefined,
    unit: f.get('unit') === 'ml' ? 'ml' : 'g',
    source: 'custom',
  };
  await addFood(food, meal);
}

async function lookupCode(code, meal) {
  const local = (getState().foods || []).find((f) => f.barcode === code);
  if (local) return addFood(local, meal);
  toast('Product opzoeken…');
  let food = null;
  try {
    food = await productByBarcode(code);
  } catch {
    return toast('Opzoeken lukt niet, ben je online?');
  }
  if (food) return addFood(food, meal);
  toast('Product niet gevonden, voeg het zelf toe');
  return productForm(meal, { barcode: code });
}

/** One-time / edit sheet for body data + goal. */
async function setupSheet() {
  const s = getState();
  const b = s.profile.body || {};
  const n = s.settings.nutrition || {};
  const kg = latestWeight(s);
  const sel = (name, obj, cur) => `<select name="${name}">${Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v.label || v)}</option>`).join('')}</select>`;
  const { el, result } = sheetPromise(`
    <h3 class="sheet-title">Voedingsdoel</h3>
    <p class="sheet-text">Je trainer schat je verbruik en past het daarna elke week aan op basis van je gewichtstrend.</p>
    <form class="form" id="ns-form">
      <label>Doel${sel('goal', GOALS, n.goal || 'bulk')}</label>
      <div class="np-grid">
        <label>Geslacht${sel('sex', { m: 'Man', f: 'Vrouw' }, b.sex || 'm')}</label>
        <label>Geboortejaar<input name="birthYear" inputmode="numeric" value="${b.birthYear || ''}" placeholder="1998"></label>
        <label>Lengte (cm)<input name="heightCm" inputmode="numeric" value="${b.heightCm || ''}" placeholder="180"></label>
        <label>Gewicht (kg)<input name="kg" inputmode="decimal" value="${kg ? fmtNum(kg, 1) : ''}" placeholder="75"></label>
      </div>
      <label>Activiteit buiten de gym${sel('activity', ACTIVITY, b.activity || 'mid')}</label>
      <label>Eiwit per kg lichaamsgewicht${sel('ppk', { '1.6': '1,6 g', '1.8': '1,8 g', '2': '2,0 g (aanbevolen)', '2.2': '2,2 g' }, String(n.proteinPerKg || 2))}</label>
      <label>Vast caloriedoel (optioneel)<input name="kcal" inputmode="numeric" value="${n.kcalOverride || ''}" placeholder="leeg = slim doel"></label>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="ok">Opslaan</button>
        <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button>
      </div>
    </form>`);
  const form = el.querySelector('#ns-form');
  let data = new FormData(form);
  form.addEventListener('input', () => { data = new FormData(form); });
  form.addEventListener('change', () => { data = new FormData(form); });
  if ((await result) !== 'ok') return;
  const body = { sex: data.get('sex'), birthYear: num(data.get('birthYear')), heightCm: num(data.get('heightCm')), activity: data.get('activity') };
  const weight = num(data.get('kg'));
  const year = new Date().getFullYear();
  if (!(body.birthYear > year - 100 && body.birthYear < year - 10) || !(body.heightCm > 120 && body.heightCm < 230) || !(weight > 30 && weight < 300)) {
    return toast('Vul geboortejaar, lengte en gewicht in');
  }
  const bodyChanged = ['sex', 'birthYear', 'heightCm', 'activity'].some((k) => body[k] !== b[k]);
  update((st) => {
    st.profile.body = body;
    if (weight !== kg) {
      const today = todayISO();
      const ex = st.bodyweight.find((x) => x.date === today);
      if (ex) ex.kg = weight; else st.bodyweight.push({ id: uid(), date: today, kg: weight });
    }
    const nn = st.settings.nutrition = { ...(st.settings.nutrition || {}) };
    nn.goal = data.get('goal');
    nn.proteinPerKg = Number(data.get('ppk'));
    nn.kcalOverride = num(data.get('kcal')) || null;
    if (!nn.tdee || bodyChanged) {
      nn.tdee = estimateTdee(body, weight);
      nn.adjustedAt = Date.now();
      nn.history = [];
    }
  });
  toast('Doel opgeslagen');
}

on({
  'food-day': (el) => {
    const d = Number(el.dataset.d);
    foodDate = d ? shiftISO(day(), d) : null;
    if (foodDate && foodDate >= todayISO()) foodDate = null;
    go(location.hash);
  },
  'food-setup': () => setupSheet(),
  'food-q': (el) => { query = el.value; if (!query.trim()) results = null; },
  'food-search': () => runSearch(),
  'food-pick': (el) => {
    const i = Number(el.dataset.i);
    const food = el.dataset.src === 'off' ? results?.[i] : getState().foods?.[i];
    if (food) addFood(food, el.dataset.meal);
  },
  'food-new': (el) => productForm(el.dataset.meal, { name: query.trim() }),
  'food-scan': async (el) => {
    unlockAudio();
    let code;
    try {
      code = await scanBarcode();
    } catch {
      return toast('Geen toegang tot de camera. Sta het toe of typ de barcode in.');
    }
    if (!code) return;
    sfx('blip');
    lookupCode(code, el.dataset.meal);
  },
  'food-code': async (el) => {
    const { el: sheet, result } = sheetPromise(`
      <h3 class="sheet-title">Barcode intypen</h3>
      <form class="form"><label>Cijfers onder de streepjes<input id="code-in" inputmode="numeric" maxlength="14"></label>
      <div class="sheet-actions"><button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="ok">Opzoeken</button>
      <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button></div></form>`);
    const input = sheet.querySelector('#code-in');
    let code = '';
    input.addEventListener('input', () => { code = input.value.replace(/\D/g, ''); });
    if ((await result) !== 'ok') return;
    if (code.length < 8) return toast('Een barcode heeft 8 tot 14 cijfers');
    lookupCode(code, el.dataset.meal);
  },
  'food-entry': async (el) => {
    const s = getState();
    const e = (s.foodLog || []).find((x) => x.id === el.dataset.id);
    if (!e) return;
    const f = (s.foods || []).find((x) => x.id === e.foodId);
    const per100 = f?.per100 || { kcal: (e.kcal / e.grams) * 100, protein: (e.protein / e.grams) * 100, carbs: (e.carbs / e.grams) * 100, fat: (e.fat / e.grams) * 100 };
    const r = await amountSheet({ ...(f || {}), name: e.name, per100, unit: unitOf(e) }, { grams: e.grams, title: 'Opslaan', del: true });
    if (!r) return;
    if (r.del) {
      if (!(await confirmDialog(`${e.name} verwijderen?`, null, 'Verwijderen', true))) return;
      update((st) => { st.foodLog = st.foodLog.filter((x) => x.id !== e.id); });
      return;
    }
    const snap = gameSnapshot();
    update((st) => {
      const x = st.foodLog.find((y) => y.id === e.id);
      if (x) Object.assign(x, { grams: r.grams, unit: r.unit }, nutrientsFor(per100, r.grams));
      const pf = x && st.foods.find((y) => y.id === x.foodId);
      if (pf) pf.unit = r.unit;
    });
    celebrate(snap);
  },
  'meal-save': (el) => saveMeal(el.dataset.meal),
  'meal-pick': (el) => pickMeal(el.dataset.id, el.dataset.meal),
  'food-copy': (el) => {
    const d = day();
    const from = shiftISO(d, -1);
    const snap = gameSnapshot();
    update((st) => {
      const src = st.foodLog.filter((e) => e.date === from && e.meal === el.dataset.meal);
      st.foodLog.push(...src.map((e) => ({ ...e, id: uid(), date: d })));
    });
    toast('Gekopieerd');
    celebrate(snap);
  },
});
