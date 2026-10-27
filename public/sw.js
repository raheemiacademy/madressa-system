// Makes the portals installable and shows an offline page. Pages hold children's data, so nothing else is cached.
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => { e.waitUntil(caches.open('ra-offline-v1').then((c) => c.add(OFFLINE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

// Phone notifications (web push): new messages, homework, replies to holiday requests. Tapping one opens that page in the app.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'New from school', {
    body: d.body || '', icon: '/icons/app-192.png', badge: '/icons/app-192.png', tag: d.url, data: { url: d.url || self.registration.scope }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || self.registration.scope, self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.navigate(url).then((w) => (w || c).focus());
    return self.clients.openWindow(url);
  }));
});
