// Code 3 service worker.
// Page (index.html): always asks for the newest copy, but if the network is slow (over 2.5 s)
// it opens the saved copy so the app never hangs. Other files (fonts, Firebase, icons): open
// instantly from the saved copy and refresh it in the background. Every release bumps CACHE,
// which re-downloads everything fresh.
const CACHE = 'code3-v62';
const SHELL = ['./', 'index.html', 'fb.js', 'manifest.webmanifest', 'icon-192-v2.png', 'icon-512-v2.png', 'qr.svg', 'logo.svg',
  'fonts/barlow-condensed-latin-600-normal.woff2', 'fonts/barlow-condensed-latin-700-normal.woff2', 'fonts/barlow-condensed-latin-800-normal.woff2',
  'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-500-normal.woff2', 'fonts/barlow-latin-600-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const save = (req, r) => { if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; };
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    const net = fetch(u.href, { cache: 'no-store', credentials: 'same-origin' }).then(r => save('index.html', r));
    const slow = new Promise(res => setTimeout(res, 2500)).then(() => caches.match('index.html'));
    e.respondWith(Promise.race([net, slow.then(r => r || net)]).then(r => r || net).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request, { cache: 'no-cache' }).then(r => save(e.request, r));
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => caches.match('index.html'));
  }));
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
