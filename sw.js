// ═══════════════════════════════════════════════════════════
// OFICIALES DE LA SUERTE — Service Worker v2.0
// Estrategia: Cache-first para assets estáticos,
//             Network-first para datos externos (astroluna, chancehoy)
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'oficiales-v2';
const CACHE_STATIC = 'oficiales-static-v2';
const CACHE_FONTS  = 'oficiales-fonts-v2';

// Recursos que se cachean en la instalación
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Dominios externos que NUNCA se cachean (datos en vivo)
const NO_CACHE_HOSTS = [
  'astroluna.co',
  'chancehoy.com',
  'allorigins.win',
  'codetabs.com',
  'corsproxy.io',
];

// ── INSTALL: pre-cachear assets estáticos ─────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Si algún asset falla (ej. no hay íconos aún), continuar igual
        return Promise.resolve();
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejas ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_FONTS)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia híbrida ──────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Datos externos → siempre Network, sin cache
  if (NO_CACHE_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // 2. Fuentes de Google → Cache-first con fallback
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_FONTS).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // 3. Assets locales (index.html, manifest, íconos) → Cache-first
  event.respondWith(
    caches.open(CACHE_STATIC).then(cache =>
      cache.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => {
          // Fallback offline: devolver index.html para navegación
          if (event.request.mode === 'navigate') {
            return cache.match('./index.html');
          }
          return new Response('', { status: 503 });
        });
      })
    )
  );
});

// ── MENSAJE: forzar actualización desde la app ─────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
