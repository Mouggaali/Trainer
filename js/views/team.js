import { getState, update, allExercises } from '../store.js';
import { esc, on, icon, sheetPromise, toast } from '../ui.js';
import { computeTeam, WEEK_SET_CAP, EVOLVE_AT, XP } from '../game/xp.js';
import { MONSTERS, monsterSprite, monsterName } from '../game/monsters.js';
import { trainedExercises } from '../stats.js';
import { computeBadges, badgeSvg } from '../game/badges.js';

const nick = () => getState().profile.monsterNames || {};
export const pct = (into, needed) => (needed ? Math.max(0, Math.min(100, (into / needed) * 100)) : 100);

export function expBar(into, needed, cls = '') {
  return `<div class="exp-bar ${cls}"><i style="width:${pct(into, needed)}%"></i></div>`;
}

/** Trainer card at the top of the Team tab. */
export function renderTrainerCard() {
  const s = getState();
  const { trainerLevel, totalXp } = computeTeam(s);
  const name = s.profile.name || 'Trainer';
  return `
    <section class="trainer-card">
      <div class="tc-row"><span class="tc-label">TRAINER</span><span class="tc-name">${esc(name)}</span></div>
      <div class="tc-row"><span class="tc-label">LEVEL</span><span>${trainerLevel}</span></div>
      <div class="tc-row"><span class="tc-label">EXP.</span><span>${totalXp}</span></div>
      <div class="tc-row"><span class="tc-label">TRAININGEN</span><span>${s.workouts.length}</span></div>
    </section>`;
}

/** FireRed party screen: the 6 monsters. */
export function renderTeamParty() {
  const { team } = computeTeam(getState());
  const slots = team.map((t) => {
    const m = MONSTERS[t.muscle];
    return `<button class="party-slot" data-action="go" data-href="#/monster/${encodeURIComponent(t.muscle)}">
      <span class="party-sprite">${monsterSprite(t.muscle, t.form, 48, 'sprite')}</span>
      <div class="party-main">
        <div class="party-name">${esc(monsterName(t.muscle, t.form, nick()))}</div>
        ${expBar(t.into, t.needed)}
        <div class="party-sub"><span class="type-badge" style="--type:${m?.color || '#888'}">${esc(t.muscle)}</span> ${t.into}/${t.needed || '–'} EXP.</div>
      </div>
      <span class="party-lv">Lv${t.level}</span>
    </button>`;
  }).join('');
  return `
    <h2 class="section-title">Team</h2>
    <div class="party">${slots}</div>`;
}

export function badgeCase() {
  const badges = computeBadges();
  const got = badges.filter((b) => b.earned).length;
  return `<section class="badge-case">
    <div class="badge-case-head"><span>BADGES</span><span>${got}/${badges.length}</span></div>
    <div class="badge-grid">${badges.map((b) => `
      <button class="badge-slot ${b.earned ? 'on' : ''}" data-action="badge-info" data-id="${b.id}" aria-label="${esc(b.name)}-badge${b.earned ? ' (behaald)' : ''}">
        ${badgeSvg(b.id, b.earned, 40)}
      </button>`).join('')}</div>
  </section>`;
}

