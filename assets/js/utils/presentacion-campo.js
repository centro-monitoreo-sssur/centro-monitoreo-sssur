// ============================================================================
// PRESENTACIÓN PARA LAS VISTAS DE CAMPO
//
// Las tres vistas de la PWA —mis intervenciones, detalle y bitácora— tenían
// cada una su propia copia de estos mapas, y las copias ya habían divergido:
// una pintaba "completada" en verde 100 y otra en esmeralda 100, y las tres
// traducían la prioridad con `if (id <= 1) 'alta'` sobre un catálogo donde el
// id 2 ES "Alta" y el 1 es "Crítica". Es decir, mentían.
//
// Los estados NO se mapean aquí: su fuente es `utils/badge.js`, que ya es la
// referencia de todo el sistema y coincide con el flujo sembrado en la v9.
// Aquí solo vive lo que faltaba.
// ============================================================================

// ── Prioridad ───────────────────────────────────────────────────────────────
// Clases Tailwind, no colores del catálogo. `prioridades.color_hex` existe y se
// usa en el mapa, pero Tailwind NO puede generar una clase desde un valor de
// tiempo de ejecución: `bg-[${hex}]` no compila. Para un punto de color en una
// lista, la clase estática es lo correcto; el hex queda para los estilos
// en línea del mapa.
const PUNTO_PRIORIDAD = {
  critica:     'bg-red-600',
  alta:        'bg-orange-500',
  media:       'bg-amber-500',
  baja:        'bg-blue-500',
  informativa: 'bg-gray-400',
};

export const colorPrioridad = (codigo) => PUNTO_PRIORIDAD[codigo] || 'bg-gray-400';

const PILDORA_PRIORIDAD = {
  critica:     'bg-red-50 text-red-700 border-red-100',
  alta:        'bg-orange-50 text-orange-700 border-orange-100',
  media:       'bg-amber-50 text-amber-700 border-amber-100',
  baja:        'bg-blue-50 text-blue-700 border-blue-100',
  informativa: 'bg-gray-50 text-gray-600 border-gray-100',
};

export const pildoraPrioridad = (codigo) =>
  PILDORA_PRIORIDAD[codigo] || 'bg-gray-50 text-gray-600 border-gray-100';

// ── Situación (agrupación de campo) ─────────────────────────────────────────
// Tres valores, no cinco. Es lo que necesita quien está en la calle: si el caso
// sigue abierto o no. El código de estado real viaja aparte y es el que se
// guarda; ver `stores/mis-casos.js`.
const ETIQUETA_SITUACION = {
  pendiente:  'Por atender',
  en_proceso: 'En curso',
  completada: 'Terminada',
};

export const etiquetaSituacion = (s) => ETIQUETA_SITUACION[s] || s;

const COLOR_SITUACION = {
  pendiente:  'bg-red-100 text-red-800',
  en_proceso: 'bg-blue-100 text-blue-800',
  completada: 'bg-emerald-100 text-emerald-800',
};

export const colorSituacion = (s) => COLOR_SITUACION[s] || 'bg-gray-100 text-gray-800';

const ICONO_SITUACION = {
  pendiente:  'fa-clock',
  en_proceso: 'fa-spinner',
  completada: 'fa-circle-check',
};

export const iconoSituacion = (s) => ICONO_SITUACION[s] || 'fa-circle';

// ── Fechas ──────────────────────────────────────────────────────────────────
// Localización 'es-SV'. Estaba puesto 'es-ES', que ordena igual pero abrevia
// los meses en castellano peninsular; da lo mismo para el usuario, pero el
// resto del sistema ya usa es-SV y conviene no tener dos.
export const formatearFecha = (fecha) => {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-SV', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const formatearFechaHora = (fecha) => {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleString('es-SV', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
