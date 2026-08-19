#!/usr/bin/env node
/**
 * Descarga las dependencias de terceros a `assets/vendor/`.
 *
 * POR QUÉ
 *
 * El sistema cargaba quince recursos de cuatro CDN distintas. Eso significa:
 *
 *   · La PWA de campo NO funciona sin señal, por mucho service worker que haya:
 *     el navegador no puede precachear lo que no controla, y sin Vue no hay
 *     aplicación. Una cuadrilla en territorio sin cobertura abre una pantalla
 *     en blanco.
 *   · Una caída de unpkg o de cdnjs deja la alcaldía sin sistema, y no hay a
 *     quién llamar.
 *   · Cada visita filtra a tres terceros qué IP entra al panel municipal y
 *     cuándo. En un sistema de gobierno eso no es un detalle.
 *   · Las versiones no están fijadas del todo: `@supabase/supabase-js@2` sirve
 *     lo último de la rama 2, así que un cambio de comportamiento puede llegar
 *     solo, un martes, sin que nadie haya tocado el código.
 *
 * QUÉ NO HACE
 *
 * Tailwind no se descarga aquí. `cdn.tailwindcss.com` no es una biblioteca:
 * es un compilador que lee el DOM y genera las clases en tiempo de ejecución.
 * Su equivalente vendorizado es una hoja compilada por la CLI de Tailwind —ver
 * `package.json` y `tailwind.config.js`—, que además es lo que hace falta para
 * poder usar plugins y un tema propio.
 *
 * CÓMO SE USA
 *
 *     node herramientas/vendorizar.mjs
 *
 * Es idempotente: vuelve a descargar y sobrescribe. Se ejecuta a mano cuando se
 * suba alguna versión, no en cada despliegue — lo descargado se COMMITEA, que
 * es justo el punto: el servidor no depende de nadie.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'assets', 'vendor');

/* Un navegador de verdad en el User-Agent. Google Fonts decide qué formato
   sirve según quién pregunta: sin esto devuelve TTF en vez de WOFF2, que pesa
   el triple para el mismo resultado. */
const AGENTE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
             + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Recursos, con la VERSIÓN FIJADA en la URL.
 *
 * Nada de rangos: un `@2` trae lo último de esa rama y convierte una
 * actualización de terceros en un despliegue que nadie hizo. Aquí cada línea
 * dice exactamente qué se descargó.
 *
 * OJO AL FIJAR: la versión tiene que ser LA QUE YA ESTABA CORRIENDO, no una
 * cualquiera de la misma rama. En la primera pasada puse supabase-js en 2.45.4
 * mientras `@2` estaba sirviendo 2.112.3 — sesenta y siete versiones atrás,
 * elegida a dedo. Congelar es bueno; congelar en un punto que nadie ha probado
 * es cambiar de dependencia sin decirlo.
 */
const RECURSOS = [
  // ── Núcleo de la aplicación ──────────────────────────────────────────────
  { url: 'https://unpkg.com/vue@3.4.21/dist/vue.global.prod.js',
    destino: 'vue/vue.global.prod.js' },
  { url: 'https://unpkg.com/vue-virtual-scroller@2.0.0-beta.8/dist/vue-virtual-scroller.min.js',
    destino: 'vue-virtual-scroller/vue-virtual-scroller.min.js' },
  { url: 'https://unpkg.com/vue-virtual-scroller@2.0.0-beta.8/dist/vue-virtual-scroller.css',
    destino: 'vue-virtual-scroller/vue-virtual-scroller.css', opcional: true },
  { url: 'https://unpkg.com/@supabase/supabase-js@2.112.3/dist/umd/supabase.js',
    destino: 'supabase/supabase.js' },

  // ── Mapas ────────────────────────────────────────────────────────────────
  { url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',    destino: 'leaflet/leaflet.css' },
  { url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',     destino: 'leaflet/leaflet.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css',
    destino: 'leaflet-markercluster/MarkerCluster.css' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css',
    destino: 'leaflet-markercluster/MarkerCluster.Default.css' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
    destino: 'leaflet-markercluster/leaflet.markercluster.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js',
    destino: 'leaflet-heat/leaflet-heat.js' },
  { url: 'https://unpkg.com/leaflet-measure@3.1.0/dist/leaflet-measure.css',
    destino: 'leaflet-measure/leaflet-measure.css' },
  { url: 'https://unpkg.com/leaflet-measure@3.1.0/dist/leaflet-measure.js',
    destino: 'leaflet-measure/leaflet-measure.js' },
  { url: 'https://unpkg.com/@turf/turf@6.5.0/turf.min.js', destino: 'turf/turf.min.js' },

  // ── Gráficos e iconografía ───────────────────────────────────────────────
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
    destino: 'chartjs/chart.umd.min.js' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css',
    destino: 'fontawesome/css/all.min.css' },

  // ── Tipografías ──────────────────────────────────────────────────────────
  // El CSS de Google Fonts se descarga y se reescribe para que apunte a los
  // .woff2 locales. Además arregla el 404 que ya se veía en consola: Google
  // retira revisiones de sus archivos y el service worker servía un CSS viejo
  // que pedía uno que ya no existe.
  { url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800'
       + '&family=JetBrains+Mono:wght@500;600&display=swap',
    destino: 'fuentes/fuentes.css' },
];

