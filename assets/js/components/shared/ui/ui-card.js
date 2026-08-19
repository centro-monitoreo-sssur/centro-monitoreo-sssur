// ============================================================
// PRIMITIVA: tarjeta
//
// El contenedor que aparece en todas las vistas. Antes cada plantilla repetía
// `bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200
// dark:border-gray-700 p-4` — y no siempre igual: convivían `rounded-lg` y
// `rounded-2xl`, `p-4` y `p-6`, con y sin borde en oscuro.
//
// ── AHORA SEPARA POR BORDE, NO POR SOMBRA (TailAdmin) ───────────────────────
// Antes: `shadow-card` sin borde en claro y con borde en oscuro. El problema no
// era la sombra sino la incoherencia: dos tratamientos distintos del mismo
// componente según el tema, y en oscuro la sombra no se ve — de ahí el parche.
//
// TailAdmin resuelve las dos cosas con una regla sola: borde de 1 px siempre, y
// en modo noche el fondo es un blanco al 3 % sobre el lienzo oscuro en vez de un
// gris opaco. Se lee igual en los dos temas y no hace falta el caso especial.
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
      'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]',
      props.ajustable ? 'flex flex-col min-h-0' : '',
    ].join(' '));

    const hayCabecera = computed(() =>
      Boolean(props.titulo || props.subtitulo || slots.acciones)
    );

    return { clases, hayCabecera };
  },
};
