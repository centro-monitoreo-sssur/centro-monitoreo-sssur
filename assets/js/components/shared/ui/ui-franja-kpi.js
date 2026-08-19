// ============================================================
// PRIMITIVA: franja de indicadores
//
// La rejilla que sostiene las tarjetas KPI al inicio de una vista. Hoy hay diez
// franjas escritas a mano con OCHO combinaciones distintas de puntos de
// ruptura: `grid-cols-2 md:grid-cols-4`, `grid-cols-1 sm:grid-cols-3`,
// `sm:grid-cols-2 xl:grid-cols-4`… Cada una se comporta diferente en el mismo
// teléfono, y ninguna lo decidió nadie: son copias que derivaron.
//
// La regla es la de TailAdmin, verificada en su fuente y no deducida de
// capturas: una columna en teléfono, dos desde `sm:` (640), y el total de
// tarjetas solo se despliega desde `xl:`. En un teléfono NUNCA hay dos KPI por
// fila — ese fue el error que Richard corrigió con sus capturas.
// ============================================================
import { computed } from '../../../core/vue.js';

/* Cuántas columnas alcanza la franja en pantalla grande. El arranque
   (1 columna, luego 2 en `sm:`) es fijo a propósito. */
const COLUMNAS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 xl:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
};

export default {
  props: {
    columnas: { type: Number, default: 4 },
  },
  setup(props) {
    const clases = computed(() => [
      'grid grid-cols-1 gap-4 md:gap-6 mb-6 shrink-0',
      COLUMNAS[props.columnas] ?? COLUMNAS[4],
    ].join(' '));

    return { clases };
  },
};
