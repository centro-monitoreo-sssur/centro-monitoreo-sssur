// ============================================================================
// STORE: los casos del empleado que ha iniciado sesión
//
// Reemplaza a tres implementaciones distintas que convivían en la PWA:
//   · `vista-mis-intervenciones.js` no tocaba la base en absoluto — dos
//     registros inventados en localStorage.
//   · `vista-bitacora-empleado.js` sí consultaba, pero si el empleado no tenía
//     casos caía a cinco ejemplos falsos, indistinguibles de los reales.
//   · `vista-detalle-intervencion.js` leía el caso de un JSON en localStorage,
//     así que mostraba una foto congelada de cuando se pulsó la fila.
//
// Un sistema municipal no puede enseñar datos inventados: alguien toma
// decisiones con ellos. Aquí, sin casos, la lista se ve VACÍA.
//
// Alcance: la RLS decide qué filas llegan. Se pide lo que el empleado necesita
// —lo asignado a él y lo que él mismo reportó— y la base recorta lo demás.
// ============================================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { useCatalogos } from './catalogos.js';
import { useNavegacion } from './navegacion.js';
import { extraerCoordenadas } from './denuncias.js';
import { etiquetaEstado } from '../utils/badge.js';

const casos = ref([]);
const cargando = ref(false);
const errorCarga = ref('');
// Caso abierto en la vista de detalle. En memoria y NO en localStorage: lo que
// se guardaba allí era una copia que envejecía en cuanto alguien cambiaba el
// caso, y la vista de cierre operaba sobre esa copia.
const casoSeleccionado = ref(null);

const {
  nombreDistrito, nombreDeTipo, colorDeTipo,
  codigoPrioridad, nombrePrioridad, colorPrioridad, nivelPrioridad,
  situacionDeEstado, esEstadoFinal, estadoDeCierre,
} = useCatalogos();

// Columnas mínimas. Traer `select('*')` arrastraría `observaciones_internas` y
// `resolucion` a un teléfono que puede perderse; menos columnas es menos
// superficie expuesta y menos bytes por la red móvil.
const COLUMNAS = `
  id, correlativo, titulo, descripcion, estado_codigo,
  categoria_id, distrito_id, prioridad_id,
  direccion_referencia, resolucion, ubicacion,
  usuario_responsable_id, creado_por_usuario_id,
  created_at, fecha_asignado, fecha_cierre
`;

/**
 * Normaliza una fila de `casos` al objeto que consumen las vistas de campo.
 *
 * Conserva SIEMPRE el código de estado real y añade `situacion` —la
 * agrupación de tres valores que entiende alguien en la calle— derivada del
 * flujo de la categoría, no de una tabla escrita a mano.
 */
function normalizar(fila, uid) {
  const situacion = situacionDeEstado(fila.categoria_id, fila.estado_codigo);
  // `casos.ubicacion` es `geography`, y PostgREST la serializa como GeoJSON o
  // como EWKB hexadecimal según versión y cabecera. `extraerCoordenadas`
  // absorbe las dos formas; reimplementarlo aquí sería repetir el fallo que
  // dejó el mapa sin un solo marcador durante meses.
  const { lat, lng } = extraerCoordenadas(fila.ubicacion);
  return {
    lat,
    lng,
    id: fila.id,
    correlativo: fila.correlativo,
    titulo: fila.titulo,
    descripcion: fila.descripcion,

    estado: fila.estado_codigo,                       // código real, el que viaja a la base
    etiquetaEstado: etiquetaEstado(fila.estado_codigo),
    situacion,                                        // 'pendiente' | 'en_proceso' | 'completada'
    esFinal: esEstadoFinal(fila.categoria_id, fila.estado_codigo),

    categoriaId: fila.categoria_id,
    categoria: nombreDeTipo(fila.categoria_id),
    color: colorDeTipo(fila.categoria_id),

    prioridad: codigoPrioridad(fila.prioridad_id) || '',
    etiquetaPrioridad: nombrePrioridad(fila.prioridad_id),
    colorPrioridad: colorPrioridad(fila.prioridad_id),
    nivelPrioridad: nivelPrioridad(fila.prioridad_id),

    distrito: nombreDistrito(fila.distrito_id),
    ubicacion: fila.direccion_referencia,
    resolucion: fila.resolucion,

    fecha: fila.created_at,
    fechaAsignado: fila.fecha_asignado,
    fechaCierre: fila.fecha_cierre,

    esMio: fila.usuario_responsable_id === uid,
    loReporteYo: fila.creado_por_usuario_id === uid,
  };
}

