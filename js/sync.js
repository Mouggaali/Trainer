// Cloud sync with Supabase. Local storage stays the source of truth (works offline in the gym);
// the whole state is mirrored to public.app_state (one row per user, see supabase/schema.sql).
// Conflicts: last write wins, based on state.modifiedAt.
import { getState, replaceState, onSave, clearLocalData } from './store.js';
import { choose, todayISO } from './ui.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const META_KEY = 'trainer.sync';
const AUTH_KEY = 'trainer.auth'; // supabase-js session storage key

let sb = null;
let user = null;
let status = 'loading'; // loading | unconfigured | offline | loggedout | syncing | idle | error
let lastError = '';
let pushTimer = null;
let pulling = false;
let recovery = false; // user opened a "reset password" link and must choose a new password
const listeners = new Set();

const meta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; } };
const setMeta = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify({ ...meta(), ...m })); } catch { /* ignore */ } };

/** kind: 'auth' (login state changed → full re-render) or 'status' */
export function onSyncChange(fn) { listeners.add(fn); }
function emit(kind = 'status') { listeners.forEach((f) => f(kind)); }
function setStatus(s, err = '') { status = s; lastError = err; emit('status'); }

export function syncInfo() {
  const m = meta();
  return { status, email: user?.email || null, lastError, lastSyncedAt: m.lastSyncedAt || 0, dirty: !!m.dirty, configured: !!sb, recovery };
}

function hasStoredSession() {
  try { return !!localStorage.getItem(AUTH_KEY); } catch { return false; }
}

/**
 * Login gate: 'open' (app usable), 'splash' (still loading, no saved session) or 'login'.
 * A saved session keeps the app open offline and while supabase-js loads.
 */
export function gateState() {
  if (status === 'unconfigured' || user) return 'open';
  if (hasStoredSession() && status !== 'loggedout') return 'open';
  if (status === 'loading') return 'splash';
  return 'login';
}

