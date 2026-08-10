// ============================================================
// PRIMITIVA: badge / etiqueta de estado
//
// Dos modos, y la distinción importa:
//
//   · `tono`  → semántica fija del sistema (éxito, alerta, peligro…).
//   · `color` → un hex que viene de la base de datos (`categorias_caso.color_hex`,
//               `prioridades.color_hex`). No se puede resolver con clases de
//               Tailwind porque el valor solo se conoce en tiempo de ejecución;
//               se aplica con estilo en línea y el fondo se deriva con
//               `color-mix` para no exigir una segunda columna de color tenue.
//
// Este segundo modo es el que evita el error de §11.2 del doc técnico: mapear
// NOMBRES de color cuando los datos traen HEX, y acabar pintándolo todo gris.
// ============================================================
import { computed } from '../../../core/vue.js';

const TONOS = {
  neutro:  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  info:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  exito:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  alerta:  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  peligro: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  marca:   'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200',
  // Sin color propio: la vista pasa sus clases por el atributo `class`. Hace
  // falta porque `utils/badge.js` ya es la fuente única de color por estado, y
  // si además se aplicara un tono los dos juegos de clases competirían por
  // orden de hoja de estilo — con resultado distinto según el navegador.
  ninguno: '',
};

export default {
  props: {
    tono:   { type: String, default: 'neutro' },
    color:  { type: String, default: '' },        // hex de la BD; prevalece sobre `tono`
    icono:  { type: String, default: '' },
    tamano: { type: String, default: 'md' },      // sm | md
    punto:  { type: Boolean, default: false },    // muestra un punto de color al inicio
  },
  setup(props) {
    const clases = computed(() => [
      'inline-flex items-center gap-1.5 font-semibold rounded-full whitespace-nowrap',
      props.tamano === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
      props.color ? '' : (TONOS[props.tono] ?? TONOS.neutro),
    ].join(' '));

    const estilo = computed(() => props.color
      ? {
          color: props.color,
          backgroundColor: `color-mix(in srgb, ${props.color} 14%, transparent)`,
        }
      : null);

    return { clases, estilo };
  },
};
