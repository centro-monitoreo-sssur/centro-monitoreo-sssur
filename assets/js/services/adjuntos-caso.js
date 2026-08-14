// ============================================================
// SERVICIO: las fotografías de un caso
//
// Hasta ahora este camino solo iba de ida. `subir_evidencia.php` guarda la
// imagen en cPanel, las RPC de alta y cierre anotan la referencia en
// `casos_adjuntos`… y NADIE la lee nunca. En todo el proyecto no había una sola
// consulta a esa tabla: ni el Centro de Monitoreo, ni la PWA de campo, ni el
// portal ciudadano. La evidencia se pedía, se comprimía, se subía, se
// almacenaba y no se veía en ninguna pantalla.
//
// Se nota poco porque nada falla: no hay error, no hay hueco, simplemente no
// existe el apartado.
//
// ── DÓNDE VIVEN LAS IMÁGENES ────────────────────────────────────────────────
// En cPanel, no en Supabase Storage. La columna se llama `url_supabase` por
// herencia de cuando el plan era ese; hoy guarda una URL de
// `uploads-monitoreo/evidencias/AAAA/MM/…`. `url_backup` queda para cuando una
// imagen se purga y se conserva copia en otro sitio.
//
// ── PERMISOS ────────────────────────────────────────────────────────────────
// No hace falta filtrar por usuario. Las policies de `casos_adjuntos` (v14) se
// apoyan en la de `casos`:
//
//     exists (select 1 from casos c where c.id = caso_id)
//
// así que cada quien ve exactamente los adjuntos de los casos que ya puede ver
// —incluido el vecino con los suyos, desde que la v34 añadió su rama—. Si un
// caso no es suyo, la consulta devuelve cero filas, no un error.
// ============================================================
import { db } from '../core/supabase.js';

const COLUMNAS = `
  id, caso_id, tipo_archivo, es_evidencia,
  url_supabase, url_backup, nombre_archivo, mime_type, tamano_bytes, created_at
`;

/** Pasa una fila de `casos_adjuntos` a la forma que consume la galería. */
function mapearAdjunto(fila) {
  return {
    id: fila.id,
    casoId: fila.caso_id,
    // `url_backup` es el plan B: si la original se purgó, la copia sigue ahí.
    url: fila.url_supabase || fila.url_backup || '',
    nombre: fila.nombre_archivo || 'evidencia.jpg',
    mime: fila.mime_type || 'image/jpeg',
    tamano: fila.tamano_bytes || 0,
    tipo: fila.tipo_archivo || 'foto',
    /* La distinción que importa a quien mira: la foto del problema al
       reportarlo, o la del trabajo terminado al cerrarlo. Son dos momentos
       distintos del caso y mezclarlas en una sola tira las vuelve ilegibles. */
    esEvidenciaDeCierre: fila.es_evidencia === true,
    fecha: fila.created_at,
  };
}

/**
 * Fotografías de un caso, las de reporte primero y las de cierre después.
 *
 * @param {number|string} casoId
 * @returns {Promise<{ok: boolean, adjuntos: Array, error: string}>}
 */
export async function cargarAdjuntosDeCaso(casoId) {
  const id = Number(casoId);
  if (!db)          return { ok: false, adjuntos: [], error: 'Sin conexión con el servidor.' };
  if (!Number.isFinite(id)) return { ok: true, adjuntos: [], error: '' };

  try {
    const { data, error } = await db
      .from('casos_adjuntos')
      .select(COLUMNAS)
      .eq('caso_id', id)
      .order('es_evidencia', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Una fila sin URL no se puede pintar; se descarta aquí para que la vista
    // no tenga que defenderse de un `src` vacío, que en un `<img>` recarga la
    // página actual.
    const adjuntos = (data || []).map(mapearAdjunto).filter((a) => a.url);
    return { ok: true, adjuntos, error: '' };
  } catch (e) {
    console.error('[adjuntos-caso] No se pudieron leer las fotografías:', e.message);
    return { ok: false, adjuntos: [], error: 'No se pudieron cargar las fotografías.' };
  }
}

/**
 * Cuántas fotografías tiene cada caso de una lista.
 *
 * Una sola consulta con `in (...)` en lugar de una por fila: es lo que permite
 * que una tabla de cien denuncias muestre el distintivo de «tiene foto» sin
 * cien viajes al servidor.
 *
 * @param {Array<number>} casoIds
 * @returns {Promise<Map<number, number>>} id de caso → número de adjuntos
 */
export async function contarAdjuntosPorCaso(casoIds) {
  const ids = [...new Set((casoIds || []).map(Number).filter(Number.isFinite))];
  const conteo = new Map();
  if (!db || !ids.length) return conteo;

  try {
    const { data, error } = await db
      .from('casos_adjuntos')
      .select('caso_id')
      .in('caso_id', ids);
    if (error) throw error;

    for (const fila of data || []) {
      conteo.set(fila.caso_id, (conteo.get(fila.caso_id) || 0) + 1);
    }
    return conteo;
  } catch (e) {
    // Un distintivo que falta no justifica romper la tabla que lo acompaña.
    console.warn('[adjuntos-caso] No se pudo contar las fotografías:', e.message);
    return conteo;
  }
}
