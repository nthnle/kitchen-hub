// Lets the phone page open with no signal (e.g. in a store). Always asks the kitchen PC first and
// only falls back to the last saved copy when it can't be reached, so updates show up right away.
// Browsers only run this when the page is served over HTTPS.
const CACHE = 'kitchen-hub-phone';
const PHONE_FILES = ['/phone', '/phone.js', '/shared.js', '/style.css', '/manifest.json', '/icons/icon-192.png', '/icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PHONE_FILES)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only the phone page's own files; the kitchen screen and the API calls that change things are left alone.
  if (e.request.method !== 'GET' || url.origin !== location.origin || !PHONE_FILES.includes(url.pathname)) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
