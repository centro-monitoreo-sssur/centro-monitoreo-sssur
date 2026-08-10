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
  // Solo los devuelve el RPC del período (v27/v28); en `v_kpis_distrito` llegan
  // `undefined` y `normalizar` los deja en 0, que es lo correcto.
  'intervenciones_activas',
];

// Campos que pueden ser NULL con significado propio y NO deben convertirse a 0:
// «sin casos cerrados todavía» no es «cierre en 0 horas», y «sin geometría
// cargada» no es «superficie de 0 km²». Un cero falso en un tablero se lee como
// un dato, no como una ausencia.
const CAMPOS_NULABLES = ['horas_promedio_cierre', 'dias_mas_antiguo', 'area_km2', 'poblacion'];

// PostgREST serializa `count()` y `numeric` como cadena para no perder
// precisión en JavaScript. Si no se convierten, `a + b` concatena en vez de
// sumar y los totales del tablero salen como "1203" en lugar de 15.
function normalizar(fila) {
  const salida = { ...fila };
  CAMPOS_NUMERICOS.forEach((c) => { salida[c] = Number(fila[c] ?? 0) || 0; });
  CAMPOS_NULABLES.forEach((c) => {
    salida[c] = fila[c] === null || fila[c] === undefined ? null : Number(fila[c]);
  });
  salida.distrito_id = Number(fila.distrito_id);
  // `categorias_top` llega como jsonb ya deserializado; se garantiza que sea
  // array para que la vista pueda hacer `v-for` sin comprobar el tipo.
  salida.categorias_top = Array.isArray(fila.categorias_top) ? fila.categorias_top : [];
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

// ── Indicadores acotados a un período ──────────────────────────────────────
//
// Estado propio y NO compartido con `kpisPorDistrito`: son dos preguntas
// distintas y conviven en pantallas distintas. La consola del Mapa en Vivo
// muestra "cómo está el municipio ahora" y el Cartograma "de lo que entró en
// este período, cómo respondimos". Mezclarlos haría que abrir el Cartograma
// con un filtro cambiara los KPIs del Mapa en Vivo.
const kpisPeriodo = ref([]);
// Mismo cálculo sobre el período INMEDIATAMENTE ANTERIOR de igual duración.
// Sin él, un tablero solo dice "hay 34 casos", que no permite saber si vamos
// mejor o peor. Con él dice "34, un 18 % más que el trimestre pasado", que ya
// es una conclusión.
const kpisPeriodoPrevio = ref([]);
const cargandoPeriodo = ref(false);
const errorPeriodo = ref('');

/**
 * Rango inmediatamente anterior, de la misma duración.
 *
 * Solo tiene sentido con las DOS fechas puestas: sin fecha de inicio el
 * período es "todo lo anterior" y no existe un "anterior" comparable de igual
 * tamaño. En ese caso se devuelve null y la interfaz no muestra tendencia, que
 * es preferible a compararse contra un rango inventado.
 */
function rangoPrevio(desde, hasta) {
  if (!desde || !hasta) return null;
  const d1 = new Date(desde + 'T00:00:00');
  const d2 = new Date(hasta + 'T00:00:00');
  if (Number.isNaN(+d1) || Number.isNaN(+d2) || d2 < d1) return null;

  const dias = Math.round((d2 - d1) / 86400000) + 1;   // ambos extremos incluidos
  const finPrevio = new Date(d1);   finPrevio.setDate(finPrevio.getDate() - 1);
  const iniPrevio = new Date(finPrevio); iniPrevio.setDate(iniPrevio.getDate() - dias + 1);

  const aTexto = (f) => f.toISOString().split('T')[0];
  return { desde: aTexto(iniPrevio), hasta: aTexto(finPrevio) };
}

/**
 * Carga los indicadores del período vía el RPC `kpis_distrito_periodo` (v27).
 *
 * Se agrega en la BASE, no en el cliente. Contar sobre `denuncias.value` sería
 * más simple pero mentiría: ese array está limitado a 200 filas, así que en
 * cuanto el municipio pase de 200 casos los totales se quedarían congelados
 * ahí sin que nada lo indique.
 *
 * @param {string} desde  'YYYY-MM-DD' o vacío
 * @param {string} hasta  'YYYY-MM-DD' o vacío
 */
async function cargarKpisPeriodo(desde = '', hasta = '') {
  if (!db) return;
  cargandoPeriodo.value = true;
  errorPeriodo.value = '';

  const previo = rangoPrevio(desde, hasta);
  const consultar = (d, h) => db.rpc('kpis_distrito_periodo', {
    p_desde: d || null, p_hasta: h || null,
  });

  try {
    // Las dos consultas EN PARALELO. Secuenciadas, el tablero tardaría el doble
    // por un dato que es accesorio: la tendencia acompaña a la cifra, no la
    // sustituye.
    const [actual, anterior] = await Promise.all([
      consultar(desde, hasta),
      previo ? consultar(previo.desde, previo.hasta) : Promise.resolve({ data: [] }),
    ]);

    if (actual.error) throw actual.error;
    kpisPeriodo.value = (actual.data || []).map(normalizar);

    // Un fallo en la comparativa NO invalida el dato principal: se pierde la
    // tendencia y se sigue mostrando la cifra.
    if (anterior.error) {
      console.warn('[territorio] Sin período previo comparable:', anterior.error.message);
      kpisPeriodoPrevio.value = [];
    } else {
      kpisPeriodoPrevio.value = (anterior.data || []).map(normalizar);
    }
  } catch (e) {
    kpisPeriodo.value = [];
    kpisPeriodoPrevio.value = [];
    errorPeriodo.value = e.code === 'PGRST202'
      ? 'Falta ejecutar database/migration_v28_perfil_distrito_y_analitica.sql.'
      : (e.message || 'No se pudieron cargar los indicadores del período');
    console.error('[territorio] Falló kpis_distrito_periodo:', errorPeriodo.value);
  } finally {
    cargandoPeriodo.value = false;
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

  // Los del período pasan por el MISMO recorte de ámbito: sin él, una jefatura
  // distrital vería en el Cartograma las filas con cero de los otros cuatro
  // distritos e interpretaría que allí no hay incidencias.
  const periodoDelAmbito = computed(() => {
    if (veTodoElMunicipio.value) return kpisPeriodo.value;
    const permitidos = distritosVisibles.value.map(Number);
    if (!permitidos.length) return [];
    return kpisPeriodo.value.filter((k) => permitidos.includes(k.distrito_id));
  });

  const totalesPeriodo = computed(() => {
    const base = { total: 0, pendientes: 0, en_curso: 0, resueltas: 0,
                   rechazadas: 0, fuera_de_objetivo: 0, criticas_abiertas: 0 };
    return periodoDelAmbito.value.reduce((acc, d) => {
      CAMPOS_NUMERICOS.forEach((c) => { acc[c] += d[c]; });
      return acc;
    }, base);
  });

  const previoDelAmbito = computed(() => {
    if (veTodoElMunicipio.value) return kpisPeriodoPrevio.value;
    const permitidos = distritosVisibles.value.map(Number);
    if (!permitidos.length) return [];
    return kpisPeriodoPrevio.value.filter((k) => permitidos.includes(k.distrito_id));
  });

  const totalesPrevios = computed(() => {
    const base = { total: 0, pendientes: 0, en_curso: 0, resueltas: 0,
                   rechazadas: 0, fuera_de_objetivo: 0, criticas_abiertas: 0,
                   intervenciones_activas: 0 };
    return previoDelAmbito.value.reduce((acc, d) => {
      Object.keys(base).forEach((c) => { acc[c] += d[c] || 0; });
      return acc;
    }, base);
  });

  /** ¿Hay comparativa? Solo con las dos fechas puestas. */
  const hayComparativa = computed(() => previoDelAmbito.value.length > 0);

  /**
   * Variación porcentual frente al período anterior.
   *
   * Devuelve null cuando no hay base con la que comparar. Es deliberado: pasar
   * de 0 a 5 casos no es «+500 %», es «no había nada antes». Un porcentaje
   * inventado sobre una base cero es de los errores que más rápido destruyen la
   * confianza en un tablero.
   */
  const variacion = (actual, anterior) => {
    if (anterior === null || anterior === undefined || anterior === 0) return null;
    return Math.round(((actual - anterior) / anterior) * 100);
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
    // Período (Cartograma)
    kpisPeriodo,
    periodoDelAmbito,
    totalesPeriodo,
    cargandoPeriodo,
    errorPeriodo,
    cargarKpisPeriodo,
    // Comparativa con el período anterior
    previoDelAmbito,
    totalesPrevios,
    hayComparativa,
    variacion,
  };
}
