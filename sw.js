const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `cm-sssur-cache-${CACHE_VERSION}`;

// Recursos estáticos mínimos requeridos para la app offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Instalando versión: ${CACHE_VERSION}`);
  // Forzar que el SW se instale inmediatamente
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando assets estáticos');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activación del Service Worker y limpieza de cachés antiguos
self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activando versión: ${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('cm-sssur-cache-')) {
            console.log(`[Service Worker] Eliminando caché antiguo: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tomar el control de todas las páginas de inmediato
      return self.clients.claim();
    })
  );
});

// Interceptar peticiones de red (Estrategia Stale-while-revalidate / Network First)
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a Supabase u otras APIs externas si es necesario
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Cachear las respuestas exitosas de recursos de nuestra app
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback offline (ej. si piden index.html y no hay red, servir desde caché)
        return cachedResponse;
      });

      // Si lo tenemos en caché, devolverlo rápido, pero actualizar en background
      return cachedResponse || fetchPromise;
    })
  );
});

// Mensajería con la app principal
self.addEventListener('message', (event) => {
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
