// ============================================================
// STORE: las denuncias del ciudadano que tiene la sesión abierta
//
// Cierra el ciclo que la v34 dejó preparado en la base y que el navegador
// nunca llegó a usar: el portal seguía guardando en `localStorage`, así que una
// denuncia ciudadana no llegaba al Centro de Monitoreo y desaparecía al borrar
// los datos del navegador.
//
// ── EL ALTA PASA POR UN RPC, NO POR UN INSERT ───────────────────────────────
// `casos_insert` deniega al ciudadano a propósito. Es lo que obliga a pasar por
// `crear_caso_ciudadano`, donde viven las validaciones que no pueden estar en
// el navegador: el canal forzado, el tope diario, y que la categoría esté
// realmente abierta al público. Con un insert directo, todo eso se saltaría
// desde la consola.
//
// ── LA LECTURA PASA POR UNA VISTA ───────────────────────────────────────────
// `v_mis_denuncias_ciudadano` decide las COLUMNAS —fuera notas internas y el
// nombre del empleado asignado— y la RLS de `casos` decide las FILAS. El
// ciudadano no necesita pedir «solo las mías»: es lo único que puede ver.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const denuncias = ref([]);
const cargando = ref(false);
const enviando = ref(false);
const errorDenuncias = ref('');

const COLUMNAS = `
  id, correlativo, titulo, descripcion, direccion_referencia, estado_codigo,
  categoria_id, categoria_nombre, categoria_icono, categoria_color,
  distrito_id, distrito_nombre, lat, lng,
  denunciante_es_anonimo, resolucion,
  fecha_recibido, fecha_cierre, created_at, updated_at
`;

/** Traduce los errores del RPC a algo que un vecino pueda corregir. */
function traducirError(e) {
  const texto = e?.message || '';

  /* Se registra SIEMPRE, y antes de traducir.
     Varias validaciones del RPC se levantan con errcode 23503 —categoría no
     disponible, canal sin configurar—, y PostgREST convierte ese código en un
     409 Conflict. En la consola eso se ve igual que un choque de clave única y
     no dice cuál de las dos ramas saltó: sin esta línea, diagnosticarlo exige
     adivinar. El mensaje del RPC sí lo dice, así que se imprime. */
  console.warn('[denuncias-ciudadano] RPC rechazado', {
    code: e?.code, message: texto, details: e?.details, hint: e?.hint,
  });

  // El tope diario llega con este código desde `crear_caso_ciudadano`.
  if (e?.code === '54000' || /24 horas/i.test(texto)) return texto;
  // Validaciones de contenido y ubicación: el RPC ya redacta el mensaje
  // pensando en quien lo va a leer, así que se muestra tal cual.
  if (['22023', '23514', '23502', '23503'].includes(e?.code)) return texto;
  if (e?.code === '42501' || e?.code === '28000') return texto;

  if (/function .*crear_caso_ciudadano/i.test(texto)) {
    return 'El registro de denuncias no está habilitado en el servidor.';
  }
  return 'No se pudo registrar la denuncia. Inténtalo de nuevo.';
}

/**
 * Registra una denuncia.
 *
 * @param {object} datos
 * @param {number} datos.categoriaId
 * @param {string} datos.descripcion
 * @param {string} datos.direccionReferencia
 * @param {number} datos.lat
 * @param {number} datos.lng
 * @param {boolean} datos.anonima   Oculta el nombre AL OPERADOR. No es
 *                                  anonimato frente a la institución: ver el
 *                                  encabezado de migration_v34.
 * @param {string} datos.referenciaCliente  Identificador propio para reintentar
 *                                  sin duplicar si el envío se corta.
 * @param {Array}  datos.adjuntos   [{ url, nombre, mime, tamano }]
 */
