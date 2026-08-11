// ============================================================
// STORE: gestión de un caso desde el Centro de Monitoreo
//
// Asignar responsable o cuadrilla y mover el caso por el flujo de su categoría.
// Hasta la v30 esto no existía: la consola veía llegar los casos y no podía
// hacer nada con ellos.
//
// ── POR QUÉ TODO PASA POR RPC ───────────────────────────────────────────────
// No se hace `db.from('casos').update(...)` en ningún punto de este archivo, y
// no es por gusto:
//
//   · El estado destino tiene que pertenecer a `categorias_caso.estados_flujo`.
//     `estado_codigo` es texto libre, no una FK, así que la única forma de que
//     esa regla se cumpla siempre es que la valide el servidor.
//   · El cambio y su entrada en `historial_estados_caso` van en la misma
//     transacción. Partidos en dos peticiones, una caída de red deja un caso
//     que cambió de estado sin constancia de quién lo cambió.
//
// Ver el encabezado de `database/migration_v30_gestion_de_caso.sql`.
// ============================================================
import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';

const guardando = ref(false);
const historial = ref([]);
const cargandoHistorial = ref(false);

/**
 * Traduce el error a algo accionable.
 *
 * Las RPC de la v30 lanzan con SQLSTATE elegidos y mensajes ya redactados para
 * quien opera; se muestran tal cual en lugar de sustituirlos por un genérico,
 * que es justo lo que haría perder la información útil.
 */
function mensajeDeError(e, contexto) {
  const texto = e?.message || '';
  const codigo = e?.code;

  // Mensajes propios de las RPC: 28000 sesión, 42501 permiso, 23514 flujo,
  // 23502 falta un dato, 23503 no existe.
  if (['28000', '42501', '23514', '23502', '23503'].includes(codigo) && texto) {
    return texto;
  }
  if (/function .* does not exist|could not find the function/i.test(texto)) {
    return 'Falta aplicar migration_v30_gestion_de_caso.sql en la base de datos.';
  }
  console.error(`[gestion-casos] ${contexto}:`, e);
  return texto || 'No se pudo completar la operación.';
}

/**
 * Asigna responsable y/o cuadrilla.
 *
 * ⚠ Los dos destinatarios se envían SIEMPRE y de forma explícita: `null`
 * desasigna, no significa «déjalo como estaba». Es el convenio de la RPC y
 * coincide con lo que el panel muestra en pantalla.
 */
async function asignarCaso({ casoId, usuarioId = null, cuadrillaId = null, observacion = null }) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  if (!casoId) return { ok: false, error: 'Falta el caso.' };

  guardando.value = true;
  try {
    const { data, error } = await db.rpc('asignar_caso', {
      p_caso_id: casoId,
      p_usuario_id: usuarioId || null,
      p_cuadrilla_id: cuadrillaId ? Number(cuadrillaId) : null,
      p_observacion: observacion?.trim() || null,
    });
    if (error) throw error;
    return { ok: true, resultado: data };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'asignarCaso') };
  } finally {
    guardando.value = false;
  }
}

/**
 * Mueve el caso a otro estado de su flujo.
 *
 * `resolucion` es obligatoria cuando el estado destino es final, pero la
 * comprobación de verdad la hace el servidor: la validación de aquí solo evita
 * un viaje de ida y vuelta para decir lo mismo.
 */
async function cambiarEstadoCaso({ casoId, estado, observacion = null, resolucion = null }) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  if (!casoId || !estado) return { ok: false, error: 'Falta el caso o el estado destino.' };

  guardando.value = true;
  try {
    const { data, error } = await db.rpc('cambiar_estado_caso', {
      p_caso_id: casoId,
      p_estado_codigo: estado,
      p_observacion: observacion?.trim() || null,
      p_resolucion: resolucion?.trim() || null,
    });
    if (error) throw error;
    return { ok: true, resultado: data };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'cambiarEstadoCaso') };
  } finally {
    guardando.value = false;
  }
}

/**
 * Bitácora del caso, con el nombre de quien hizo cada cambio.
 *
 * Se resuelven los nombres en una segunda consulta en lugar de con un `embed`
 * de PostgREST: `historial_estados_caso` tiene DOS claves foráneas hacia
 * `usuarios` —`cambiado_por_usuario_id` y `superadmin_real_id`—, así que un
 * `usuarios(...)` a secas es ambiguo y PostgREST lo rechaza. Son dos consultas
 * con un `Set` de por medio, no una por fila.
 */
async function cargarHistorial(casoId) {
  if (!db || !casoId) { historial.value = []; return; }
  cargandoHistorial.value = true;
  try {
    const { data, error } = await db
      .from('historial_estados_caso')
      .select('id, estado_codigo_anterior, estado_codigo_nuevo, cambiado_por_usuario_id, observacion, created_at')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const filas = data || [];
    const ids = [...new Set(filas.map((f) => f.cambiado_por_usuario_id).filter(Boolean))];

    let nombres = new Map();
    if (ids.length) {
      const { data: personas } = await db
        .from('usuarios').select('id, nombres, apellidos').in('id', ids);
      nombres = new Map((personas || []).map((p) => [
        p.id, [p.nombres, p.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre',
      ]));
    }

    historial.value = filas.map((f) => ({
      id: f.id,
      anterior: f.estado_codigo_anterior,
      nuevo: f.estado_codigo_nuevo,
      // Sin autor = lo hizo el sistema (por ejemplo la corrección de la v29).
      autor: f.cambiado_por_usuario_id
        ? (nombres.get(f.cambiado_por_usuario_id) || 'Usuario no disponible')
        : 'Sistema',
      observacion: f.observacion || '',
      fecha: f.created_at,
      // Cuando anterior y nuevo coinciden no hubo cambio de estado: es una
      // anotación de asignación. La vista las pinta distinto.
      esCambioDeEstado: f.estado_codigo_anterior !== f.estado_codigo_nuevo,
    }));
  } catch (e) {
    console.error('[gestion-casos] cargarHistorial:', e);
    historial.value = [];
  } finally {
    cargandoHistorial.value = false;
  }
}

export function useGestionCasos() {
  return {
    guardando, historial, cargandoHistorial,
    asignarCaso, cambiarEstadoCaso, cargarHistorial,
  };
}
