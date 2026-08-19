#!/usr/bin/env node
/**
 * Linter de conformidad con el sistema de diseño. Node puro, cero dependencias.
 * Regex sobre archivos: son plantillas de Vue, no documentos HTML completos.
 *
 * ── LA REGLA ESTRELLA: CLASE USADA Y NO EMITIDA ─────────────────────────────
 * Hubo 68 usos de `focus:ring-3` con CERO reglas emitidas durante meses: es
 * una utilidad de Tailwind v4 y este proyecto compila con v3. El color del
 * anillo sí compilaba, el grosor no — 68 controles sin anillo de foco y ni un
 * error en ninguna parte. Ninguna revisión de código puede ver eso; solo se
 * cae comparando las clases USADAS contra las EMITIDAS en la hoja compilada.
 * Esa comparación es esta herramienta, y es una de las dos reglas que
 * BLOQUEAN siempre: no son opiniones de estilo, son «este estilo no existe».
 *
 * ── TRES MECANISMOS CONTRA EL RUIDO, EN ESTE ORDEN ──────────────────────────
 * 1 · Exención por ruta CON MOTIVO ESCRITO (EXENTAS, abajo).
 * 2 · Silencio en línea: un comentario `conformidad-ignorar: <regla> motivo: …`
 *     en la línea de la infracción o la anterior. Sin `motivo:` el silencio se
 *     RECHAZA — es lo que impide la podredumbre tipo eslint-disable.
 * 3 · Presupuesto congelado en `conformidad-base.json`: las reglas de deuda
 *     no bloquean por existir, bloquean por CRECER. La deuda queda contada,
 *     visible con --resumen, y solo puede encoger.
 *
 *     node herramientas/conformidad.mjs             (bloqueantes + subidas → exit 1)
 *     node herramientas/conformidad.mjs --resumen   (la tabla, sin fallar)
 *     node herramientas/conformidad.mjs --congelar  (reescribe la base con lo actual)
 *     node herramientas/conformidad.mjs --en-build  (solo bloqueantes fallan)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_JSON = join(RAIZ, 'conformidad-base.json');

const args = new Set(process.argv.slice(2));
const MODO_RESUMEN = args.has('--resumen');
const MODO_CONGELAR = args.has('--congelar');
const EN_BUILD = args.has('--en-build');

/* ── Alcance ─────────────────────────────────────────────────────────────────
   El panel del Centro de Monitoreo: admin/ y shared/. Las PWAs de empleados y
   población tienen su propia anatomía táctil y entran al alcance cuando les
   toque su ola; meterlas hoy duplicaría el presupuesto con deuda que nadie va
   a pagar esta migración. */
const CARPETAS = ['assets/templates/admin', 'assets/templates/shared'];

/* Exención por ruta. El motivo es obligatorio y se imprime: una exención que
   no sabe decir por qué existe es deuda disfrazada. */
const EXENTAS = [
  ['assets/templates/shared/ui/',                      'las primitivas SON la implementación del sistema'],
  ['assets/templates/admin/vista-mapa.html',           'lienzo Leaflet: controles dentro de contextos de apilamiento propios (plan, fuera de alcance permanente)'],
  ['assets/templates/admin/vista-cartograma.html',     'lienzo Leaflet, ídem'],
  ['assets/templates/admin/mapa-editor-noticia.html',  'lienzo Leaflet, ídem'],
  ['assets/templates/shared/bottom-tab-bar.html',      'barra de pestañas PWA: anatomía táctil propia'],
  ['assets/templates/shared/app-sidebar.html',         'shell: anatomía propia migrada a mano con TailAdmin'],
  ['assets/templates/shared/app-topbar.html',          'shell, ídem'],
];

/* Diccionario v4→v3: cuando la clase no emitida es una utilidad conocida de
   Tailwind v4, el mensaje trae la traducción en vez de dejar al autor
   buscándola. Es la tabla del plan, viva donde se usa. */
const TRADUCCION_V4 = {
  'shadow-xs': 'shadow-sm', 'rounded-xs': 'rounded-sm', 'outline-hidden': 'outline-none',
  'bg-linear-to-r': 'bg-gradient-to-r', 'bg-linear-to-l': 'bg-gradient-to-l',
  'bg-linear-to-t': 'bg-gradient-to-t', 'bg-linear-to-b': 'bg-gradient-to-b',
  'text-title-2xl': 'no existe aquí: nuestra escala title-* es 2 escalones menor (title-lg = su title-sm)',
  'text-title-xl': 'ídem: traducir bajando dos escalones',
};

