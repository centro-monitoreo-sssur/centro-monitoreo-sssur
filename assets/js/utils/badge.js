// Mapa centralizado de estados de denuncia: etiquetas y clases de badge.
// No duplicar este mapa en cada vista; importar desde aquí.
export const estadosPosibles = ['pendiente', 'en_revision', 'en_obra', 'resuelta', 'rechazada'];

export const etiquetasEstado = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  en_obra: 'En obra',
  resuelta: 'Resuelta',
  rechazada: 'Rechazada',
};

export const etiquetaEstado = (e) => etiquetasEstado[e] || e;

// Solo el color, sin tamaño ni forma. Lo usan las vistas que ya definen su
// propio `px-*`/`text-*` en la plantilla: mezclarlo con `badgeEstado()` deja dos
// utilidades Tailwind en conflicto sobre el mismo elemento y gana la que el CDN
// haya emitido después, que no es determinista.
export const coloresEstado = {
  pendiente:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  en_revision: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  en_obra:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  resuelta:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  rechazada:   'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export const colorEstado = (e) => coloresEstado[e] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

// Badge de estado: función centralizada usada en todas las vistas.
export const badgeEstado = (e) => {
  const base = 'text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ';
  const mapa = {
    pendiente: base + 'bg-red-100 text-red-700',
    en_revision: base + 'bg-blue-100 text-blue-700',
    en_obra: base + 'bg-amber-100 text-amber-700',
    resuelta: base + 'bg-emerald-100 text-emerald-700',
    rechazada: base + 'bg-gray-200 text-gray-600',
  };
  return mapa[e] || base + 'bg-gray-100 text-gray-600';
};
