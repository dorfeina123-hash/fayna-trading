/* ═══════════════════════════════════════════════════════════════
   Fayna Trading — Service Worker (v25)

   Strategy:
     • App shell (index.html)  → network-first, cache fallback.
       Guarantees users always get the newest build when online,
       and still open the app when offline.
     • Static assets (icons, manifest) → cache-first.
     • Everything else (Firebase, TradingView, fonts) → straight to
       the network. Never cache API/auth traffic.
   ═══════════════════════════════════════════════════════════════ */

const VERSION    = 'fayna-v52';
const SHELL      = `${VERSION}-shell`;
const ASSETS     = `${VERSION}-assets`;
const OFFLINE_URL = './index.html';

/* Deliberately does NOT include the on-demand modules (fayna-metrics.js,
   fayna-merge.js, fayna-import.js). Precaching them would fetch them for every visitor on
   load, which is exactly what loading them on demand is meant to avoid.
   They fall under the same-origin asset rule below — cache-first with a
   background refresh — and the activate handler drops every cache whose
   name does not start with the current VERSION, so bumping VERSION on each
   deploy is what keeps them from going stale. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './fayna_logo.jpg',
  './icon-192.png',
  './icon-512.png',
];

/* Requests that must never be served from cache */
const NEVER_CACHE = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebasestorage.googleapis.com',
  'www.gstatic.com/firebasejs',
  's3.tradingview.com',
  'api.web3forms.com',
  'api.emailjs.com',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(PRECACHE).catch(() => {
      /* a single missing file must not abort the whole install */
      return Promise.all(PRECACHE.map(u => cache.add(u).catch(() => {})));
    });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (NEVER_CACHE.some(h => url.href.includes(h))) return;   // let the network handle it

  /* Navigations → network first, fall back to the cached shell */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) { _put(SHELL, req, preload.clone()); return preload; }
        const fresh = await fetch(req);
        _put(SHELL, req, fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(SHELL);
        return (await cache.match(req)) || (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  /* Same-origin static assets → cache first, refresh in the background */
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await network) || Response.error();
    })());
  }
});

function _put(cacheName, req, res) {
  if (!res || res.status !== 200) return;
  caches.open(cacheName).then(c => c.put(req, res)).catch(() => {});
}

/* Allows the page to trigger an immediate update */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATIONS (v45)

   Two paths arrive here:
     • showNotification() called by the page through this registration —
       works while the browser is open, no server needed. This is what
       Fayna uses today.
     • A real 'push' event from a push server. Nothing sends these yet,
       but the handler is in place so adding the server later is a
       server-only change.
   ═══════════════════════════════════════════════════════════════ */

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: event.data && event.data.text() }; }

  const title = d.title || 'Fayna Trading';
  const opts = {
    body:  d.body || '',
    icon:  './icon-192.png',
    badge: './icon-192.png',
    tag:   d.tag || d.type || 'fayna',
    renotify: d.priority === 'urgent',
    requireInteraction: d.priority === 'urgent',
    dir: 'rtl',
    lang: 'he',
    data: { id: d.id || null, link: d.link || null, type: d.type || null, url: d.url || './index.html' },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

/* Focus an existing tab rather than opening a duplicate, and tell the page
   which notification was clicked so it can mark it read and navigate. */
self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {};
  event.notification.close();

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const msg = { type: 'notification-click', id: data.id || null, link: data.link || null };

    for (const c of all) {
      if (c.url.includes(self.registration.scope) || c.url.includes(location.origin)) {
        c.postMessage(msg);
        if ('focus' in c) return c.focus();
      }
    }
    /* no tab open — launch one and hand the payload over once it is ready */
    const w = await self.clients.openWindow(data.url || './index.html');
    if (w) setTimeout(() => { try { w.postMessage(msg); } catch (e) {} }, 2500);
  })());
});

self.addEventListener('notificationclose', () => { /* reserved for delivery metrics */ });
