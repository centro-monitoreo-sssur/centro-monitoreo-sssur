// ============================================================
// SERVICIO: subida de evidencia fotográfica de casos a cPanel
//
// El endpoint es cpanel/subir_evidencia.php. Verifica el JWT de Supabase con
// el JWT Secret del proyecto, así que la subida está autenticada de verdad.
//
// Devuelve objetos con la forma que esperan `p_adjuntos` en las RPC
// `crear_caso_campo` (v18/v21) y `cerrar_caso_campo` (v20):
//     { url, nombre, mime, tamano, tipo }
// ============================================================
import { db } from '../core/supabase.js';
import { comprimirImagenABlob } from '../utils/image-compressor.js';

// Rellenar con la URL del endpoint una vez subido a cPanel. Mientras esté
// vacío, `evidenciasConfiguradas` es false: la interfaz avisa de que las fotos
// no se enviarán en lugar de fingir que sí.
//
// Valor esperado en producción:
//   https://monitoreo.sansalvadorsur.gob.sv/api-monitoreo/subir_evidencia.php
//
// Es el MISMO origen que sirve el frontend, así que el navegador no aplica
// CORS. Ponerlo como ruta relativa —'/api-monitoreo/subir_evidencia.php'—
// también funciona y sobrevive a un cambio de dominio, pero se deja absoluto
// porque en desarrollo el frontend se sirve desde Live Server y la ruta
// relativa apuntaría a localhost.
export const ENDPOINT_EVIDENCIAS = '';

export const evidenciasConfiguradas = Boolean(ENDPOINT_EVIDENCIAS);

// 1024×1024 y calidad 0.6 son los valores que fija
// docs/arquitectura/CONTEXTO_CRITICO.md §3 para no agotar la cuota.
const LADO_MAXIMO = 1024;
const CALIDAD = 0.6;
const MAX_ORIGINAL_BYTES = 12 * 1024 * 1024;

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Comprime y sube UNA fotografía.
 *
 * Nunca lanza: devuelve `{ ok, adjunto }` o `{ ok:false, error, esDeRed }`.
 * `esDeRed` distingue «no se alcanzó el servidor» —que en campo es lo normal y
 * no debe tratarse como un fallo del usuario— de «el servidor lo rechazó».
 */
export async function subirEvidencia(archivo) {
  if (!ENDPOINT_EVIDENCIAS) {
    return {
      ok: false,
      esDeRed: false,
      error: 'La subida de evidencias no está configurada. Revisa ENDPOINT_EVIDENCIAS ' +
             'en assets/js/services/evidencias.js.',
    };
  }
  if (!archivo) return { ok: false, esDeRed: false, error: 'No se recibió ninguna imagen.' };

  if (archivo.type && !TIPOS_ACEPTADOS.includes(archivo.type)) {
    return { ok: false, esDeRed: false, error: 'Formato no admitido. Usa JPG, PNG o WebP.' };
  }
  // Corte temprano: comprimir un archivo enorme congela la pestaña varios
  // segundos en un teléfono de gama media, y acabaría fallando igual.
  if (archivo.size > MAX_ORIGINAL_BYTES) {
    return { ok: false, esDeRed: false, error: 'La imagen original supera los 12 MB.' };
  }

  if (!db) return { ok: false, esDeRed: false, error: 'Sin conexión a Supabase: no se puede autenticar la subida.' };

  const { data: { session } } = await db.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, esDeRed: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };

  let comprimida;
  try {
    // Un Blob, no un DataURL: `FormData.append` con una cadena la manda como
    // campo de texto y en el servidor `$_FILES` llega vacío. Ver el comentario
    // de image-compressor.js.
    comprimida = await comprimirImagenABlob(archivo, LADO_MAXIMO, LADO_MAXIMO, CALIDAD);
  } catch (e) {
    return { ok: false, esDeRed: false, error: 'No se pudo procesar la imagen: ' + e.message };
  }

  const cuerpo = new FormData();
  cuerpo.append('foto', comprimida, 'evidencia.jpg');

  try {
    const respuesta = await fetch(ENDPOINT_EVIDENCIAS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },  // sin Content-Type: lo pone FormData con su boundary
      body: cuerpo,
    });

    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      return {
        ok: false,
        // Un 429 o un 5xx sí son del servidor, pero merecen reintento como si
        // fueran de red: el caso no debe perderse por una hora ocupada.
        esDeRed: respuesta.status === 429 || respuesta.status >= 500,
        error: datos.error || `El servidor respondió ${respuesta.status}.`,
      };
    }
    if (!datos.url) {
      return { ok: false, esDeRed: false, error: 'El servidor no devolvió la URL de la imagen.' };
    }

    return {
      ok: true,
      adjunto: {
        url: datos.url,
        nombre: datos.nombre || 'evidencia.jpg',
        mime: datos.mime || 'image/jpeg',
        tamano: datos.tamano || comprimida.size,
        tipo: 'foto',
      },
    };
  } catch (e) {
    // El navegador no distingue «origen no autorizado por CORS» de «servidor
    // inalcanzable»: se nombran las dos causas probables.
    return {
      ok: false,
      esDeRed: true,
      error: 'No se pudo contactar con el servidor de imágenes. Comprueba que el ' +
             'origen de esta página esté en ORIGENES_PERMITIDOS de subir_evidencia.php.',
    };
  }
}

/**
 * Sube varias fotografías y devuelve las que lograron subir.
 *
 * NO aborta al primer fallo, y es deliberado: si la segunda foto falla, la
 * primera ya está en el servidor y descartarla no arregla nada. El caso se
 * registra con lo que haya subido y quien llama decide qué contar al usuario.
 *
 * Secuencial y no en paralelo: son dos o tres imágenes desde una conexión
 * móvil en territorio, y lanzarlas a la vez compite por el mismo ancho de
 * banda estrecho sin ganar tiempo.
 */
export async function subirEvidencias(archivos) {
  const adjuntos = [];
  const errores = [];
  let algunoDeRed = false;

  for (const archivo of archivos || []) {
    const res = await subirEvidencia(archivo);
    if (res.ok) adjuntos.push(res.adjunto);
    else {
      errores.push(res.error);
      if (res.esDeRed) algunoDeRed = true;
    }
  }

  return {
    adjuntos,
    errores,
    algunoDeRed,
    // `true` solo si se pidió subir algo y TODO subió.
    completo: errores.length === 0,
  };
}
