// ============================================================
// SERVICIO: compartir una denuncia como imagen + texto
//
// El botón «Compartir Denuncia» del portal no tenía ni `@click`. Ahora arma una
// tarjeta y la entrega por la hoja de compartir del sistema, que es lo que pone
// WhatsApp, Telegram o el correo al alcance sin integrarse con ninguno.
//
// ── POR QUÉ SE DIBUJA LA TARJETA A MANO ─────────────────────────────────────
// Lo habitual sería html2canvas, y sería la decimocuarta dependencia de CDN sin
// vendorizar de un proyecto que ya arrastra trece. Además html2canvas
// REINTERPRETA el CSS —no usa el motor del navegador— así que lo que exporta no
// es lo que se ve en pantalla, y el resultado depende de qué propiedades
// soporte esa versión. Dibujar en canvas son doscientas líneas y sale igual en
// todos los teléfonos.
//
// ── LO QUE LA TARJETA NO LLEVA ──────────────────────────────────────────────
// Ni nombre, ni DUI, ni teléfono de quien reportó. La comparte el propio vecino
// por WhatsApp, y de ahí en adelante nadie controla dónde acaba. Va lo que
// identifica al CASO —correlativo, categoría, estado, lugar y fecha— y nada que
// identifique a la PERSONA. Aunque la denuncia no sea anónima.
//
// ── LA FOTOGRAFÍA Y EL LIENZO CONTAMINADO ───────────────────────────────────
// Dibujar en un canvas una imagen de otro origen sin CORS lo «contamina», y a
// partir de ahí `toBlob` lanza SecurityError. En producción la página y las
// fotos comparten dominio, así que no ocurre; en desarrollo, con la página en
// 127.0.0.1 y las fotos en el dominio real, sí. Por eso se intenta con foto y,
// si el lienzo sale contaminado, se rehace sin ella: mejor una tarjeta sin
// fotografía que un botón que falla.
// ============================================================
import { cargarAdjuntosDeCaso } from './adjuntos-caso.js';

const ANCHO = 1080;
const MARGEN = 72;
const AZUL = '#2563eb';
const TINTA = '#0f172a';
const GRIS = '#64748b';

/**
 * Rompe un texto en líneas que quepan en `ancho`, con un tope de líneas.
 *
 * Si algo se queda fuera lo dice con puntos suspensivos, recortando palabra a
 * palabra hasta que quepan: cortar en seco deja al lector sin saber si el texto
 * terminaba ahí o si la tarjeta se lo comió.
 */
function partirEnLineas(ctx, texto, ancho, maximoLineas = 99) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  let sobra = false;

  for (let i = 0; i < palabras.length; i++) {
    const prueba = actual ? `${actual} ${palabras[i]}` : palabras[i];
    if (ctx.measureText(prueba).width <= ancho) { actual = prueba; continue; }

    if (lineas.length === maximoLineas - 1) { sobra = true; break; }
    if (actual) lineas.push(actual);
    actual = palabras[i];
  }
  if (actual) lineas.push(actual);
  if (!sobra) return lineas;

  let ultima = lineas[lineas.length - 1] || '';
  while (ultima && ctx.measureText(ultima + '…').width > ancho) {
    ultima = ultima.replace(/\s*\S+$/, '');
  }
  lineas[lineas.length - 1] = (ultima || '') + '…';
  return lineas;
}

/** Rectángulo con esquinas redondeadas, que `roundRect` no está en todos lados. */
function rectanguloRedondo(ctx, x, y, ancho, alto, radio) {
  const r = Math.min(radio, ancho / 2, alto / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + ancho, y, x + ancho, y + alto, r);
  ctx.arcTo(x + ancho, y + alto, x, y + alto, r);
  ctx.arcTo(x, y + alto, x, y, r);
  ctx.arcTo(x, y, x + ancho, y, r);
  ctx.closePath();
}

