// ============================================================================
// SERVICIO: alta de casos desde territorio
//
// Único punto del frontend que conoce el contrato de `crear_caso_campo`
// (migration_v18). Antes cada vista armaba su propio `insert` contra `casos`,
// y el que había en la PWA enviaba tres columnas inexistentes y omitía cinco
// obligatorias: ningún reporte de campo llegó nunca a la base.
//
// El navegador manda SOLO lo que de verdad conoce —qué, dónde y una
// descripción—. El distrito, el departamento responsable, la prioridad y el
// estado inicial los deduce la base, que es la única que puede hacerlo bien y
// la única a la que no se le puede mentir.
// ============================================================================
import { db } from '../core/supabase.js';

/**
 * Genera la referencia que hace idempotente el alta.
 *
 * Se crea ANTES del primer intento y se conserva si la operación acaba en el
 * buzón offline. Ese detalle es el que evita el duplicado clásico: se corta la
 * red después de que la base haya insertado pero antes de que llegue la
 * respuesta, el buzón reintenta y —con la misma referencia— la base devuelve el
 * caso que ya existe en vez de crear otro.
 */
export function nuevaReferenciaCliente() {
  return `campo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Errores de infraestructura que conviene traducir. Los de negocio ya vienen
// redactados en español desde la propia función SQL, así que se dejan pasar.
const MENSAJES = {
  // PostgREST no encuentra la función: la migración no está aplicada.
  PGRST202:
    'El servidor no tiene instalada la función de alta en campo. ' +
    'Falta ejecutar database/migration_v18_geografia_y_alta_en_campo.sql.',
  '42501': 'Tu rol no tiene permiso para registrar casos.',
  '28000': 'Tu sesión no es válida. Vuelve a iniciar sesión.',
  '23505': 'Este reporte ya estaba registrado.',
};

function traducirError(error) {
  if (!error) return 'Error desconocido al registrar el reporte.';
  const porCodigo = MENSAJES[error.code];
  if (porCodigo) return porCodigo;

  // `raise exception` de plpgsql llega en `message` ya redactado para el
  // empleado. Solo se sustituye si viene vacío o en inglés de PostgREST.
  const mensaje = (error.message || '').trim();
  if (!mensaje) return 'No se pudo registrar el reporte.';
  if (/^(failed to fetch|networkerror|load failed)/i.test(mensaje)) {
    return 'Sin conexión con el servidor.';
  }
  return mensaje;
}

/**
 * Registra un caso levantado en territorio.
 *
 * @param {object} datos
 * @param {number|string} datos.categoriaId
 * @param {string} datos.descripcion            mínimo 10 caracteres
 * @param {string} datos.direccionReferencia    mínimo 5 caracteres
 * @param {number} [datos.lat]
 * @param {number} [datos.lng]
 * @param {string} [datos.titulo]               por defecto, el nombre de la categoría
 * @param {string} [datos.canal]                por defecto 'pwa_empleado'
 * @param {string} datos.referenciaCliente      de `nuevaReferenciaCliente()`
 * @param {Array}  [datos.adjuntos]             [{ url, nombre, mime, tamano, tipo }]
 * @param {object} [datos.denunciante]          { anonimo, nombre, telefono, ciudadanoId }
 *
 * @returns {Promise<{ok:boolean, caso?:object, mensaje:string, esDeRed:boolean}>}
 *          `esDeRed` distingue "no llegó al servidor" —que debe encolarse— de
 *          "el servidor lo rechazó" —que encolar solo repetiría eternamente—.
 */
export async function registrarCasoEnCampo(datos) {
  if (!db) {
    return { ok: false, mensaje: 'Sin conexión con la base de datos.', esDeRed: true };
  }

  const parametros = {
    p_categoria_id: Number(datos.categoriaId),
    p_descripcion: String(datos.descripcion || '').trim(),
    p_direccion_referencia: String(datos.direccionReferencia || '').trim(),
    // `?? null` y no `|| null`: una coordenada 0 es válida en el ecuador y,
    // aunque aquí nunca se dé, `||` la convertiría en null sin avisar.
    p_lat: datos.lat ?? null,
    p_lng: datos.lng ?? null,
    p_titulo: datos.titulo || null,
    p_canal_codigo: datos.canal || 'pwa_empleado',
    p_referencia_cliente: datos.referenciaCliente || null,
    p_adjuntos: Array.isArray(datos.adjuntos) ? datos.adjuntos : [],

    // Denunciante. Anónimo por defecto, y también si no se recibe nada: el
    // valor seguro es el que NO guarda datos personales.
    //
    // Da igual lo que se mande: el servidor vuelve a normalizarlo y, si va
    // marcado anónimo, descarta nombre y teléfono. Así "anónimo" no depende de
    // que el navegador se acuerde de vaciar los campos.
    p_denunciante_anonimo: datos.denunciante?.anonimo !== false,
    p_denunciante_nombre: datos.denunciante?.nombre || null,
    p_denunciante_telefono: datos.denunciante?.telefono || null,
    p_denunciante_ciudadano_id: datos.denunciante?.ciudadanoId || null,
  };

  try {
    const { data, error } = await db.rpc('crear_caso_campo', parametros);
    if (error) throw error;

    return {
      ok: true,
      caso: data,
      mensaje: data?.mensaje || 'Reporte registrado.',
      esDeRed: false,
    };
  } catch (e) {
    // Sin `code` casi siempre significa que la petición no salió del teléfono
    // (fetch abortado, DNS, avión). Eso SÍ debe encolarse; un rechazo del
    // servidor, no: reintentarlo daría el mismo error hasta agotar la cola.
    const esDeRed = !e.code || /failed to fetch|networkerror|load failed/i.test(e.message || '');
    return { ok: false, mensaje: traducirError(e), esDeRed, codigo: e.code };
  }
}

/**
 * Busca un ciudadano ya registrado por DUI o teléfono.
 *
 * Por DUI o teléfono y NUNCA por nombre: dos vecinos comparten nombre con
 * facilidad y el empleado acabaría vinculando el caso a quien no es. El
 * documento y el número, prácticamente nunca.
 *
 * No encontrar a nadie es el caso NORMAL —la mayoría de quienes paran a un
 * empleado en la calle no tienen cuenta en el portal—, así que se devuelve
 * `{ ok: true, ciudadano: null }` y no un error.
 *
 * @param {string} identificador  DUI (9 dígitos) o teléfono (8), con o sin formato
 */
export async function buscarCiudadano(identificador) {
  if (!db) return { ok: false, ciudadano: null, mensaje: 'Sin conexión.' };

  // Se filtra aquí también para no gastar un viaje de red por cada tecla
  // mientras el empleado todavía va por el cuarto dígito.
  const digitos = String(identificador || '').replace(/\D/g, '');
  const util = digitos.length === 8 || digitos.length === 9 ||
               (digitos.length === 11 && digitos.startsWith('503'));
  if (!util) {
    return { ok: true, ciudadano: null, mensaje: 'Escribe un DUI (9 dígitos) o un teléfono (8).' };
  }

  try {
    const { data, error } = await db.rpc('buscar_ciudadano', { p_identificador: identificador });
    if (error) throw error;

    // La función devuelve un conjunto de filas: cero o una.
    const ciudadano = Array.isArray(data) ? data[0] : data;
    return {
      ok: true,
      ciudadano: ciudadano || null,
      mensaje: ciudadano
        ? `${ciudadano.nombres} ${ciudadano.apellidos}`
        : 'No está registrado en el portal. Puedes anotar sus datos a mano.',
    };
  } catch (e) {
    if (e.code === 'PGRST202') {
      return {
        ok: false, ciudadano: null,
        mensaje: 'Falta ejecutar database/migration_v21_denunciante_y_config.sql.',
      };
    }
    return { ok: false, ciudadano: null, mensaje: e.message || 'No se pudo consultar.' };
  }
}
