// ============================================================
// STORE: dashboard KPIs y analítica del periodo
//
// Dos capas distintas, a propósito:
//
//   1. `kpis` — recuentos EXACTOS de todo el histórico vía `count: 'exact'` con
//      `head: true`. No traen filas: son un número. Sirven para los stocks
//      ("cuántos casos hay pendientes ahora mismo").
//
//   2. `filasAnalitica` — las filas mínimas de una ventana temporal, para poder
//      calcular series, variaciones y agregados por territorio. PostgREST no
//      hace `group by`, así que la agregación ocurre en el cliente; por eso se
//      piden solo las columnas necesarias y se acota la ventana.
//
// Un stock no se compara con un flujo. `pendientes` es una foto del presente y
// NO lleva variación; `nuevos` y `resueltos` sí son flujos del periodo y sí se
// comparan contra el periodo inmediatamente anterior.
// ============================================================
import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';

const kpis = ref({
  total: 0,
  pendientes: 0,
  enCurso: 0,
  resueltas: 0,
  tasaResolucion: 0,
  empleadosActivos: 0,
});
const cargandoKpis = ref(false);

// ── Analítica del periodo ────────────────────────────────────────────────────
const rangoDias = ref(7);
const filasAnalitica = ref([]);
const cargandoAnalitica = ref(false);
// Si la consulta topa el límite, el dashboard estaría mintiendo por omisión: los
// agregados saldrían calculados sobre una muestra parcial sin avisar. La vista
// lo muestra en pantalla.
const analiticaTruncada = ref(false);
const TOPE_FILAS = 5000;

async function cargarKpis() {
  if (!db) return; // sin db los kpis vienen del store de denuncias reactivo
  cargandoKpis.value = true;
  try {
    // Usar count=exact de Supabase para no traer rows completas
    const [resTotal, resPendientes, resEnCurso, resResueltas, resEmpleados] = await Promise.all([
      db.from('casos').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      db.from('casos').select('*', { count: 'exact', head: true })
        .is('deleted_at', null).eq('estado_codigo', 'recibida'),
      db.from('casos').select('*', { count: 'exact', head: true })
        .is('deleted_at', null).eq('estado_codigo', 'en_atencion'),
      db.from('casos').select('*', { count: 'exact', head: true })
        .is('deleted_at', null).in('estado_codigo', ['resuelta', 'cerrada']),
      db.from('usuarios').select('*', { count: 'exact', head: true }).eq('activo', true),
    ]);

    const total    = resTotal.count    || 0;
    const resueltas = resResueltas.count || 0;

    kpis.value = {
      total,
      pendientes:      resPendientes.count  || 0,
      enCurso:         resEnCurso.count     || 0,
      resueltas,
      tasaResolucion:  total > 0 ? Math.round((resueltas / total) * 100) : 0,
      empleadosActivos: resEmpleados.count  || 0,
    };
  } catch (e) {
    console.warn('KPIs: error al consultar Supabase.', e.message);
  } finally {
    cargandoKpis.value = false;
  }
}

/**
 * Trae las filas mínimas de los DOS periodos: el actual y el anterior de la
 * misma duración. Los dos en una sola consulta — pedirlos por separado duplica
 * el viaje de red para partir después el array por una fecha que ya conocemos.
 *
 * @param {number} dias duración del periodo (1, 7 o 30).
 */
async function cargarAnalitica(dias = rangoDias.value) {
  rangoDias.value = dias;
  if (!db) { filasAnalitica.value = []; return; }

  cargandoAnalitica.value = true;
  analiticaTruncada.value = false;
  try {
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    desde.setDate(desde.getDate() - (dias * 2) + 1);

    const { data, error } = await db
      .from('casos')
      // Solo lo que alimenta un agregado. `descripcion`, `titulo` y sobre todo
      // `datos_extra` quedan fuera a propósito: traerlos multiplicaría el peso
      // de la respuesta por cada caso sin aportar nada a las cifras.
      .select('id, created_at, fecha_cierre, estado_codigo, distrito_id, departamento_actual_id, categoria_id, prioridad_id')
      .is('deleted_at', null)
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: true })
      .limit(TOPE_FILAS);

    if (error) throw error;

    filasAnalitica.value = data || [];
    if (filasAnalitica.value.length >= TOPE_FILAS) {
      analiticaTruncada.value = true;
      console.warn(
        `[dashboard] La analítica alcanzó el tope de ${TOPE_FILAS} filas. ` +
        'Las cifras del periodo están calculadas sobre una muestra parcial. ' +
        'Toca mover la agregación a una vista SQL o a una función RPC.'
      );
    }
  } catch (e) {
    // Sin datos de demo a propósito: una cifra inventada en una consola de
    // dirección es peor que un panel vacío, porque nadie la cuestiona.
    filasAnalitica.value = [];
    console.error('[dashboard] Falló la analítica del periodo:', e.message);
  } finally {
    cargandoAnalitica.value = false;
  }
}

export function useDashboard() {
  return {
    kpis, cargandoKpis, cargarKpis,
    rangoDias, filasAnalitica, cargandoAnalitica, analiticaTruncada, cargarAnalitica,
  };
}
