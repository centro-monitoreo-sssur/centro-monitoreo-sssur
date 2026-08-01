// ============================================================
// STORE: indicadores territoriales por distrito
//
// Lee `public.v_kpis_distrito` (migration_v16). La vista se declara con
// `security_invoker = on`, así que el left join a `casos` aplica la RLS de
// quien consulta: una jefatura distrital recibe las 5 filas, pero con ceros en
// los cuatro distritos que no le corresponden.
//
// Por eso el store EXPONE `distritosDelAmbito`, que descarta esas filas usando
// el alcance real del usuario. Un cero falso en un tablero de mando es peor
// que la ausencia de la fila: invita a concluir que ese distrito no tiene
// incidencias, cuando lo que pasa es que no se pueden ver.
//
// A diferencia de los KPIs que la consola calculaba sobre el array de casos ya
// cargado —limitado a 200 filas—, estos se agregan en la base de datos, así
// que son ciertos sin importar cuántos casos haya.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { usePermisos } from './permisos.js';

const kpisPorDistrito = ref([]);
const cargandoKpis = ref(false);
const errorKpis = ref('');
const actualizadoEn = ref(null);

const CAMPOS_NUMERICOS = [
  'total', 'pendientes', 'en_curso', 'resueltas', 'rechazadas',
  'fuera_de_objetivo', 'criticas_abiertas',
];

// PostgREST serializa `count()` y `numeric` como cadena para no perder
// precisión en JavaScript. Si no se convierten, `a + b` concatena en vez de
// sumar y los totales del tablero salen como "1203" en lugar de 15.
function normalizar(fila) {
  const salida = { ...fila };
  CAMPOS_NUMERICOS.forEach((c) => { salida[c] = Number(fila[c] ?? 0) || 0; });
  salida.horas_promedio_cierre =
    fila.horas_promedio_cierre === null || fila.horas_promedio_cierre === undefined
      ? null
      : Number(fila.horas_promedio_cierre);
  salida.distrito_id = Number(fila.distrito_id);
  return salida;
}

async function cargarKpisDistrito() {
  if (!db) return;
  cargandoKpis.value = true;
  errorKpis.value = '';
  try {
    const { data, error } = await db
      .from('v_kpis_distrito')
      .select('*')
      .order('distrito_nombre');
    if (error) throw error;
    kpisPorDistrito.value = (data || []).map(normalizar);
    actualizadoEn.value = new Date();
    if (!kpisPorDistrito.value.length) {
      console.error(
        '[territorio] `v_kpis_distrito` no devolvió filas. O la tabla ' +
        '`distritos` está vacía o migration_v16 no se aplicó.'
      );
    }
  } catch (e) {
    errorKpis.value = e.message || 'No se pudieron cargar los indicadores por distrito';
    kpisPorDistrito.value = [];
    const faltaLaVista = /relation|does not exist|not find/i.test(e.message || '');
    console.error(
      '[territorio] Falló la carga de v_kpis_distrito: ' + e.message +
      (faltaLaVista ? ' — ¿Está aplicada `migration_v16_alcance_territorial.sql`?' : '')
    );
  } finally {
    cargandoKpis.value = false;
  }
}

export function useTerritorio() {
  const { veTodoElMunicipio, distritosVisibles } = usePermisos();

  // Solo los distritos que el usuario realmente alcanza. Ver la nota de arriba
  // sobre por qué no se muestran los ajenos con cero.
  const distritosDelAmbito = computed(() => {
    if (veTodoElMunicipio.value) return kpisPorDistrito.value;
    const permitidos = distritosVisibles.value.map(Number);
    if (!permitidos.length) return [];
    return kpisPorDistrito.value.filter((k) => permitidos.includes(k.distrito_id));
  });

  // Agregado del ámbito: lo que va en la franja de KPIs de la consola.
  const totalesDelAmbito = computed(() => {
    const base = { total: 0, pendientes: 0, en_curso: 0, resueltas: 0,
                   rechazadas: 0, fuera_de_objetivo: 0, criticas_abiertas: 0 };
    return distritosDelAmbito.value.reduce((acc, d) => {
      CAMPOS_NUMERICOS.forEach((c) => { acc[c] += d[c]; });
      return acc;
    }, base);
  });

  const kpisDeDistrito = (id) =>
    distritosDelAmbito.value.find((k) => k.distrito_id === Number(id)) || null;

  // Semáforo de una tarjeta. Se decide por casos fuera del tiempo objetivo de
  // su prioridad (prioridades.tiempo_objetivo_horas), no por volumen: un
  // distrito con muchas incidencias atendidas a tiempo está sano.
  const semaforo = (kpi) => {
    if (!kpi || !kpi.total) return 'neutro';
    if (kpi.criticas_abiertas > 0) return 'critico';
    const ratio = kpi.fuera_de_objetivo / kpi.total;
    if (ratio >= 0.25) return 'alerta';
    if (ratio > 0) return 'atencion';
    return 'ok';
  };

  return {
    kpisPorDistrito,
    distritosDelAmbito,
    totalesDelAmbito,
    cargandoKpis,
    errorKpis,
    actualizadoEn,
    cargarKpisDistrito,
    kpisDeDistrito,
    semaforo,
  };
}
