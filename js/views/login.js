// Login gate: shown instead of the app until the user is signed in (see gateState() in js/sync.js).
import { esc, on, toast, rerender } from '../ui.js';
import { signIn, signUp, resetPassword, isOnlineCapable } from '../sync.js';
import { monsterSprite } from '../game/monsters.js';

let email = '';
let notice = '';

function hero() {
  return `<div class="title-hero">
    <div class="title-logo">TRAINER</div>
    <div class="title-sprite">${monsterSprite('Borst', 0, 128, 'sprite')}</div>
  </div>`;
}

export function renderSplash() {
  return `<div class="title-screen">${hero()}<p class="title-blink">Laden…</p></div>`;
}

export function renderLogin() {
  const offline = !isOnlineCapable();
  return `
    <div class="title-screen">
      ${hero()}
      <section class="card login-card">
        <h2>Inloggen</h2>
        ${offline ? '<p class="notice">Geen verbinding. Je hebt internet nodig om in te loggen.</p>' : ''}
        ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
        <form class="form" onsubmit="return false">
          <label>E-mail<input type="email" id="login-email" autocomplete="username" inputmode="email" value="${esc(email)}" placeholder="jij@voorbeeld.nl"></label>
          <label>Wachtwoord<input type="password" id="login-pw" autocomplete="current-password" placeholder="minstens 6 tekens"></label>
          <button class="btn btn-primary btn-block" data-action="login-signin">Inloggen</button>
          <button class="btn btn-secondary btn-block" data-action="login-signup" type="button">Account aanmaken</button>
        </form>
        <button class="link-btn" data-action="login-forgot">Wachtwoord vergeten?</button>
      </section>
      <p class="title-foot">Je trainingen worden veilig in de cloud bewaard en gesynchroniseerd tussen je apparaten.</p>
    </div>`;
}

function read(needPw = true) {
  email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Vul een geldig e-mailadres in');
  if (needPw && pw.length < 6) throw new Error('Wachtwoord moet minstens 6 tekens zijn');
  return pw;
}

const busy = async (el, fn) => {
  if (!isOnlineCapable()) return toast('Geen verbinding met de server');
  el.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || 'Er ging iets mis'); } finally { el.disabled = false; }
};

on({
  'login-signin': (el) => busy(el, async () => {
    const pw = read();
    await signIn(email, pw);
    notice = '';
    toast('Ingelogd ☁️');
  }),
  'login-signup': (el) => busy(el, async () => {
    const pw = read();
    const needsConfirm = await signUp(email, pw);
    if (needsConfirm) {
      notice = 'Account aangemaakt. Open de bevestigingsmail en tik op de link, log daarna hier in met je wachtwoord.';
      rerender();
    } else {
      toast('Account aangemaakt en ingelogd ☁️');
    }
  }),
  'login-forgot': (el) => busy(el, async () => {
    read(false);
    await resetPassword(email);
    notice = 'Mail verstuurd. Tik op de link in de mail om een nieuw wachtwoord te kiezen.';
    rerender();
  }),
});
