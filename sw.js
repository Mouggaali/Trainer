// Network-first service worker: always fresh when online, cached copy when offline (gym basement).
// Google Fonts (pixel theme) use stale-while-revalidate so they also work offline.
const CACHE = 'trainer-v1';
const FONT_CACHE = 'trainer-fonts-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function fontFetch(e) {
  const req = e.request;
  return caches.open(FONT_CACHE).then((c) => c.match(req).then((hit) => {
    const fresh = fetch(req)
      .then((res) => {
        // opaque (no-cors) responses have status 0 but are still usable for fonts
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      })
      .catch(() => hit || Response.error());
    if (hit) e.waitUntil(fresh);
    return hit || fresh;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(fontFetch(e));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});

// Web Push: "rest is over" (sent by the send-rest-push Edge Function).
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Rust voorbij! 💪', {
    body: data.body || 'Tijd voor je volgende set.',
    tag: data.tag || 'rest',
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './#/active' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#/active', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => c.url.startsWith(self.registration.scope));
    if (win) return win.focus().then(() => win.navigate?.(url));
    return self.clients.openWindow(url);
  }));
});
