// Offline copy of the web version. Network first, so a new build shows up on the next visit.
const CACHE = 'estimator-3-ae4042f7';
const FILES = ["./","config.js","fonts/Archivo-latin-1.woff2","fonts/Archivo-latin-ext-0.woff2","fonts/fonts.css","fonts/IBMPlexMono-latin-3.woff2","fonts/IBMPlexMono-latin-5.woff2","fonts/IBMPlexMono-latin-7.woff2","fonts/IBMPlexMono-latin-ext-2.woff2","fonts/IBMPlexMono-latin-ext-4.woff2","fonts/IBMPlexMono-latin-ext-6.woff2","fonts/IBMPlexSansArabic-arabic-11.woff2","fonts/IBMPlexSansArabic-arabic-14.woff2","fonts/IBMPlexSansArabic-arabic-17.woff2","fonts/IBMPlexSansArabic-arabic-8.woff2","fonts/IBMPlexSansArabic-latin-10.woff2","fonts/IBMPlexSansArabic-latin-13.woff2","fonts/IBMPlexSansArabic-latin-16.woff2","fonts/IBMPlexSansArabic-latin-19.woff2","fonts/IBMPlexSansArabic-latin-ext-12.woff2","fonts/IBMPlexSansArabic-latin-ext-15.woff2","fonts/IBMPlexSansArabic-latin-ext-18.woff2","fonts/IBMPlexSansArabic-latin-ext-9.woff2","fonts/InstrumentSans-latin-21.woff2","fonts/InstrumentSans-latin-23.woff2","fonts/InstrumentSans-latin-25.woff2","fonts/InstrumentSans-latin-ext-20.woff2","fonts/InstrumentSans-latin-ext-22.woff2","fonts/InstrumentSans-latin-ext-24.woff2","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","manifest.webmanifest"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Supabase and the price file go to the network
  e.respondWith(fetch(e.request)
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
