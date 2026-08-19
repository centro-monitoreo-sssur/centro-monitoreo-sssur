#!/usr/bin/env node
/**
 * Genera `assets/precache.json`: la lista de todo lo que el service worker
 * debe guardar para que la aplicación arranque sin conexión.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * `sw.js` precacheaba OCHO recursos —las tres rutas, el index y los
 * manifiestos— mientras la aplicación carga cerca de doscientos archivos por
 * `fetch()`: 68 módulos de JavaScript, medio centenar de plantillas, nueve
 * hojas de estilo y las dependencias. Sin señal no arrancaba, y la PWA de
 * campo existe precisamente para trabajar donde no hay señal.
 *
 * No bastaba con alargar la lista a mano: cada plantilla nueva la habría
 * dejado desactualizada en silencio, y el fallo solo se ve sin cobertura, en
 * territorio, que es donde nadie puede depurarlo.
 *
 * ── POR QUÉ UN ARCHIVO Y NO UNA LISTA DENTRO DE sw.js ───────────────────────
 * Porque el service worker se actualiza cuando cambia su propio contenido. Con
 * la lista dentro, añadir una plantilla obliga a tocar `sw.js`; con la lista
 * fuera y su huella en la versión, el flujo es el mismo pero el archivo que se
 * revisa en el diff no es un muro de rutas.
 *
 *     node herramientas/generar-precache.mjs
 */
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Qué entra. Se recorre el árbol entero de estas carpetas en vez de enumerar
   archivos: es lo que evita que la lista se quede corta al añadir una vista. */
const CARPETAS = [
  'assets/js',
  'assets/css',
  'assets/templates',
  'assets/vendor',
  'assets/img',
  'assets/config',
  'assets/data',
];

/* Documentos y manifiestos sueltos. Las tres rutas de aplicación se añaden
   aparte porque no son archivos: las inventa el .htaccess y todas devuelven el
   mismo index.html. Sin ellas, la PWA instalada no abre sin cobertura. */
const SUELTOS = [
  '/', '/panel/', '/campo/', '/ciudadano/',
  '/index.html', '/manifest.json', '/manifest-empleados.json', '/manifest-poblacion.json',
];

/* Lo que NO se guarda. Las fuentes de compilación y los formatos que ningún
   navegador de los que usamos va a pedir: Font Awesome trae .ttf junto al
   .woff2 y duplicar 700 KB en el teléfono de una cuadrilla, para nada, es
   caro. */
const EXCLUIR = [
  /\.map$/, /\.ttf$/, /\.eot$/, /\.svg$/,
  /tailwind-fuente\.css$/,
  /(^|[\\/])\./,            // ocultos
];

const excluido = (ruta) => EXCLUIR.some((re) => re.test(ruta));

async function recorrer(carpeta) {
  const encontrados = [];
  let entradas;
  try {
    entradas = await readdir(join(RAIZ, carpeta), { withFileTypes: true });
  } catch {
    return encontrados;    // la carpeta puede no existir en este proyecto
  }
  for (const e of entradas) {
    const rel = `${carpeta}/${e.name}`;
    if (excluido(rel)) continue;
    if (e.isDirectory()) encontrados.push(...await recorrer(rel));
    else encontrados.push(rel);
  }
  return encontrados;
}

const archivos = [];
for (const c of CARPETAS) archivos.push(...await recorrer(c));

const rutas = [...SUELTOS, ...archivos.map((a) => '/' + a)].sort();

/* Tamaño total, informativo pero importante: esto se descarga entero en el
   teléfono de cada persona la primera vez que abre la aplicación. Si un día se
   dispara, el aviso sale aquí y no en una queja desde territorio. */
let bytes = 0;
for (const a of archivos) {
  try { bytes += (await stat(join(RAIZ, a))).size; } catch { /* ruta virtual */ }
}

/* Huella del contenido, no de la lista: si cambia un solo archivo cambia la
   huella, y con ella la versión de la caché. Es lo que hace que un despliegue
   invalide lo viejo sin tener que acordarse de subir un número a mano. */
const huella = createHash('sha1');
for (const a of archivos.sort()) {
  huella.update(a);
  try { huella.update(await readFile(join(RAIZ, a))); } catch { /* ignora */ }
}

const salida = {
  generado: 'herramientas/generar-precache.mjs',
  huella: huella.digest('hex').slice(0, 12),
  totalArchivos: rutas.length,
  totalBytes: bytes,
  rutas,
};

await writeFile(join(RAIZ, 'assets/precache.json'), JSON.stringify(salida, null, 2) + '\n');

const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(`precache.json · ${rutas.length} rutas · ${mb} MB · huella ${salida.huella}`);
if (bytes > 12 * 1024 * 1024) {
  console.warn('AVISO: más de 12 MB. Es mucho para descargar en datos móviles; revisa qué entró.');
}
