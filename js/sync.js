// Cloud sync with Supabase. Local storage stays the source of truth (works offline in the gym);
// the whole state is mirrored to public.app_state (one row per user, see supabase/schema.sql).
// Conflicts: last write wins, based on state.modifiedAt.
import { getState, replaceState, onSave } from './store.js';
import { choose, todayISO } from './ui.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const META_KEY = 'trainer.sync';

let sb = null;
let user = null;
let status = 'loading'; // loading | unconfigured | offline | loggedout | syncing | idle | error
let lastError = '';
let pushTimer = null;
let pulling = false;
const listeners = new Set();

const meta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; } };
const setMeta = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify({ ...meta(), ...m })); } catch { /* ignore */ } };

/** kind: 'auth' (login state changed → full re-render) or 'status' */
export function onSyncChange(fn) { listeners.add(fn); }
function emit(kind = 'status') { listeners.forEach((f) => f(kind)); }
function setStatus(s, err = '') { status = s; lastError = err; emit('status'); }

export function syncInfo() {
  const m = meta();
  return { status, email: user?.email || null, lastError, lastSyncedAt: m.lastSyncedAt || 0, dirty: !!m.dirty, configured: !!sb };
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
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'trainer.auth' },
  });

  sb.auth.onAuthStateChange((_event, session) => {
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
  // Remove ?code=... left by the magic-link redirect.
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

async function push() {
  if (!sb || !user) return;
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
  } catch (e) {
    fail(e);
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

// ---------- Auth ----------
export async function sendLoginCode(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyLoginCode(email, token) {
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function syncNow() {
  if (meta().dirty) await push();
  await pull();
}

export async function logout() {
  if (meta().dirty) await push();
  await sb.auth.signOut();
  setMeta({ linkedUser: null, lastSyncedAt: 0 });
}