async function crearDenuncia(datos) {
  if (!db) return { ok: false, error: 'Sin conexión con el servidor.' };

  enviando.value = true;
  errorDenuncias.value = '';
  try {
    const { data, error } = await db.rpc('crear_caso_ciudadano', {
      p_categoria_id: Number(datos.categoriaId),
      p_descripcion: datos.descripcion,
      p_direccion_referencia: datos.direccionReferencia,
      p_lat: datos.lat ?? null,
      p_lng: datos.lng ?? null,
      p_anonima: datos.anonima === true,
      p_titulo: datos.titulo || null,
      p_referencia_cliente: datos.referenciaCliente || null,
      p_adjuntos: datos.adjuntos || [],
    });
    if (error) throw error;

    // El RPC devuelve jsonb; PostgREST lo entrega ya como objeto.
    return {
      ok: true,
      correlativo: data?.correlativo || '',
      duplicado: data?.duplicado === true,
      mensaje: data?.mensaje || 'Denuncia registrada.',
    };
  } catch (e) {
    /* Choque contra el índice único de `referencia_cliente`: significa que esta
       MISMA denuncia ya se registró. La comprobación de idempotencia del RPC
       tiene una ventana —dos envíos simultáneos no ven la inserción del otro—
       y ahí gana el índice, que es como debe ser.

       Se trata como éxito, no como error: el vecino pulsó dos veces y su
       denuncia está registrada. Decirle que falló sería mentirle, y volvería a
       intentarlo. */
    // El nombre de la restricción viaja en `message` y la clave en `details`;
    // se miran los dos porque PostgREST no siempre rellena ambos.
    const detalleUnico = `${e?.message || ''} ${e?.details || ''}`;
    if (e?.code === '23505' && /referencia_cliente/i.test(detalleUnico)) {
      // Deja rastro: en la consola se verá un 409 y conviene que quede dicho
      // que fue absorbido a propósito y no un fallo que se tragó nadie.
      console.info('[denuncias-ciudadano] 409 por referencia repetida: la denuncia ya estaba registrada.');
      return {
        ok: true, duplicado: true, correlativo: '',
        mensaje: 'Esta denuncia ya estaba registrada.',
      };
    }
    const mensaje = traducirError(e);
    errorDenuncias.value = mensaje;
    return { ok: false, error: mensaje };
  } finally {
    enviando.value = false;
  }
}

/** Trae las denuncias del ciudadano, de la más reciente a la más antigua. */
async function cargarMisDenuncias() {
  if (!db) { errorDenuncias.value = 'Sin conexión con el servidor.'; return { ok: false }; }

  cargando.value = true;
  errorDenuncias.value = '';
  try {
    const { data, error } = await db
      .from('v_mis_denuncias_ciudadano')
      .select(COLUMNAS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    denuncias.value = data || [];
    return { ok: true };
  } catch (e) {
    denuncias.value = [];
    // La vista no existe hasta la v34. Sin este aviso el síntoma sería una
    // lista vacía por una relación inexistente, que no se parece a la causa.
    const faltaVista = /v_mis_denuncias_ciudadano/i.test(e.message || '');
    errorDenuncias.value = faltaVista
      ? 'El seguimiento de denuncias no está habilitado en el servidor.'
      : 'No se pudieron cargar tus denuncias.';
    console.error(
      faltaVista
        ? '[denuncias-ciudadano] Falta la v34. Ejecuta database/migration_v34_denuncias_ciudadanas.sql.'
        : '[denuncias-ciudadano] ' + e.message
    );
    return { ok: false };
  } finally {
    cargando.value = false;
  }
}

/** Una denuncia ya cargada, por id. Devuelve null si no está en la lista. */
function denunciaPorId(id) {
  const n = Number(id);
  return denuncias.value.find((d) => d.id === n) || null;
}

/**
 * Genera un identificador para reintentar sin duplicar.
 *
 * Va al `referencia_cliente` del caso, que tiene índice único: si el envío se
 * corta después de que el servidor lo registrara y el vecino vuelve a pulsar,
 * el RPC devuelve el caso existente en vez de crear otro. Es lo que evita tres
 * denuncias del mismo bache por una conexión intermitente.
 */
function nuevaReferencia() {
  const azar = (crypto?.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, '');
  return `pc-${Date.now().toString(36)}-${azar.slice(0, 10)}`;
}

// ── Presentación ────────────────────────────────────────────────────────────

const abiertas = computed(() => denuncias.value.filter((d) => !d.fecha_cierre).length);
const cerradas = computed(() => denuncias.value.filter((d) => d.fecha_cierre).length);

export function useDenunciasCiudadano() {
  return {
    denuncias, cargando, enviando, errorDenuncias,
    abiertas, cerradas,
    crearDenuncia, cargarMisDenuncias, denunciaPorId, nuevaReferencia,
  };
}