/** Marcador de ubicación: círculo con cola y agujero, en trazos propios. */
function dibujarPin(ctx, cx, cy, radio) {
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cx, cy, radio, Math.PI, 0);
  ctx.lineTo(cx, cy + radio * 1.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, radio * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Carga una imagen para dibujarla en el lienzo.
 *
 * `crossOrigin` se pide SOLO cuando la imagen viene de otro origen. En
 * producción la página y las fotos comparten dominio, y ahí una petición
 * same-origin no pasa por CORS en absoluto: pedirlo no aporta nada y añade una
 * forma más de fallar. En desarrollo —página en 127.0.0.1, fotos en el
 * dominio— sí hace falta, y el servidor tiene que responder con
 * `Access-Control-Allow-Origin` o la imagen ni siquiera carga.
 *
 * Va ANTES de `src`: asignarlo después no cambia la petición que el navegador
 * ya lanzó. Devuelve null si falla, y quien llama sigue sin foto.
 */
function cargarImagen(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }

    let esDeOtroOrigen = false;
    try { esDeOtroOrigen = new URL(url, location.href).origin !== location.origin; }
    catch (e) { esDeOtroOrigen = true; }

    const img = new Image();
    if (esDeOtroOrigen) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (esDeOtroOrigen) {
        console.warn(
          '[compartir] La fotografía no se pudo leer desde otro origen. ' +
          'Falta el origen de esta página en el .htaccess de uploads-monitoreo/evidencias. ' +
          'En producción no ocurre: página y fotos comparten dominio.'
        );
      }
      resolve(null);
    };
    img.src = url;
  });
}

/** Texto para el mensaje. Lo que se lee antes de abrir la imagen. */
export function componerTexto(d) {
  const partes = [
    `Denuncia ${d.correlativo || '#' + d.id} · ${d.categoriaNombre || 'Reporte ciudadano'}`,
    `Estado: ${d.estadoNombre || d.estado || 'En trámite'}`,
  ];
  if (d.direccion) partes.push(`Lugar: ${d.direccion}`);
  if (d.distrito) partes.push(`Distrito: ${d.distrito}`);
  if (d.fechaTexto) partes.push(`Reportada: ${d.fechaTexto}`);
  if (d.coordenadas) {
    partes.push(`Ubicación: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.coordenadas)}`);
  }
  partes.push('', 'Reportada por el portal ciudadano de la Alcaldía de San Salvador Sur.');
  return partes.join('\n');
}

/**
 * Dibuja la tarjeta y la devuelve como PNG.
 *
 * @param {object} d      datos ya presentados (no filas crudas de la base)
 * @param {string} urlFoto  opcional
 * @param {boolean} conFoto  segundo intento sin foto si el lienzo se contamina
 * @returns {Promise<Blob|null>}
 */
