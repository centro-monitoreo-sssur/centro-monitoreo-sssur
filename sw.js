const CACHE_VERSION = 'v1.1.7';
const CACHE_NAME = `cm-sssur-cache-${CACHE_VERSION}`;

// ── Caché de teselas del mapa ───────────────────────────────────────────────
//
// Guarda ÚNICAMENTE las teselas que el usuario ya vio al navegar. No hay
// descarga masiva de zonas, y es deliberado: los términos de uso de Google y la
// política de OpenStreetMap prohíben precargar o almacenar cartografía en bloque.
// Esto es la caché normal del navegador hecha persistente, nada más.
//
// Para qué sirve: la cuadrilla trabaja una y otra vez sobre las mismas zonas.
// La primera visita necesita señal; a partir de ahí, esa área se ve sin datos.
// (Ojo: esto NO mejora la precisión del GPS, que es satelital y funciona sin
// internet. Lo que arregla es no ver cuadros grises bajo tu propia posición.)
//
// Va en una caché con nombre propio, fuera del prefijo `cm-sssur-cache-`, para
// que un despliegue nuevo NO borre el mapa acumulado: perderlo obligaría a
// recorrer otra vez todo el territorio con señal.
const CACHE_TESELAS = 'cm-sssur-teselas-v1';

// Tope por número de teselas, no por bytes: la Cache API no reporta el tamaño
// de cada entrada. ~1200 teselas cubren de sobra las zonas de trabajo
// habituales de una cuadrilla sin comerse el disco del teléfono.
const MAX_TESELAS = 1200;
// Se poda de golpe para no ejecutar el barrido en cada tesela nueva.
const PODA_TESELAS = 200;

const HOSTS_TESELAS = [
  'mt0.google.com', 'mt1.google.com', 'mt2.google.com', 'mt3.google.com',
  'basemaps.cartocdn.com',
  'tile.openstreetmap.org',
  'server.arcgisonline.com',
];

const esTesela = (url) =>
  HOSTS_TESELAS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));

// Recursos estáticos mínimos requeridos para la app offline.
// Hay un manifiesto por contexto: sin ellos, un empleado que instale la PWA de
// campo la abriría en el Centro de Monitoreo (ver el script en línea de
// index.html).
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './manifest-empleados.json',
  './manifest-poblacion.json'
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

/**
 * Elimina las teselas más antiguas cuando se supera el tope.
 *
 * `cache.keys()` devuelve las claves en orden de inserción, así que esto es
 * FIFO y no LRU estricto: una tesela muy usada puede caer si se insertó pronto.
 * Un LRU real exigiría reescribir la entrada en cada acierto —un `put` por cada
 * tesela mostrada— y eso castiga el rendimiento del mapa más de lo que aporta.
 */
async function podarTeselas() {
  try {
    const cache = await caches.open(CACHE_TESELAS);
    const claves = await cache.keys();
    if (claves.length <= MAX_TESELAS) return;
    const sobran = claves.length - MAX_TESELAS + PODA_TESELAS;
    await Promise.all(claves.slice(0, sobran).map((k) => cache.delete(k)));
    console.log(`[Service Worker] Podadas ${sobran} teselas antiguas.`);
  } catch (e) { /* la caché es un extra, nunca un bloqueo */ }
}

/**
 * Teselas: caché primero. Una tesela de un z/x/y dado es el mismo dibujo
 * durante meses, así que revalidarla en cada movimiento del mapa solo gastaría
 * datos móviles sin cambiar lo que se ve.
 *
 * Se aceptan respuestas opacas (`type: 'opaque'`): los servidores de teselas no
 * envían CORS, así que el SW no puede leer su estado. Se guardan a ciegas —es
 * lo que permite servirlas luego sin señal— asumiendo que el navegador infla su
 * consumo de cuota al contabilizarlas. Por eso el tope es conservador.
 */
function teselaPrimero(request) {
  return caches.open(CACHE_TESELAS).then((cache) =>
    cache.match(request).then((cacheada) => {
      if (cacheada) return cacheada;
      return fetch(request).then((respuesta) => {
        // `status 0` es lo normal en una respuesta opaca; un error de red
        // rechaza la promesa y cae al `catch`.
        if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
          cache.put(request, respuesta.clone())
            .then(podarTeselas)
            .catch(() => { /* cuota llena o modo incógnito */ });
        }
        return respuesta;
      }).catch(() => cacheada);
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Sin respondWith el navegador hace la petición normal, como si no hubiera SW.
  if (esDesarrollo) return;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Teselas del mapa: se atienden ANTES del corte por origen externo, que es
  // justo lo que impedía cachearlas.
  if (esTesela(url)) {
    event.respondWith(teselaPrimero(request));
    return;
  }

  // Nunca interceptar Supabase ni el resto de orígenes externos (CDN de Vue,
  // Tailwind, Leaflet). Sus respuestas son opacas o `cors` y cachearlas aquí no
  // aporta nada.
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
  const responder = (datos) => event.ports?.[0]?.postMessage(datos);

  if (event.data === 'GET_VERSION') {
    responder({ version: CACHE_VERSION });
    return;
  }

  // Estado del mapa guardado, para poder mostrarlo en Configuración. Sin un
  // dato visible, el almacenamiento acumulado del teléfono es una caja negra
  // que nadie sabe de dónde sale ni cómo vaciar.
  if (event.data === 'ESTADO_TESELAS') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE_TESELAS);
        const claves = await cache.keys();
        // `navigator.storage.estimate()` da el consumo de TODO el origen, no
        // solo de esta caché; se envía como referencia, no como dato exacto.
        const estimacion = navigator.storage?.estimate
          ? await navigator.storage.estimate()
          : null;
        responder({
          teselas: claves.length,
          maximo: MAX_TESELAS,
          usoTotalBytes: estimacion?.usage ?? null,
          cuotaBytes: estimacion?.quota ?? null,
        });
      } catch (e) {
        responder({ teselas: 0, maximo: MAX_TESELAS, error: e.message });
      }
    })());
    return;
  }

  if (event.data === 'LIMPIAR_TESELAS') {
    event.waitUntil(
      caches.delete(CACHE_TESELAS)
        .then((ok) => responder({ ok }))
        .catch((e) => responder({ ok: false, error: e.message }))
    );
  }
});