export function renderMonsterDetail(muscle) {
  muscle = decodeURIComponent(muscle || '');
  const t = computeTeam().team.find((x) => x.muscle === muscle);
  const m = MONSTERS[muscle];
  if (!t || !m) return `<header class="page-head"><button class="icon-btn" data-action="back">${icon('chevronLeft')}</button></header><p class="empty">Onbekend monster.</p>`;
  const names = nick();
  const counts = new Map(trainedExercises().map((x) => [x.id, x.count]));
  const exs = allExercises()
    .filter((e) => e.muscle === muscle || e.secondary === muscle)
    .sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))
    .slice(0, 8);
  const meter = Math.min(100, (t.setsThisWeek / WEEK_SET_CAP) * 100);
  const meterCls = t.setsThisWeek >= 10 ? '' : 'is-mid';
  const nextEvo = EVOLVE_AT.find((l) => l > t.level);

  return `
    <header class="page-head">
      <button class="icon-btn" data-action="back" aria-label="Terug">${icon('chevronLeft')}</button>
      <h1 class="h-sm">${esc(monsterName(muscle, t.form, names))}</h1>
      <button class="icon-btn accent" data-action="mon-rename" data-m="${esc(muscle)}" aria-label="Bijnaam">${icon('edit')}</button>
    </header>
    <section class="card mon-hero">
      <div class="mon-sprite">${monsterSprite(muscle, t.form, 160, 'sprite')}</div>
      <div class="mon-stats">
        <div class="row-between"><span class="type-badge" style="--type:${m.color}">${esc(m.typeLabel || m.type)}</span><b>Lv${t.level}</b></div>
        <div class="muted small">Spiergroep: ${esc(muscle)}</div>
        ${expBar(t.into, t.needed)}
        <div class="muted small">${t.needed ? `${t.needed - t.into} EXP. tot Lv${t.level + 1}` : 'Max level!'}</div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Sets deze week</h2><div class="muted small">10–20 harde sets per week is ideaal voor spiergroei</div></div><b>${t.setsThisWeek}/${WEEK_SET_CAP}</b></div>
      <div class="hp-bar sets-bar ${meterCls}"><i style="width:${meter}%"></i></div>
      <p class="muted small">${t.setsThisWeek >= WEEK_SET_CAP ? 'Maximum bereikt: extra sets geven deze week geen set-EXP. meer. Rust is ook groei!' : t.setsThisWeek >= 10 ? 'Goed bezig, je zit in de groeizone.' : `Nog ${10 - t.setsThisWeek} sets tot de groeizone.`}</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Evolutie</h2></div>
      <div class="evo-line">${m.forms.map((f, i) => `
        <div class="evo ${i <= t.form ? 'got' : 'locked'}">
          ${monsterSprite(muscle, i, 64, 'sprite')}
          <span>${i <= t.form ? esc(monsterName(muscle, i, i === t.form ? names : {})) : '???'}</span>
          <small>${i === 0 ? 'Lv1' : `Lv${EVOLVE_AT[i - 1]}`}</small>
        </div>`).join('<span class="evo-arrow">▶</span>')}</div>
      ${nextEvo ? `<p class="muted small">Evolueert op Lv${nextEvo}.</p>` : '<p class="muted small">Volledig geëvolueerd!</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h2>Zo verdien je EXP.</h2></div>
      <div class="xp-rules">
        <div><span>Werkset afvinken</span><b>+${XP.set}</b></div>
        <div><span>Oefening gehaald (alle reps)</span><b>+${XP.exercise}</b></div>
        <div><span>Training afgerond</span><b>+${XP.workout}*</b></div>
        <div><span>Persoonlijk record</span><b>+${XP.pr}</b></div>
        <div><span>Weekdoel gehaald (heel team)</span><b>+${XP.weekGoal}</b></div>
        <div><span>Hulpspier bij basisoefening</span><b>+${XP.secondary}</b></div>
      </div>
      <p class="muted small">* verdeeld over de getrainde spiergroepen.</p>
    </section>

    <h2 class="section-title">Oefeningen</h2>
    <div class="list">${exs.map((e) => `
      <button class="list-item" data-action="go" data-href="#/exercise/${esc(e.id)}">
        <div class="li-main"><div class="li-title">${esc(e.name)}</div>
        <div class="li-sub">${e.muscle === muscle ? 'Hoofdspier' : 'Hulpspier'}</div></div>
        ${counts.get(e.id) ? `<span class="badge">${counts.get(e.id)}×</span>` : ''}
      </button>`).join('')}</div>`;
}

on({
  'badge-info': (el) => {
    const b = computeBadges().find((x) => x.id === el.dataset.id);
    if (!b) return;
    const p = b.noData ? 0 : Math.min(100, (b.cur / b.goal) * 100);
    sheetPromise(`
      <div class="badge-sheet">
        ${badgeSvg(b.id, b.earned, 96)}
        <h3 class="sheet-title">${esc(b.name.toUpperCase())}-BADGE</h3>
        <p class="sheet-text">${esc(b.desc)}</p>
        <div class="exp-bar"><i style="width:${p}%"></i></div>
        <p class="muted small">${b.earned ? 'Behaald! ' : ''}${esc(b.text)}</p>
        <div class="sheet-actions"><button class="btn btn-secondary btn-block" data-action="sheet-dismiss">Sluiten</button></div>
      </div>`);
  },
  'mon-rename': async (el) => {
    const muscle = el.dataset.m;
    const t = computeTeam().team.find((x) => x.muscle === muscle);
    const current = nick()[muscle] || '';
    const { el: sheet, result } = sheetPromise(`
      <h3 class="sheet-title">Bijnaam</h3>
      <form class="form" onsubmit="return false">
        <label>Bijnaam voor ${esc(monsterName(muscle, t.form))}<input id="mon-nick" maxlength="12" value="${esc(current)}" placeholder="leeg = standaardnaam"></label>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-block" data-action="sheet-resolve" data-value="save">Opslaan</button>
          <button class="btn btn-secondary btn-block" data-action="sheet-dismiss" type="button">Annuleren</button>
        </div>
      </form>`);
    const input = sheet.querySelector('#mon-nick');
    let value = current;
    input.addEventListener('input', () => { value = input.value; });
    if ((await result) !== 'save') return;
    update((s) => {
      s.profile.monsterNames = s.profile.monsterNames || {};
      const v = value.trim().toUpperCase();
      if (v) s.profile.monsterNames[muscle] = v;
      else delete s.profile.monsterNames[muscle];
    });
    toast('Bijnaam opgeslagen');
  },
});