export async function generarTarjeta(d, urlFoto, conFoto = true) {
  // Sin esto, el primer trazado usa la fuente de reserva porque Inter aún no
  // ha terminado de descargarse, y la tarjeta sale con otra tipografía.
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch (e) { /* sin bloquear */ } }

  const foto = conFoto ? await cargarImagen(urlFoto) : null;
  const anchoUtil = ANCHO - MARGEN * 2;

  // Se mide antes de crear el lienzo: la altura depende de cuánto texto haya.
  const medidor = document.createElement('canvas').getContext('2d');
  medidor.font = '600 40px Inter, system-ui, sans-serif';
  const lineasCategoria = partirEnLineas(medidor, d.categoriaNombre || 'Reporte ciudadano', anchoUtil, 2);
  medidor.font = '400 34px Inter, system-ui, sans-serif';
  const lineasDireccion = partirEnLineas(medidor, d.direccion || '', anchoUtil - 56, 3);
  medidor.font = '400 32px Inter, system-ui, sans-serif';
  const lineasDescripcion = partirEnLineas(medidor, d.descripcion || '', anchoUtil, 4);

  const altoFoto = foto ? 560 : 0;
  const alto = 300                              // cabecera
    + lineasCategoria.length * 52 + 30
    + 76                                        // distintivo de estado
    + (lineasDescripcion.length ? lineasDescripcion.length * 44 + 24 : 0)
    + (lineasDireccion.length ? lineasDireccion.length * 44 + 24 : 0)
    + 60                                        // fecha
    + (altoFoto ? altoFoto + 32 : 0)
    + 150;                                      // pie

  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ANCHO, alto);

  // ── Cabecera institucional ────────────────────────────────────────────────
  ctx.fillStyle = AZUL;
  ctx.fillRect(0, 0, ANCHO, 216);
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = '700 28px Inter, system-ui, sans-serif';
  ctx.fillText('ALCALDÍA DE SAN SALVADOR SUR', MARGEN, 84);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 62px Inter, system-ui, sans-serif';
  ctx.fillText(d.correlativo || `Denuncia #${d.id}`, MARGEN, 158);

  let y = 216 + 68;

  // ── Categoría ─────────────────────────────────────────────────────────────
  ctx.fillStyle = TINTA;
  ctx.font = '600 40px Inter, system-ui, sans-serif';
  for (const linea of lineasCategoria) { ctx.fillText(linea, MARGEN, y); y += 52; }
  y += 30;

  // ── Estado ────────────────────────────────────────────────────────────────
  const textoEstado = (d.estadoNombre || d.estado || 'En trámite').toUpperCase();
  ctx.font = '700 28px Inter, system-ui, sans-serif';
  const anchoEtiqueta = ctx.measureText(textoEstado).width + 56;
  ctx.fillStyle = d.estadoColor || '#eff6ff';
  rectanguloRedondo(ctx, MARGEN, y - 38, anchoEtiqueta, 56, 28);
  ctx.fill();
  ctx.fillStyle = d.estadoColorTexto || AZUL;
  ctx.fillText(textoEstado, MARGEN + 28, y);
  y += 76;

  // ── Descripción ───────────────────────────────────────────────────────────
  if (lineasDescripcion.length) {
    ctx.fillStyle = '#334155';
    ctx.font = '400 32px Inter, system-ui, sans-serif';
    for (const linea of lineasDescripcion) { ctx.fillText(linea, MARGEN, y); y += 44; }
    y += 24;
  }

  // ── Lugar ─────────────────────────────────────────────────────────────────
  if (lineasDireccion.length) {
    // El pin se DIBUJA, no se escribe con el glifo de Font Awesome: esa fuente
    // se carga en diferido y en el canvas puede no estar lista al trazar, y
    // entonces sale el cuadrito de carácter ausente en mitad de la tarjeta.
    dibujarPin(ctx, MARGEN + 14, y - 26, 15);
    ctx.fillStyle = GRIS;
    ctx.font = '400 34px Inter, system-ui, sans-serif';
    for (const linea of lineasDireccion) { ctx.fillText(linea, MARGEN + 56, y); y += 44; }
    y += 24;
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 28px Inter, system-ui, sans-serif';
  ctx.fillText(d.fechaTexto || '', MARGEN, y);
  y += 60;

  // ── Fotografía ────────────────────────────────────────────────────────────
  if (foto) {
    // Se recorta al centro en lugar de deformar: una evidencia estirada engaña
    // sobre el tamaño de lo que muestra.
    const escala = Math.max(anchoUtil / foto.width, altoFoto / foto.height);
    const anchoDibujo = foto.width * escala;
    const altoDibujo = foto.height * escala;
    ctx.save();
    rectanguloRedondo(ctx, MARGEN, y, anchoUtil, altoFoto, 28);
    ctx.clip();
    ctx.drawImage(foto,
      MARGEN + (anchoUtil - anchoDibujo) / 2,
      y + (altoFoto - altoDibujo) / 2,
      anchoDibujo, altoDibujo);
    ctx.restore();
    y += altoFoto + 32;
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGEN, y);
  ctx.lineTo(ANCHO - MARGEN, y);
  ctx.stroke();
  y += 52;
  ctx.fillStyle = GRIS;
  ctx.font = '500 28px Inter, system-ui, sans-serif';
  ctx.fillText('Reportada desde el portal ciudadano', MARGEN, y);
  y += 40;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 26px Inter, system-ui, sans-serif';
  ctx.fillText('monitoreo.sansalvadorsur.gob.sv', MARGEN, y);

  try {
    return await new Promise((resolve) => lienzo.toBlob(resolve, 'image/png'));
  } catch (e) {
    // Lienzo contaminado por la foto de otro origen. Se rehace sin ella.
    if (conFoto) {
      console.warn('[compartir] La fotografía contaminó el lienzo; se comparte sin ella.');
      return generarTarjeta(d, null, false);
    }
    console.error('[compartir] No se pudo generar la imagen:', e.message);
    return null;
  }
}