async function cargarMisCasos() {
  const { usuarioId } = useNavegacion();
  const uid = usuarioId.value;

  if (!db || !uid) {
    casos.value = [];
    return;
  }

  cargando.value = true;
  errorCarga.value = '';
  try {
    // `.or()` en una sola consulta y no dos peticiones con unión en cliente:
    // ahorra un viaje de red —caro en datos móviles— y evita tener que
    // deduplicar un caso que uno mismo reportó y que además tiene asignado.
    const { data, error } = await db
      .from('casos')
      .select(COLUMNAS)
      .or(`usuario_responsable_id.eq.${uid},creado_por_usuario_id.eq.${uid}`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;
    casos.value = (data || []).map((f) => normalizar(f, uid));
  } catch (e) {
    // Vaciar y avisar, NUNCA caer a datos de ejemplo. Una lista falsa es
    // indistinguible de una real para quien la mira, y aquí se decide a qué
    // punto del municipio se manda una cuadrilla.
    casos.value = [];
    errorCarga.value = 'No se pudieron cargar tus casos. Revisa la conexión.';
    console.error('[mis-casos] Falló la carga:', e.message);
  } finally {
    cargando.value = false;
  }
}

/** Refresca un único caso tras cerrarlo, sin volver a pedir la lista entera. */
async function refrescarCaso(id) {
  const { usuarioId } = useNavegacion();
  if (!db || !id) return;
  try {
    const { data, error } = await db.from('casos').select(COLUMNAS).eq('id', id).single();
    if (error) throw error;

    const actualizado = normalizar(data, usuarioId.value);
    const i = casos.value.findIndex((c) => c.id === id);
    if (i !== -1) casos.value[i] = actualizado;
    if (casoSeleccionado.value?.id === id) casoSeleccionado.value = actualizado;
  } catch (e) {
    console.warn('[mis-casos] No se pudo refrescar el caso', id, e.message);
  }
}

const seleccionarCaso = (caso) => { casoSeleccionado.value = caso; };

/**
 * Cierra un caso vía el RPC `cerrar_caso_campo` (migration_v20).
 *
 * Se delega en la base porque el cierre son cuatro escrituras —estado, fecha,
 * evidencia e historial— y desde el navegador no hay forma de hacerlas
 * atómicas: si fallara la última, el caso quedaría cerrado sin rastro de quién
 * ni cuándo, que es justo lo que la bitácora existe para impedir.
 *
 * @returns {Promise<{ok:boolean, mensaje:string, esDeRed:boolean, yaCerrado?:boolean}>}
 */
async function cerrarCaso({ casoId, resolucion, observaciones = '', adjuntos = [] }) {
  if (!db) return { ok: false, mensaje: 'Sin conexión con la base de datos.', esDeRed: true };

  try {
    const { data, error } = await db.rpc('cerrar_caso_campo', {
      p_caso_id: casoId,
      p_resolucion: resolucion,
      p_observaciones: observaciones || null,
      // El estado de cierre lo decide la base a partir del flujo de la
      // categoría. Mandarlo desde aquí era lo que fijaba 'resuelta' para todas.
      p_estado_codigo: null,
      p_adjuntos: adjuntos,
    });
    if (error) throw error;

    await refrescarCaso(casoId);
    return {
      ok: true,
      mensaje: data?.mensaje || 'Cierre registrado.',
      yaCerrado: data?.ya_cerrado === true,
      esDeRed: false,
    };
  } catch (e) {
    if (e.code === 'PGRST202') {
      return {
        ok: false,
        esDeRed: false,
        mensaje: 'El servidor no tiene instalada la función de cierre. ' +
                 'Falta ejecutar database/migration_v20_cierre_de_caso_en_campo.sql.',
      };
    }
    // Sin `code` la petición no salió del teléfono: eso sí se puede encolar.
    const esDeRed = !e.code || /failed to fetch|networkerror|load failed/i.test(e.message || '');
    return { ok: false, mensaje: e.message || 'No se pudo registrar el cierre.', esDeRed };
  }
}

// ── Derivados ──────────────────────────────────────────────────────────────

/** Trabajo vivo: lo que el empleado todavía tiene que atender. */
const casosAbiertos = computed(() => casos.value.filter((c) => !c.esFinal));

/**
 * Orden operativo del trabajo pendiente: primero lo más urgente y, a igual
 * urgencia, lo más antiguo sin atender. `nivel` va de 1 (Crítica) a 5, así que
 * se ordena ascendente.
 *
 * O(n log n) por el `sort`, sobre la copia y no sobre `casos.value`: `sort`
 * muta el array, y mutar el origen dentro de un `computed` dispara su propia
 * dependencia — un bucle de recálculo.
 */
const casosPorPrioridad = computed(() =>
  [...casosAbiertos.value].sort(
    (a, b) => a.nivelPrioridad - b.nivelPrioridad || new Date(a.fecha) - new Date(b.fecha)
  )
);

const estadisticas = computed(() => {
  // Un solo recorrido en lugar de tres `filter` encadenados. Con 300 casos da
  // igual, pero es el patrón correcto y no cuesta más escribirlo así.
  const r = { total: casos.value.length, pendientes: 0, enProceso: 0, completadas: 0 };
  for (const c of casos.value) {
    if (c.situacion === 'completada')      r.completadas++;
    else if (c.situacion === 'en_proceso') r.enProceso++;
    else                                   r.pendientes++;
  }
  return r;
});

export function useMisCasos() {
  return {
    casos,
    casosAbiertos,
    casosPorPrioridad,
    estadisticas,
    cargando,
    errorCarga,
    casoSeleccionado,
    cargarMisCasos,
    refrescarCaso,
    seleccionarCaso,
    cerrarCaso,
    estadoDeCierre,
  };
}
