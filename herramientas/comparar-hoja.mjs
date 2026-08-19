#!/usr/bin/env node
/**
 * Compara dos hojas compiladas de Tailwind por CONJUNTO DE SELECTORES.
 *
 * Existe porque `git diff` sobre `assets/css/tailwind.css` no dice nada útil:
 * la hoja sale minificada en una sola línea, así que cualquier cambio, por
 * pequeño que sea, aparece como «1 línea modificada». Verificar con eso es
 * verificar nada, y estuve a punto de dar por buena la Fase 1 con esa medida.
 *
 * Lo que de verdad importa en un cambio de tokens es que la hoja solo GANE
 * reglas. Un selector que desaparece es una pantalla que se despinta.
 *
 *     node herramientas/comparar-hoja.mjs <antes.css> <despues.css>
 */
import { readFileSync } from 'node:fs';

const RE_CLASE = /\.((?:\\.|[A-Za-z0-9_-])+)/g;

/** Extrae los nombres de clase de una hoja, deshaciendo el escapado de Tailwind. */
function selectores(ruta) {
  const css = readFileSync(ruta, 'utf8');
  const encontrados = new Set();
  for (const coincidencia of css.matchAll(RE_CLASE)) {
    encontrados.add(coincidencia[1].split('\\').join(''));
  }
  return encontrados;
}

const [rutaAntes, rutaDespues] = process.argv.slice(2);
if (!rutaAntes || !rutaDespues) {
  console.error('uso: comparar-hoja.mjs <antes.css> <despues.css>');
  process.exit(1);
}

const antes = selectores(rutaAntes);
const despues = selectores(rutaDespues);

const perdidos = [...antes].filter((s) => !despues.has(s)).sort();
const nuevos = [...despues].filter((s) => !antes.has(s)).sort();

console.log(`selectores: ${antes.size} -> ${despues.size}`);
console.log(`\nPERDIDOS (${perdidos.length}):`);
console.log(perdidos.length ? perdidos.map((s) => '  - ' + s).join('\n') : '  ninguno');
console.log(`\nNUEVOS (${nuevos.length}):`);
console.log(nuevos.length ? nuevos.map((s) => '  + ' + s).join('\n') : '  ninguno');

// Perder un selector en un cambio de tokens siempre es un fallo.
if (perdidos.length) process.exit(1);
