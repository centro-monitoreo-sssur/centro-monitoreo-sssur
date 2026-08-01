const CACHE_VERSION = 'v1.0.11';
const CACHE_NAME = `cm-sssur-cache-${CACHE_VERSION}`;

// Recursos estáticos mínimos requeridos para la app offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// En desarrollo (Live Server, http-server, etc.) el SW NO cachea nada. Con la
// estrategia anterior —`cachedResponse || fetchPromise`— cada archivo editado
// se servía desde caché y solo se actualizaba en segundo plano, así que todo
// cambio de código aparecía UNA RECARGA TARDE. Eso hacía imposible depurar:
// el navegador ejecutaba la versión anterior del archivo que acabas de guardar.
const HOSTS_DESARROLLO = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];
const esDesarrollo = HOSTS_DESARROLLO.includes(self.location.hostname);

// Código de la app: debe venir SIEMPRE de la red cuando hay conexión. La caché
// es solo el plan B para operar sin señal en campo.
const ES_CODIGO = /\.(?:js|mjs|css|html)$/i;
// Recursos que sí pueden servirse de caché primero: no cambian con el deploy.
const ES_ESTATICO = /\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|json|geojson)$/i;

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Instalando versión: ${CACHE_VERSION}`);
  // Forzar que el SW se instale inmediatamente
  self.skipWaiting();

  if (esDesarrollo) {
    console.log('[Service Worker] Modo desarrollo: no se precachea nada.');
    return;
  }

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
          // En desarrollo se borra TODO, incluida la caché de la versión
          // vigente: es la única forma de garantizar que no quede código viejo
          // de una sesión anterior sirviéndose por encima de tus ediciones.
          if (esDesarrollo && cacheName.startsWith('cm-sssur-cache-')) {
            console.log(`[Service Worker] Modo desarrollo, eliminando caché: ${cacheName}`);
            return caches.delete(cacheName);
          }
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

// Guarda la respuesta sin romper el flujo si la caché falla (modo incógnito,
// cuota llena). `cache.put` rechaza con peticiones que no son GET.
function guardarEnCache(request, response) {
  if (request.method !== 'GET') return;
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  const copia = response.clone();
  caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, copia))
    .catch(() => { /* la caché es un extra, nunca un bloqueo */ });
}

// Red primero, caché como respaldo. Devuelve lo cacheado solo si la red falla.
function redPrimero(request) {
  return fetch(request)
    .then((networkResponse) => {
      guardarEnCache(request, networkResponse);
      return networkResponse;
    })
    .catch(() => caches.match(request));
}

// Caché primero + revalidación en segundo plano. Solo para recursos cuyo
// contenido no cambia entre despliegues.
function cachePrimero(request) {
  return caches.match(request).then((cachedResponse) => {
    const fetchPromise = fetch(request)
      .then((networkResponse) => {
        guardarEnCache(request, networkResponse);
        return networkResponse;
      })
      .catch(() => cachedResponse);
    return cachedResponse || fetchPromise;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Sin respondWith el navegador hace la petición normal, como si no hubiera SW.
  if (esDesarrollo) return;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca interceptar Supabase ni orígenes externos (CDN de Vue, Tailwind,
  // Leaflet, teselas de mapa). Sus respuestas son opacas o `cors` y cachearlas
  // aquí no aporta nada.
  if (url.hostname.includes('supabase.co')) return;
  if (url.origin !== self.location.origin) return;

  // Navegaciones (recarga, entrada directa a la URL) → red primero, para que un
  // index.html nuevo no quede atrapado en caché.
  if (request.mode === 'navigate') {
    event.respondWith(redPrimero(request).then((r) => r || caches.match('./index.html')));
    return;
  }

  if (ES_CODIGO.test(url.pathname)) {
    event.respondWith(redPrimero(request));
    return;
  }

  if (ES_ESTATICO.test(url.pathname)) {
    event.respondWith(cachePrimero(request));
    return;
  }

  event.respondWith(redPrimero(request));
});

// Mensajería con la app principal
self.addEventListener('message', (event) => {
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