/**
 * Comparte la denuncia. Degrada en tres escalones, del mejor al que siempre
 * funciona:
 *
 *   1. Imagen + texto por la hoja del sistema (Web Share Nivel 2).
 *   2. Solo texto, si el navegador comparte pero no admite archivos.
 *   3. Texto al portapapeles y la imagen descargada, si no hay hoja ninguna
 *      —que es el caso de casi todo navegador de escritorio—.
 *
 * @returns {Promise<{ok: boolean, via: string, aviso: string}>}
 */
export async function compartirDenuncia(d) {
  const texto = componerTexto(d);
  const titulo = `Denuncia ${d.correlativo || '#' + d.id}`;

  // La foto se pide aquí y no en la vista: quien comparte no tiene por qué
  // saber que las evidencias viven en otra tabla.
  let urlFoto = d.urlFoto || null;
  if (!urlFoto && d.id) {
    const r = await cargarAdjuntosDeCaso(d.id);
    urlFoto = r.adjuntos[0]?.url || null;
  }

  const imagen = await generarTarjeta(d, urlFoto);
  const archivo = imagen
    ? new File([imagen], `denuncia-${d.correlativo || d.id}.png`, { type: 'image/png' })
    : null;

  // `canShare` se consulta con el archivo REAL: algunos navegadores aceptan la
  // API y rechazan el tipo, y sin esta comprobación `share` lanza una excepción
  // que el vecino ve como «no pasó nada».
  if (archivo && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], text: texto, title: titulo });
      return { ok: true, via: 'archivo', aviso: '' };
    } catch (e) {
      // `AbortError` es que la persona cerró la hoja. No es un fallo y no se
      // le puede contestar con un error rojo.
      if (e?.name === 'AbortError') return { ok: true, via: 'cancelado', aviso: '' };
      console.warn('[compartir] Falló compartir con imagen:', e.message);
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ text: texto, title: titulo });
      return { ok: true, via: 'texto', aviso: 'Se compartió el texto; este navegador no admite enviar la imagen.' };
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: true, via: 'cancelado', aviso: '' };
      console.warn('[compartir] Falló compartir texto:', e.message);
    }
  }

  // Último escalón: portapapeles y descarga. Aquí sí se descarga un archivo
  // porque esto es la aplicación real en un navegador, no una vista incrustada.
  let copiado = false;
  try {
    await navigator.clipboard.writeText(texto);
    copiado = true;
  } catch (e) { /* sin permiso de portapapeles */ }

  if (imagen) {
    const url = URL.createObjectURL(imagen);
    const a = document.createElement('a');
    a.href = url;
    a.download = `denuncia-${d.correlativo || d.id}.png`;
    a.click();
    // Se libera en el siguiente ciclo: revocarla de inmediato cancela la
    // descarga en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return {
    ok: true,
    via: 'descarga',
    aviso: copiado
      ? 'Tu navegador no puede compartir directamente. Se copió el texto y se descargó la imagen.'
      : 'Tu navegador no puede compartir directamente. Se descargó la imagen.',
  };
}
