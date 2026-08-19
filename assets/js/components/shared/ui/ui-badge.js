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
  neutro:  'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300',
  info:    'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  exito:   'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500',
  alerta:  'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500',
  peligro: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500',
  marca:   'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
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
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium',
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