let descargados = 0;
let fallidos = 0;

async function bajar(url, rutaRelativa, { opcional = false, binario = false } = {}) {
  const ruta = join(DESTINO, rutaRelativa);
  try {
    const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    await mkdir(dirname(ruta), { recursive: true });
    const cuerpo = binario
      ? Buffer.from(await respuesta.arrayBuffer())
      : await respuesta.text();
    await writeFile(ruta, cuerpo);

    const kb = (binario ? cuerpo.length : Buffer.byteLength(cuerpo)) / 1024;
    console.log(`  ok  ${rutaRelativa.padEnd(52)} ${kb.toFixed(0).padStart(5)} KB`);
    descargados++;
    return binario ? cuerpo : String(cuerpo);
  } catch (e) {
    if (opcional) {
      console.log(`  --  ${rutaRelativa.padEnd(52)} omitido (${e.message})`);
      return null;
    }
    console.error(`  ERROR ${rutaRelativa}: ${e.message}`);
    fallidos++;
    return null;
  }
}

/**
 * Descarga lo que un CSS referencia con `url(...)`.
 *
 * Sin esto, `all.min.css` de Font Awesome seguiría pidiendo sus tipografías a
 * cdnjs y no habríamos vendorizado nada: la hoja estaría local y los iconos
 * seguirían viniendo de fuera. Lo mismo con los iconos de marcador de Leaflet.
 *
 * ── LA REFERENCIA RELATIVA SE ESPEJA, NO SE REESCRIBE ──────────────────────
 * Primer intento: descargar todo a una carpeta plana y reescribir el CSS para
 * apuntar ahí. Resultado: Font Awesome pedía `../webfonts/` y los archivos
 * quedaban en `css/webfonts/`; Leaflet pedía `images/` y acabaron en
 * `../archivos/`. Dos hojas, dos rutas rotas, y ninguna falla de forma
 * ruidosa — solo iconos que no aparecen.
 *
 * Ahora una referencia relativa se guarda EN LA MISMA ruta relativa respecto
 * del CSS, y el CSS no se toca. La ruta que ya funcionaba en la CDN sigue
 * funcionando en local, que es lo más simple que puede funcionar. Solo se
 * reescribe lo que venga con URL absoluta —las tipografías de Google, que
 * apuntan a gstatic—, y esas van a `archivos/` junto a su hoja.
 */
async function resolverReferencias(css, urlBase, rutaCss) {
  if (!css) return css;
    const carpetaCss = posix.dirname(rutaCss);
  const yaVistas = new Set();
  let salida = css;

  const referencias = [...css.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)]
    .map((m) => m[1])
    .filter((u) => u && !u.startsWith('data:') && !u.startsWith('#'));

  for (const ref of new Set(referencias)) {
    const sinSufijo = ref.split('?')[0].split('#')[0];
    if (!sinSufijo) continue;
    const absoluta = new URL(ref, urlBase).href;
    const esExterna = /^(https?:)?\/\//.test(ref) || ref.startsWith('/');

    // Externa: no hay ruta relativa que espejar, así que se le hace sitio al
    // lado de la hoja y se reescribe la referencia.
    // Relativa: se replica tal cual y el CSS se queda como está.
    const destinoRef = esExterna
      ? posix.join(carpetaCss, 'archivos', posix.basename(sinSufijo))
      : posix.normalize(posix.join(carpetaCss, sinSufijo));

    if (!yaVistas.has(destinoRef)) {
      await bajar(absoluta, destinoRef, { binario: true, opcional: true });
      yaVistas.add(destinoRef);
    }
    if (esExterna) {
      salida = salida.split(ref).join('archivos/' + posix.basename(sinSufijo));
    }
  }
  return salida;
}

console.log('Vendorizando dependencias en assets/vendor/\n');

for (const r of RECURSOS) {
  const esCss = r.destino.endsWith('.css');
  const contenido = await bajar(r.url, r.destino, { opcional: r.opcional, binario: false });
  if (esCss && contenido) {
    const reescrito = await resolverReferencias(contenido, r.url, r.destino);
    if (reescrito && reescrito !== contenido) {
      await writeFile(join(DESTINO, r.destino), reescrito);
      console.log(`      ↳ ${r.destino}: rutas reescritas a local`);
    }
  }
}

/* Leaflet trae sus iconos de marcador por `L.Icon.Default`, que los construye
   con JavaScript a partir de la ruta del script. No aparecen en ningún `url()`
   del CSS, así que la pasada de arriba no los ve: sin esto, los marcadores del
   mapa salen rotos y solo en producción. */
const ICONOS_LEAFLET = ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png', 'layers.png', 'layers-2x.png'];
console.log('\n  Iconos de Leaflet (los pide el JS, no el CSS):');
for (const icono of ICONOS_LEAFLET) {
  await bajar(`https://unpkg.com/leaflet@1.9.4/dist/images/${icono}`,
    `leaflet/images/${icono}`, { binario: true, opcional: true });
}

console.log(`\n${descargados} archivos descargados, ${fallidos} con error.`);
if (fallidos) {
  console.error('Hay recursos que no se pudieron traer: NO se debe desplegar así.');
  process.exit(1);
}
console.log('Recuerda commitear assets/vendor/: es el punto de todo esto.');