/* ── Utilidades de lectura ────────────────────────────────────────────────── */
const leer = (r) => readFileSync(join(RAIZ, r), 'utf8');

function archivosHtml() {
  const lista = [];
  for (const carpeta of CARPETAS) {
    for (const e of readdirSync(join(RAIZ, carpeta), { withFileTypes: true })) {
      if (e.isDirectory()) {
        for (const s of readdirSync(join(RAIZ, carpeta, e.name)))
          if (s.endsWith('.html')) lista.push(`${carpeta}/${e.name}/${s}`.replace(/\\/g, '/'));
      } else if (e.name.endsWith('.html')) {
        lista.push(`${carpeta}/${e.name}`.replace(/\\/g, '/'));
      }
    }
  }
  return lista;
}

const exencion = (ruta) => EXENTAS.find(([prefijo]) => ruta.startsWith(prefijo));

/* Silencios en línea: `conformidad-ignorar: <regla> motivo: <texto>` */
function silencios(lineas, n) {
  const texto = (lineas[n] || '') + ' ' + (lineas[n - 1] || '');
  const m = texto.match(/conformidad-ignorar:\s*([a-z-]+)(.*)/);
  if (!m) return null;
  return { regla: m[1], conMotivo: /motivo:\s*\S/.test(m[2]) };
}

/* ── Conjunto de clases EMITIDAS ──────────────────────────────────────────── */
function clasesEmitidas() {
  const emitidas = new Set();
  /* Tailwind escapa la coma de las arbitrarias como código hexadecimal CSS:
     `rgba(0\2c 0\2c 0\2c .15)` — con espacio terminador incluido. Si el
     des-escape no lo entiende, cada shadow-[…rgba(…)] emitida parece ausente
     y la regla estrella grita en falso. */
  const RE = /\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[A-Za-z0-9_-])+)/g;
  const desescapar = (sel) => sel
    .replace(/\\([0-9a-fA-F]{1,6}) ?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\(.)/g, '$1');
  const hojas = readdirSync(join(RAIZ, 'assets/css')).filter((n) => n.endsWith('.css'));
  for (const hoja of hojas) {
    for (const m of leer('assets/css/' + hoja).matchAll(RE)) {
      emitidas.add(desescapar(m[1]));
    }
  }
  return emitidas;
}

/* Solo el texto donde viven clases: los valores de class/:class en las
   plantillas y las cadenas de los .js (ahí están los mapas VARIANTES/TAMANOS
   de las primitivas). Tokenizar el archivo entero convertía cada nombre de
   etiqueta (select), atributo SVG (stroke-width) y estilo en línea
   (z-index:0) en un falso bloqueante. */
function textoConClases(contenido, esJs) {
  const trozos = [];
  if (esJs) {
    for (const m of contenido.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
      trozos.push(m[1] ?? m[2] ?? '');
    }
  } else {
    for (const m of contenido.matchAll(/:?class="([^"]*)"/g)) trozos.push(m[1]);
  }
  return trozos.join(' ');
}

/* Tokens del código que PARECEN utilidades de Tailwind. Acotar por prefijo es
   lo que evita que cada palabra en español se convierta en falso positivo. */
const PREFIJOS = /^(?:bg|text|border|rounded|flex|grid|block|inline|hidden|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|h|w|min-h|min-w|max-h|max-w|gap|space|divide|shadow|ring|outline|z|top|bottom|left|right|inset|translate|scale|rotate|transition|duration|ease|delay|opacity|overflow|object|items|justify|content|self|place|order|col|row|font|leading|tracking|whitespace|break|truncate|align|list|cursor|select|pointer|resize|appearance|fill|stroke|sr-only|not-sr-only|underline|line-through|no-underline|uppercase|lowercase|capitalize|normal-case|italic|not-italic|antialiased|backdrop|blur|brightness|contrast|drop-shadow|grayscale|invert|saturate|sepia|filter|animate|will-change|accent|caret|scroll|snap|touch|shrink|grow|basis|aspect|columns|isolation|isolate|mix-blend|absolute|relative|fixed|sticky|static|visible|invisible|collapse|table|flow-root|contents|tabular-nums)(?:-|$)/;

