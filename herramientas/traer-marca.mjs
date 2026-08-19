// Los logos institucionales también venían del servidor de la municipalidad.
// Son de la alcaldía, no de un tercero, pero para una PWA instalada da igual de
// quién sean: si no hay red, no hay logo, y la pantalla de acceso aparece con
// un hueco. Se traen al repositorio y se redimensionan a lo que realmente se
// pinta — el circular pesaba 941 KB para mostrarse a 192 px.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const BASE = 'https://sansalvadorsur.gob.sv/images/';
const DESTINO = 'assets/img/marca/';

// nombre remoto → { local, ancho máximo al que se pinta }
const LOGOS = {
  'logo-azul-horizontal.png':   { local: 'logo-azul-horizontal.png',   ancho: 480 },
  'logo-blanco-horizontal.png': { local: 'logo-blanco-horizontal.png', ancho: 480 },
  'logo-blanco-vertical.png':   { local: 'logo-blanco-vertical.png',   ancho: 320 },
  'logo-circulo-blanco.png':    { local: 'logo-circulo-blanco.png',    ancho: 256 },
};

for (const [remoto, cfg] of Object.entries(LOGOS)) {
  const salida = join(DESTINO, cfg.local);
  try {
    const r = await fetch(BASE + remoto);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const original = Buffer.from(await r.arrayBuffer());
    // `withoutEnlargement`: si el original ya es más pequeño, no se estira.
    await sharp(original)
      .resize({ width: cfg.ancho, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(salida);
    console.log(`  ${cfg.local.padEnd(30)} ${(original.length / 1024).toFixed(0)} KB -> `
      + `${(statSync(salida).size / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.error(`  ERROR ${remoto}: ${e.message}`);
    process.exitCode = 1;
  }
}

// ── Reescritura de las referencias ─────────────────────────────────────────
async function archivos(carpeta, salida = []) {
  for (const e of await readdir(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) await archivos(ruta, salida);
    else if (/\.(js|html)$/.test(e.name)) salida.push(ruta);
  }
  return salida;
}

let tocados = 0;
for (const f of await archivos('assets')) {
  if (f.includes('vendor')) continue;
  const crudo = readFileSync(f, 'utf8');
  let s = crudo;
  for (const [remoto, cfg] of Object.entries(LOGOS)) {
    s = s.split(BASE + remoto).join('/' + DESTINO + cfg.local);
  }
  if (s !== crudo) { writeFileSync(f, s); tocados++; console.log('  reescrito:', f); }
}

console.log(`\n${tocados} archivos actualizados.`);
const quedan = (await archivos('assets'))
  .filter((f) => !f.includes('vendor') && /sansalvadorsur\.gob\.sv/.test(readFileSync(f, 'utf8')));
console.log('referencias externas restantes:', quedan.length ? quedan : 'ninguna');
