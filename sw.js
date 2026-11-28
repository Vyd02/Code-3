// Code 3 service worker: loads fresh when online, falls back to the saved copy when offline.
const CACHE = 'code3-v59';
const SHELL = ['./', 'index.html', 'fb.js', 'manifest.webmanifest', 'icon-192-v2.png', 'icon-512-v2.png', 'qr.svg', 'logo.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const fresh = e.request.mode === 'navigate' ? fetch(u.href, { cache: 'no-store', credentials: 'same-origin' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(fresh.then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

// Push alerts from the Code 3 alert server. These arrive even when the app is closed.
self.addEventListener('push', e => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch (x) {}
  const title = d.title || 'Code 3';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: 'icon-192-v2.png', badge: 'icon-192-v2.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