const VARIANTES = /^(?:hover|focus|focus-visible|focus-within|active|disabled|visited|checked|group-hover|group-focus|peer-checked|first|last|odd|even|sm|md|lg|xl|2xl|dark|placeholder|before|after|selection|marker|file|backdrop|motion-safe|motion-reduce|print|rtl|ltr|open):/;

function tokensTailwind(texto) {
  const tokens = new Set();
  // La coma y el + forman parte de las arbitrarias reales:
  // shadow-[0_4px_24px_rgba(0,0,0,.15)], pb-[calc(env(x)+0.5rem)].
  // Sin ellos el token se corta y produce un falso «no emitida».
  for (const m of texto.matchAll(/[A-Za-z0-9_:[\]/().,+%#-]+/g)) {
    let t = m[0];
    if (t.length < 3 || t.length > 90) continue;
    let base = t;
    while (VARIANTES.test(base)) base = base.replace(VARIANTES, '');
    if (!base) continue;
    // Un `:` que sobrevive fuera de corchetes tras quitar variantes no es una
    // clase: es CSS en línea dentro de una string (border-radius:50% en los
    // divIcon de Leaflet).
    if (base.includes(':') && !base.includes('[')) continue;
    /* Una palabra suelta sin guion ni variante (flex, hidden, text) no se
       evalúa: si de verdad se usa como clase está emitida, y como token
       puede ser cualquier cosa — una palabra de un ternario, un nombre. */
    if (!base.includes('-') && !t.includes(':')) continue;
    const negativo = base.startsWith('-') ? base.slice(1) : base;
    if (PREFIJOS.test(negativo)) tokens.add(t);
  }
  return tokens;
}

/* ── Recolección ─────────────────────────────────────────────────────────────
   resultados: { regla: [ {ruta, linea, detalle} ] } */
const resultados = {};
const anotar = (regla, ruta, linea, detalle) => {
  (resultados[regla] = resultados[regla] || []).push({ ruta, linea, detalle });
};
const silenciosSinMotivo = [];

const rutas = archivosHtml();
const emitidas = clasesEmitidas();

/* Clases que existen sin estar en ninguna hoja del proyecto. */
const CONOCIDAS = new Set(['fa', 'fas', 'far', 'fab', 'fa-solid', 'fa-regular', 'fa-brands']);
const PREFIJOS_EXTERNOS = /^(?:fa-|leaflet-|chartjs-|swiper-)/;

for (const ruta of rutas) {
  const exenta = exencion(ruta);
  const contenido = leer(ruta);
  const lineas = contenido.split('\n');

  lineas.forEach((linea, i) => {
    const n = i + 1;
    const revisar = (regla, patron, detalle) => {
      if (!patron.test(linea)) return;
      if (exenta) return;
      const s = silencios(lineas, i);
      if (s && s.regla === regla) {
        if (!s.conMotivo) silenciosSinMotivo.push({ ruta, linea: n, regla });
        return;
      }
      anotar(regla, ruta, n, detalle ?? linea.trim().slice(0, 90));
    };

    revisar('boton-a-mano',   /<button\b(?![^>]*type="submit")/);
    revisar('campo-a-mano',   /<(?:input|textarea|select)\b/);
    revisar('tarjeta-a-mano', /rounded-2xl border border-gray-200 bg-white/);
    revisar('modal-a-mano',   /fixed inset-0 z-\[/);
    revisar('tabla-a-mano',   /<table\b/);
    revisar('z-arbitrario',   /\bz-\[\d+\]/);
    // La regla de dos puntos de ruptura: TailAdmin vive en sm: y lg: (89 % de
    // sus usos). El md: solo se admite en el canal (md:p-6, md:gap-6).
    if (/\bmd:(?!p-6\b|gap-6\b)/.test(linea)) {
      revisar('md-fuera-del-canal', /\bmd:(?!p-6\b|gap-6\b)/);
    }
    // Objetivo táctil, aproximación estática. El banco lo mide en vivo; esto
    // avisa ANTES de abrir el navegador.
    if (/<(?:button|input|select)\b/.test(linea) && /\bpy-1(?:\.5)?\b|\bh-[678]\b/.test(linea)) {
      revisar('control-bajo-44', /./);
    }
  });

  /* Botón de solo icono sin nombre accesible (multilínea). */
  if (!exenta) {
    for (const m of contenido.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const attrs = m[1], cuerpo = m[2];
      const soloIcono = !/[>}]\s*[^\s<{]/.test(cuerpo) && /<i\b/.test(cuerpo) &&
        !cuerpo.replace(/<i\b[^>]*><\/i>/g, '').replace(/\s+/g, '').replace(/<[^>]+>/g, '').length;
      const conNombre = /aria-label|:aria-label|title=|:title=|etiqueta-accesible/.test(attrs);
      if (soloIcono && !conNombre) {
        const n = contenido.slice(0, m.index).split('\n').length;
        const s = silencios(lineas, n - 1);
        if (s && s.regla === 'icono-sin-nombre') {
          if (!s.conMotivo) silenciosSinMotivo.push({ ruta, linea: n, regla: 'icono-sin-nombre' });
        } else {
          anotar('icono-sin-nombre', ruta, n, attrs.trim().slice(0, 80));
        }
      }
    }
  }

  /* BLOQUEANTE · clase usada y no emitida. Corre también en las exentas: una
     clase inexistente no se vuelve válida por estar en un lienzo de mapa.
     Incluye las arbitrarias (w-[85vw]): el JIT solo las emite si se recompiló
     después de escribirlas — una arbitraria ausente es el fallo ring-3 con
     otro nombre. */
  for (const t of tokensTailwind(textoConClases(contenido, false))) {
    if (t.includes('(') && !t.includes('[')) {
      anotar('clase-no-emitida', ruta, 0, `${t} — sintaxis de Tailwind v4 (variables), no compila en v3`);
      continue;
    }
    let base = t;
    while (VARIANTES.test(base)) base = base.replace(VARIANTES, '');
    if (emitidas.has(t) || emitidas.has(base)) continue;
    if (CONOCIDAS.has(base) || PREFIJOS_EXTERNOS.test(base)) continue;
    const sugerencia = TRADUCCION_V4[base];
    anotar('clase-no-emitida', ruta, 0,
      sugerencia ? `${t} — utilidad de Tailwind v4; en v3: ${sugerencia}` : `${t} — no existe en la hoja compilada`);
  }
}

/* La regla estrella también recorre los .js de componentes: ahí viven los
   mapas VARIANTES/TAMANOS de las primitivas, que es exactamente donde un
   focus:ring-3 pegado de TailAdmin se esconde mejor. */
{
  const pila = ['assets/js/components/shared', 'assets/js/components/admin'];
  while (pila.length) {
    const dir = pila.pop();
    for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) { pila.push(rel); continue; }
      if (!e.name.endsWith('.js')) continue;
      for (const t of tokensTailwind(textoConClases(leer(rel), true))) {
        if (t.includes('(') && !t.includes('[')) continue;   // llamadas de función
        let base = t;
        while (VARIANTES.test(base)) base = base.replace(VARIANTES, '');
        if (emitidas.has(t) || emitidas.has(base)) continue;
        if (CONOCIDAS.has(base) || PREFIJOS_EXTERNOS.test(base)) continue;
        const sugerencia = TRADUCCION_V4[base];
        anotar('clase-no-emitida', rel, 0,
          sugerencia ? `${t} — utilidad de Tailwind v4; en v3: ${sugerencia}` : `${t} — no existe en la hoja compilada`);
      }
    }
  }
}

/* ── Registro huérfano: el fallo de los tres sitios ─────────────────────────
   Una vista necesita índice + rama + navegación. Aquí se cruzan los dos
   primeros contra el disco; la navegación la ejercita el banco al hacer clic. */
{
  const indice = leer('assets/js/components/index.js');
  const appRoot = leer('assets/templates/shared/app-root.html');
  for (const m of indice.matchAll(/'([a-z-]+)':\s*\{\s*comp:[^,]+,\s*tpl:\s*'([^']+)'/g)) {
    const [, nombre, tpl] = m;
    if (!existsSync(join(RAIZ, 'assets/templates', tpl + '.html'))) {
      anotar('registro-roto', 'assets/js/components/index.js', 0,
        `'${nombre}' apunta a ${tpl}.html, que no existe en disco`);
    }
    if (nombre.startsWith('vista-')) {
      const usado = appRoot.includes('<' + nombre) ||
        rutas.some((r) => r !== 'assets/templates/shared/app-root.html' && leer(r).includes('<' + nombre));
      if (!usado) {
        anotar('vista-inalcanzable', 'assets/js/components/index.js', 0,
          `'${nombre}' está registrada pero ninguna rama ni plantilla la monta`);
      }
    }
  }
}

/* ── Veredicto ─────────────────────────────────────────────────────────────── */
const BLOQUEANTES = ['clase-no-emitida', 'registro-roto'];
const ORDEN = ['clase-no-emitida', 'registro-roto', 'vista-inalcanzable', 'modal-a-mano',
  'z-arbitrario', 'tabla-a-mano', 'tarjeta-a-mano', 'boton-a-mano', 'campo-a-mano',
  'icono-sin-nombre', 'control-bajo-44', 'md-fuera-del-canal'];

const conteo = {};
for (const r of ORDEN) conteo[r] = (resultados[r] || []).length;

const base = existsSync(BASE_JSON) ? JSON.parse(readFileSync(BASE_JSON, 'utf8')) : null;

if (MODO_CONGELAR) {
  writeFileSync(BASE_JSON, JSON.stringify(conteo, null, 2) + '\n');
  console.log('Presupuesto congelado en conformidad-base.json:');
  for (const [k, v] of Object.entries(conteo)) console.log(`  ${k.padEnd(22)} ${v}`);
  process.exit(0);
}

let salida = 0;

console.log('Conformidad · alcance: admin/ + shared/ (las PWAs entran con su ola)\n');
console.log('regla'.padEnd(24) + 'ahora'.padStart(6) + 'base'.padStart(7) + '  estado');
for (const regla of ORDEN) {
  const ahora = conteo[regla];
  const linea = regla.padEnd(24) + String(ahora).padStart(6);
  if (BLOQUEANTES.includes(regla)) {
    console.log(linea + '      —' + (ahora ? '  BLOQUEA' : '  limpio'));
    if (ahora) salida = 1;
  } else if (base) {
    const b = base[regla] ?? 0;
    const sube = ahora > b;
    console.log(linea + String(b).padStart(7) + (sube ? '  SUBIÓ' : ahora < b ? '  bajó ✓' : '  igual'));
    if (sube && !EN_BUILD) salida = 1;
  } else {
    console.log(linea + '      ?  (sin base: ejecuta --congelar)');
  }
}

if (silenciosSinMotivo.length) {
  salida = 1;
  console.log('\nSILENCIOS SIN MOTIVO (bloquean siempre: un silencio sin razón es deuda escondida):');
  for (const s of silenciosSinMotivo) console.log(`  ${s.ruta}:${s.linea} · ${s.regla}`);
}

const detalleBloqueantes = BLOQUEANTES.flatMap((r) => (resultados[r] || []).map((x) => ({ ...x, regla: r })));
if (detalleBloqueantes.length) {
  console.log('\nBLOQUEANTES:');
  for (const d of detalleBloqueantes.slice(0, 30)) {
    console.log(`  ${d.ruta}${d.linea ? ':' + d.linea : ''} · ${d.detalle}`);
  }
}

if (!MODO_RESUMEN && !EN_BUILD && base) {
  for (const regla of ORDEN) {
    if (BLOQUEANTES.includes(regla)) continue;
    if (conteo[regla] > (base[regla] ?? 0)) {
      console.log(`\nDetalle de «${regla}» (subió ${base[regla] ?? 0} → ${conteo[regla]}):`);
      for (const d of (resultados[regla] || []).slice(0, 15)) {
        console.log(`  ${d.ruta}:${d.linea} · ${d.detalle}`);
      }
    }
  }
}

console.log('\nNota: la regla «color literal en franja KPI» vive en el banco (sonda de paleta),');
console.log('que inyecta un magenta en --kpi-pendiente y comprueba que la interfaz obedece.');

process.exit(MODO_RESUMEN ? 0 : salida);
