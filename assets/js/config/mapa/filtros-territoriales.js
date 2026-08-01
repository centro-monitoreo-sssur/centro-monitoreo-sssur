// ============================================================
// CONFIGURACIÓN: filtros territoriales y comparativo de distritos
//
// Reúne el vocabulario de filtrado del Mapa en Vivo y la política del tablero
// comparativo. Estaba repartido entre `vista-mapa.js` (ESTADOS_FILTRO, valores
// iniciales de `filtros`) y `tablero-distritos.js` (columnas y orden), de modo
// que la franja de KPIs, el panel de filtros y el comparativo podían quedar
// hablando vocabularios distintos sin que nada lo delatara.
//
// ⚠ Esto NO decide qué distritos ve un usuario. Eso lo resuelve la RLS de
// Postgres (migration_v16) y se consulta vía el store de permisos. Aquí solo
// está la forma del filtro, no su autoridad.
// ============================================================

/**
 * Estados que ofrece el filtro. `en_curso` es un estado AGREGADO
 * (en_revision + en_obra) que no existe en la base: es el que dispara la
 * franja de KPIs, y por eso convive con sus dos componentes.
 */
export const ESTADOS_FILTRO = [
  { v: '',            l: 'Todos',       cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  { v: 'pendiente',   l: 'Pendiente',   cls: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' },
  { v: 'en_curso',    l: 'En curso',    cls: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' },
  { v: 'en_revision', l: 'En revisión', cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
  { v: 'en_obra',     l: 'En obra',     cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
  { v: 'resuelta',    l: 'Resuelta',    cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
];

/** Estados que componen el agregado `en_curso`. */
export const ESTADOS_EN_CURSO = ['en_revision', 'en_obra'];

/** Ventanas temporales rápidas. `dias: 0` = sin recorte. */
export const VENTANAS_TIEMPO = [
  { id: 0,   etiqueta: 'Todo el histórico' },
  { id: 7,   etiqueta: 'Últimos 7 días' },
  { id: 30,  etiqueta: 'Últimos 30 días' },
  { id: 90,  etiqueta: 'Últimos 90 días' },
  { id: 365, etiqueta: 'Último año' },
];

/**
 * Filtros con los que arranca la vista.
 *
 * `distrito` se deja vacío a propósito: lo fija después el store de permisos
 * con `distritoPorDefecto`, que sabe si el usuario ve uno o varios. Escribir
 * aquí un distrito lo pisaría y mostraría a una jefatura el territorio de otra.
 */
export function filtrosIniciales(configMapa = {}) {
  const dias = Number(configMapa.ventanaDiasPorDefecto ?? 0);
  const filtros = {
    distrito: '',
    tipoIncidencia: '',
    estadoIncidencia: configMapa.estadoInicial || '',
    historicoActivo: dias > 0,
    fechaInicio: '',
    fechaFin: '',
  };

  if (dias > 0) {
    const hoy = new Date();
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - dias);
    // `toISOString().slice(0,10)` da YYYY-MM-DD, que es lo que espera <input type="date">.
    filtros.fechaInicio = desde.toISOString().slice(0, 10);
    filtros.fechaFin = hoy.toISOString().slice(0, 10);
  }
  return filtros;
}

/** Columnas ordenables del tablero comparativo de distritos. */
export const COLUMNAS_COMPARATIVO = [
  { clave: 'total',              etiqueta: 'Total',        titulo: 'Casos registrados' },
  { clave: 'pendientes',         etiqueta: 'Pendientes',   titulo: 'Sin asignar todavía' },
  { clave: 'en_curso',           etiqueta: 'En curso',     titulo: 'En revisión o en obra' },
  { clave: 'resueltas',          etiqueta: 'Resueltas',    titulo: 'Cerradas satisfactoriamente' },
  { clave: 'fuera_de_objetivo',  etiqueta: 'Fuera de SLA', titulo: 'Superaron el tiempo objetivo de su prioridad' },
];

/**
 * Política del comparativo.
 *
 * `ordenPorDefecto` es `fuera_de_objetivo` descendente y no `total`: en un
 * centro de monitoreo interesa primero dónde se está incumpliendo el
 * compromiso de atención, no dónde hay más volumen. Un distrito con muchas
 * incidencias atendidas a tiempo está sano.
 */
export function politicaComparativo(configMapa = {}) {
  return {
    ordenPorDefecto: configMapa.ordenComparativo || 'fuera_de_objetivo',
    direccion: 'desc',
    // Abrir el tablero al entrar. Solo aplica a quien ve más de un distrito:
    // a una jefatura distrital no se le ofrece compararse consigo misma.
    autoAbrir: configMapa.autoAbrirComparativo ?? false,
  };
}
