// Web Push for "rest is over" on the lock screen. The app only writes a row to public.rest_timers;
// a Supabase cron + Edge Function sends the notification (supabase/push.sql, functions/send-rest-push).
import { getClient, currentUser } from './sync.js';

const FLAG = 'trainer.push';
let vapid = null;

async function vapidKey() {
  if (vapid !== null) return vapid;
  try { vapid = (await import('./config.js')).VAPID_PUBLIC_KEY || ''; } catch { vapid = ''; }
  return vapid;
}

const flagOn = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
const setFlag = (on) => { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch { /* ignore */ } };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyBytes(b64u) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** 'on' | 'off' | 'denied' | 'install' (iOS: add to home screen first) | 'unsupported' | 'unconfigured' */
export async function pushStatus() {
  if (!(await vapidKey()) || !getClient()) return 'unconfigured';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && flagOn() ? 'on' : 'off';
}

/** Must be called from a tap (iOS requires a user gesture for the permission prompt). */
export async function enablePush() {
  const sb = getClient();
  const user = currentUser();
  if (!sb || !user) throw new Error('Log eerst in');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Meldingen zijn niet toegestaan');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await vapidKey()) }));
  const { endpoint, keys } = sub.toJSON();
  const { error } = await sb.from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
  setFlag(true);
}

export async function disablePush() {
  setFlag(false);
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await getClient()?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

function run(fn) {
  const sb = getClient();
  const user = currentUser();
  if (!flagOn() || !sb || !user) return;
  Promise.resolve(fn(sb, user.id)).then((r) => { if (r?.error) console.warn('rest push', r.error); }).catch((e) => console.warn('rest push', e));
}

export function scheduleRestPush(endsAt, title, body) {
  run((sb, uid) => sb.from('rest_timers').upsert({
    user_id: uid, fire_at: new Date(endsAt).toISOString(), title, body, updated_at: new Date().toISOString(),
  }));
}

export function moveRestPush(endsAt) {
  run((sb, uid) => sb.from('rest_timers').update({ fire_at: new Date(endsAt).toISOString() }).eq('user_id', uid));
}

export function cancelRestPush() {
  run((sb, uid) => sb.from('rest_timers').delete().eq('user_id', uid));
}
