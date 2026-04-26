/* ═══════════════════════════════════════════════
   BODEGA MANAGER — Service Worker
   Estrategia: Cache-first para assets,
   Network-first para index.html (siempre fresco)
   Offline completo gracias a localStorage
═══════════════════════════════════════════════ */

const CACHE_NAME = 'bodega-v3';
const CACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@300;400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

/* ── INSTALL: cachear todo al instalar ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        CACHE_URLS.map(url => cache.add(url).catch(() => null))
      );
    })
  );
});

/* ── ACTIVATE: limpiar cachés viejas ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── MESSAGE: forzar actualización ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── FETCH: estrategia por tipo de recurso ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase y APIs externas: siempre network, sin cache
  if (url.hostname.includes('supabase.co') || url.hostname.includes('wa.me')) {
    return; // dejar pasar directo
  }

  // index.html: Network-first (si hay red, baja lo más nuevo; si no, usa caché)
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Fuentes y JS externo: Cache-first (rápido, sin gastar datos)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Resto (íconos, manifest): Cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return response;
      });
    })
  );
});
