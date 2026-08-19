#!/usr/bin/env node
/**
 * Compara dos pasadas del banco visual píxel a píxel.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * `cmp` solo sabe decir «distintos». Y en un banco visual casi todo sale
 * distinto: el reloj de la cabecera cambia de minuto, las teselas del mapa
 * llegan en otro orden. Con eso, «35 de 60 capturas difieren» no distingue un
 * cambio de diseño de que haya pasado un minuto.
 *
 * Lo que hace falta es CUÁNTO y DÓNDE. Un cambio de 40 píxeles en una esquina
 * es un reloj; 30.000 repartidos por toda la pantalla es un cambio de maqueta.
 * El rectángulo que los encierra lo dice sin ambigüedad.
 *
 * Se apoya en el canvas del propio Chrome para decodificar los PNG: es el
 * navegador que el banco ya usa, así que no añade ninguna dependencia.
 *
 *     node herramientas/comparar-capturas.mjs base fase1
 *     node herramientas/comparar-capturas.mjs base fase1 --umbral=0.5
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const posicionales = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opciones = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--'))
    .map((a) => a.replace(/^--/, '').split('='))
);
const [ANTES, DESPUES] = posicionales;
/* Por debajo de este porcentaje de píxeles distintos se considera ruido de
   captura —el reloj, una tesela— y no un cambio de diseño. */
const UMBRAL = Number(opciones.umbral ?? 0.15);

if (!ANTES || !DESPUES) {
  console.error('uso: comparar-capturas.mjs <etiquetaAntes> <etiquetaDespues> [--umbral=0.15]');
  process.exit(1);
}

const dirA = join(RAIZ, 'screenshots', ANTES);
const dirB = join(RAIZ, 'screenshots', DESPUES);

const CHROME = process.env.CHROME_BIN
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Compara dos PNG dentro de la página y devuelve recuento y rectángulo. */
const COMPARAR = async (dataA, dataB) => {
  const cargar = (d) => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = d;
  });
  const [ia, ib] = await Promise.all([cargar(dataA), cargar(dataB)]);
  if (ia.width !== ib.width || ia.height !== ib.height) {
    return { dimensionDistinta: true, a: [ia.width, ia.height], b: [ib.width, ib.height] };
  }
  const pinta = (img) => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
    return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
  };
  const pa = pinta(ia), pb = pinta(ib);

  let distintos = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < pa.length; i += 4) {
    // Tolerancia por canal: el reescalado del PNG puede mover un valor de 1.
    if (Math.abs(pa[i] - pb[i]) > 8 || Math.abs(pa[i + 1] - pb[i + 1]) > 8 ||
        Math.abs(pa[i + 2] - pb[i + 2]) > 8) {
      distintos++;
      const px = (i / 4) % ia.width, py = Math.floor((i / 4) / ia.width);
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
  }
  const total = ia.width * ia.height;
  return {
    distintos,
    porcentaje: +(distintos / total * 100).toFixed(3),
    ancho: ia.width, alto: ia.height,
    rect: distintos ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null,
  };
};

const navegador = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
});
const pagina = await navegador.newPage();

const aDataUri = (ruta) => 'data:image/png;base64,' + readFileSync(ruta).toString('base64');

const archivos = readdirSync(dirA).filter((n) => n.endsWith('.png')).sort();
const cambiados = [], ruido = [], ausentes = [];

for (const n of archivos) {
  const rb = join(dirB, n);
  if (!existsSync(rb)) { ausentes.push(n); continue; }
  const r = await pagina.evaluate(COMPARAR, aDataUri(join(dirA, n)), aDataUri(rb));
  if (r.dimensionDistinta) { cambiados.push({ n, nota: `dimensión ${r.a} -> ${r.b}` }); continue; }
  if (r.distintos === 0) continue;
  const destino = r.porcentaje >= UMBRAL ? cambiados : ruido;
  destino.push({ n, ...r });
}

await navegador.close();

console.log(`${ANTES} -> ${DESPUES}   (${archivos.length} capturas, umbral ${UMBRAL}%)\n`);

if (ausentes.length) console.log(`AUSENTES en ${DESPUES}: ${ausentes.length}\n${ausentes.map((n) => '  ' + n).join('\n')}\n`);

console.log(`CAMBIOS REALES (>= ${UMBRAL}%): ${cambiados.length}`);
for (const c of cambiados) {
  if (c.nota) { console.log(`  ${c.n}  ${c.nota}`); continue; }
  const r = c.rect;
  console.log(`  ${c.n.padEnd(46)} ${String(c.porcentaje).padStart(7)}%  ` +
    `zona ${r.w}x${r.h} en (${r.x},${r.y}) de ${c.ancho}x${c.alto}`);
}

console.log(`\nRUIDO (< ${UMBRAL}%, reloj o teselas): ${ruido.length}`);
for (const c of ruido.slice(0, 8)) {
  const r = c.rect;
  console.log(`  ${c.n.padEnd(46)} ${String(c.porcentaje).padStart(7)}%  zona ${r.w}x${r.h} en (${r.x},${r.y})`);
}
if (ruido.length > 8) console.log(`  … y ${ruido.length - 8} más`);

console.log(`\nIDÉNTICAS: ${archivos.length - cambiados.length - ruido.length - ausentes.length}`);