export function statusText() {
  const i = syncInfo();
  switch (i.status) {
    case 'unconfigured': return 'Cloud-sync niet ingesteld';
    case 'offline': return 'Offline — wijzigingen worden later gesynchroniseerd';
    case 'loggedout': return 'Niet ingelogd — data alleen op dit apparaat';
    case 'syncing': return 'Synchroniseren…';
    case 'error': return `Sync-fout: ${i.lastError}`;
    case 'idle': return i.dirty ? 'Wijzigingen nog niet geüpload' : `Gesynchroniseerd${i.lastSyncedAt ? ` · ${new Date(i.lastSyncedAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`;
    default: return 'Laden…';
  }
}

export async function initSync() {
  let cfg;
  try { cfg = await import('./config.js'); } catch { setStatus('unconfigured'); return; }
  let createClient;
  try { ({ createClient } = await import(SUPABASE_JS)); } catch { setStatus('offline'); return; }

  sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY },
  });

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { recovery = true; emit('recovery'); }
    const prev = user?.id;
    user = session?.user || null;
    if (!user) { setStatus('loggedout'); if (prev) emit('auth'); return; }
    if (user.id !== prev) {
      emit('auth');
      setTimeout(() => pull(), 0); // outside the auth callback (supabase-js recommendation)
    }
  });

  const { data } = await sb.auth.getSession();
  if (!data.session) setStatus('loggedout');
  // Remove ?code=... left by a confirmation / reset-password link.
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);

  onSave(() => {
    setMeta({ dirty: true });
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  });
  document.addEventListener('visibilitychange', () => {
    if (!user) return;
    if (document.hidden) { if (meta().dirty) push(); } else pull();
  });
  window.addEventListener('online', () => { if (user) pull(); });
}

function hasOwnData(s) {
  return s.workouts.length || s.bodyweight.length || s.measurements.length;
}

async function pull() {
  if (!sb || !user || pulling) return;
  pulling = true;
  setStatus('syncing');
  try {
    const { data, error } = await sb.from('app_state').select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    const m = meta();
    const local = getState();

    if (!data) { await push(); return; } // nothing in the cloud yet → upload this device

    const remoteTs = Date.parse(data.updated_at);
    if (m.linkedUser !== user.id) {
      // First time this device is linked to this account.
      let use = 'remote';
      if (hasOwnData(local) && hasOwnData(data.data)) {
        use = await choose('Welke data wil je houden?', 'Er staat al data in de cloud én op dit apparaat.', [
          { label: `Cloud (${data.data.workouts.length} trainingen)`, value: 'remote', style: 'btn-primary' },
          { label: `Dit apparaat (${local.workouts.length} trainingen)`, value: 'local' },
        ]) || 'remote';
      } else if (hasOwnData(local)) {
        use = 'local';
      }
      if (use === 'local') {
        await backup(data.data);
        setMeta({ linkedUser: user.id });
        await push();
      } else {
        applyRemote(data.data, remoteTs);
      }
      return;
    }

    if (remoteTs > (m.lastSyncedAt || 0)) {
      if (m.dirty && (local.modifiedAt || 0) > remoteTs) await push();
      else applyRemote(data.data, remoteTs);
    } else if (m.dirty) {
      await push();
    } else {
      setStatus('idle');
    }
  } catch (e) {
    fail(e);
  } finally {
    pulling = false;
  }
}

function applyRemote(data, ts) {
  replaceState(data);
  setMeta({ linkedUser: user.id, lastSyncedAt: ts, dirty: false });
  setStatus('idle');
}

/** Uploads the local state. Returns true on success. */
async function push() {
  if (!sb || !user) return false;
  clearTimeout(pushTimer);
  setStatus('syncing');
  try {
    const s = getState();
    const ts = new Date(s.modifiedAt || Date.now()).toISOString();
    const { error } = await sb.from('app_state').upsert({ user_id: user.id, data: s, version: s.version, updated_at: ts });
    if (error) throw error;
    setMeta({ linkedUser: user.id, lastSyncedAt: Date.parse(ts), dirty: false });
    if (meta().lastBackupDay !== todayISO()) {
      await backup(s);
      setMeta({ lastBackupDay: todayISO() });
    }
    setStatus('idle');
    return true;
  } catch (e) {
    fail(e);
    return false;
  }
}

async function backup(data) {
  const { error } = await sb.from('app_state_backups').insert({ user_id: user.id, data });
  if (error) console.warn('Back-up mislukt', error);
}

function fail(e) {
  console.error('Sync', e);
  setStatus(navigator.onLine === false ? 'offline' : 'error', e?.message || String(e));
}

// ---------- Auth (e-mail + wachtwoord) ----------
const AUTH_ERRORS = [
  [/invalid login credentials/i, 'E-mail of wachtwoord klopt niet'],
  [/email not confirmed/i, 'Bevestig eerst je e-mailadres via de link in de mail'],
  [/already registered/i, 'Dit e-mailadres heeft al een account. Log in.'],
  [/password should be at least/i, 'Wachtwoord moet minstens 6 tekens zijn'],
  [/rate limit|too many/i, 'Te veel pogingen. Wacht even en probeer opnieuw.'],
];
function authError(error) {
  const hit = AUTH_ERRORS.find(([re]) => re.test(error.message));
  return new Error(hit ? hit[1] : error.message);
}
const redirectTo = () => location.origin + location.pathname;

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
}

/** Returns true when the account still needs e-mail confirmation. */
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
  if (error) throw authError(error);
  return !data.session;
}

export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw authError(error);
}

export async function setNewPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw authError(error);
  recovery = false;
  emit('auth');
}

export async function syncNow() {
  if (meta().dirty) await push();
  await pull();
}

/** Uploads everything, signs out and wipes this device. Throws (and keeps the data) if the upload fails. */
export async function logout() {
  const ok = await push();
  if (!ok) throw new Error('Geen verbinding: je laatste wijzigingen staan nog niet in de cloud. Probeer het straks opnieuw.');
  await sb.auth.signOut();
  try { localStorage.removeItem(META_KEY); } catch { /* ignore */ }
  clearLocalData();
}

export const isOnlineCapable = () => !!sb;
