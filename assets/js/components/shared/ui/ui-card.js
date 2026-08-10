// ============================================================
// PRIMITIVA: tarjeta
//
// El contenedor que aparece en todas las vistas. Antes cada plantilla repetía
// `bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200
// dark:border-gray-700 p-4` — y no siempre igual: convivían `rounded-lg` y
// `rounded-2xl`, `p-4` y `p-6`, con y sin borde en oscuro.
//
// `shadow-sm` se sustituye por `shadow-card`: la sombra genérica de Tailwind es
// invisible sobre fondo oscuro, así que en modo noche las tarjetas se fundían
// con el fondo y solo las separaba el borde.
// ============================================================
import { computed } from '../../../core/vue.js';

export default {
  props: {
    titulo:     { type: String, default: '' },
    subtitulo:  { type: String, default: '' },
    // Para lienzos de mapa o tablas, que gestionan su propio espaciado.
    sinRelleno: { type: Boolean, default: false },
    // Deja que la tarjeta crezca y su contenido tenga scroll propio dentro de
    // un layout flex. Sin `min-h-0` el contenido desborda el contenedor padre.
    ajustable:  { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const clases = computed(() => [
      'bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card',
      props.ajustable ? 'flex flex-col min-h-0' : '',
    ].join(' '));

    const hayCabecera = computed(() =>
      Boolean(props.titulo || props.subtitulo || slots.acciones)
    );

    return { clases, hayCabecera };
  },
};
