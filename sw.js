// Fayna Trading — Service Worker v4
const CACHE = 'fayna-v4';
const BASE  = '/fayna-trading/';
const STATIC = [
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'fayna_logo.jpg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
];

// Install — cache static files
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(STATIC.map(url =>
        fetch(url + '?v=' + Date.now(), { cache: 'no-store' })
          .then(res => { if (res.ok) c.put(url, res); })
          .catch(() => {})
      ))
    )
  );
  // Take control immediately — don't wait for old SW to die
  self.skipWaiting();
});

// Activate — delete old caches, take control of all tabs
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network-first always (keeps content fresh)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Skip non-cacheable origins
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic') ||
      url.hostname.includes('firestore') ||
      url.hostname.includes('web3forms') ||
      url.hostname.includes('investing') ||
      url.hostname.includes('faireconomy')) return;

  // Network-first: always try to fetch fresh, fall back to cache
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Listen for skip-waiting message from the page
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
