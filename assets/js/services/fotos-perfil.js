// ============================================================
// SERVICIO: subida de fotos de perfil a cPanel
//
// Las fotos de perfil son permanentes y pequeñas; las de denuncia son muchas y
// se purgan a los 7-15 días. Mandarlas al 1 GB de Supabase Storage haría que
// los perfiles compitiesen por la cuota que necesita la operación de campo
// (docs/arquitectura/CONTEXTO_CRITICO.md §3), así que van a cPanel.
//
// El endpoint es cpanel/subir_foto_perfil.php. Verifica el JWT de Supabase con
// el JWT Secret del proyecto, así que la subida está autenticada de verdad: no
// es un formulario abierto en Internet.
// ============================================================
import { db } from '../core/supabase.js';
import { comprimirImagenABlob } from '../utils/image-compressor.js';

// Rellenar con la URL del endpoint una vez subido a cPanel. Mientras esté
// vacío, `almacenamientoConfigurado` es false y la interfaz ofrece pegar una
// URL en vez de subir un archivo — degradar es mejor que fallar al pulsar.
//
// Valor esperado en producción:
//   https://monitoreo.sansalvadorsur.gob.sv/api-monitoreo/subir_foto_perfil.php
export const ENDPOINT_FOTOS = '';

export const almacenamientoConfigurado = Boolean(ENDPOINT_FOTOS);

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;   // antes de comprimir

/**
 * Comprime y sube una foto de perfil.
 * Devuelve { ok, url } o { ok: false, error } — nunca lanza, para que la vista
 * pueda mostrar el mensaje en el formulario sin romper el render.
 */
export async function subirFotoPerfil(archivo) {
  if (!ENDPOINT_FOTOS) {
    return { ok: false, error: 'La subida de fotos no está configurada. Revisa ENDPOINT_FOTOS en assets/js/services/fotos-perfil.js.' };
  }
  if (!archivo) return { ok: false, error: 'No se seleccionó ninguna imagen.' };

  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    return { ok: false, error: 'Formato no admitido. Usa JPG, PNG o WebP.' };
  }
  // Corte temprano: comprimir un archivo enorme en el navegador congela la
  // pestaña varios segundos antes de fallar igualmente.
  if (archivo.size > MAX_ORIGINAL_BYTES) {
    return { ok: false, error: 'La imagen original supera los 8 MB. Redúcela antes de subirla.' };
  }

  if (!db) return { ok: false, error: 'Sin conexión a Supabase: no se puede autenticar la subida.' };

  const { data: { session } } = await db.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };

  let comprimida;
  try {
    // 512×512 y calidad 0.82: es una foto de perfil, nunca se muestra a más de
    // 200 px. Subir el original multiplicaría por veinte el espacio ocupado.
    //
    // ⚠ Un Blob, NO un DataURL. Esto era un fallo latente: `FormData.append`
    // con una cadena la envía como campo de texto y descarta el nombre de
    // archivo, así que en el servidor `$_FILES['foto']` llegaba vacío y el
    // endpoint respondía «No se recibió ningún archivo válido». No se había
    // manifestado porque ENDPOINT_FOTOS sigue sin configurar.
    comprimida = await comprimirImagenABlob(archivo, 512, 512, 0.82);
  } catch (e) {
    return { ok: false, error: 'No se pudo procesar la imagen: ' + e.message };
  }

  const cuerpo = new FormData();
  cuerpo.append('foto', comprimida, 'perfil.jpg');

  try {
    const respuesta = await fetch(ENDPOINT_FOTOS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },  // sin Content-Type: lo pone FormData con su boundary
      body: cuerpo,
    });

    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      return { ok: false, error: datos.error || `El servidor respondió ${respuesta.status}.` };
    }
    if (!datos.url) return { ok: false, error: 'El servidor no devolvió la URL de la imagen.' };
    return { ok: true, url: datos.url };
  } catch (e) {
    // Causa más probable en la primera instalación: CORS. El navegador no
    // distingue "origen no autorizado" de "servidor caído" — se nombran ambas.
    return {
      ok: false,
      error: 'No se pudo contactar con el servidor de imágenes. ' +
             'Comprueba que el origen de esta página esté en ORIGENES_PERMITIDOS ' +
             'de subir_foto_perfil.php y que el endpoint responda.',
    };
  }
}
