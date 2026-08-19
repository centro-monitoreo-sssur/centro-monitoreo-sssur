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
//
// ── EN MÓVIL ARRANCA PLEGADA (decisión de Richard, 2026-08-19) ──────────────
// En las vistas de gestión el usuario entra a trabajar con los REGISTROS; las
// tarjetas KPI apiladas ocupaban la primera pantalla entera y la lista quedaba
// bajo el pliegue. Por debajo de `lg` la franja es una barra «Indicadores» que
// se despliega a demanda; desde `lg` es la rejilla de siempre y el botón no
// existe. Dashboard y Reportes pasan `:plegable="false"`: ahí los indicadores
// SON el contenido, no un estorbo.
// ============================================================
import { ref, computed } from '../../../core/vue.js';

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
    plegable: { type: Boolean, default: true },
    etiqueta: { type: String, default: 'Indicadores' },
  },
  setup(props) {
    // Cerrada en cada visita, sin memoria: la petición literal fue «solo si el
    // usuario los despliega que se puedan visualizar».
    const abierta = ref(false);

    const clasesRejilla = computed(() => [
      'grid-cols-1 gap-4 md:gap-6',
      COLUMNAS[props.columnas] ?? COLUMNAS[4],
      props.plegable
        ? (abierta.value ? 'grid mt-3 lg:mt-0' : 'hidden lg:grid')
        : 'grid',
    ].join(' '));

    return { abierta, clasesRejilla };
  },
};
