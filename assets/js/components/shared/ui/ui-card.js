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
//
// ── FASE 3: EL PATRÓN DE SECCIÓN, LEÍDO DE SU FUENTE ────────────────────────
// Cabecera `px-5 py-4 sm:px-6 sm:py-5` y cuerpo `p-5 sm:p-6` separado con
// `border-t border-gray-100`. Son los valores contados en su repositorio (25 y
// 11 usos de la cabecera; 10 del cuerpo), no deducidos de capturas. El escalón
// `sm:` es EL mecanismo de adaptación de TailAdmin: en teléfono la tarjeta
// cede relleno, no tipografía. Antes usábamos `px-4 pt-4` sin escalón y el
// cuerpo pegado con `pt-3`: separar por borde hace que una tarjeta con
// cabecera se lea como sección incluso cuando el cuerpo arranca con una tabla.
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

    // El borde superior solo existe si hay cabecera que separar; una tarjeta
    // sin título no dibuja una línea suelta bajo su primer pixel.
    const clasesCuerpo = computed(() => [
      hayCabecera.value ? 'border-t border-gray-100 dark:border-gray-800' : '',
      props.sinRelleno ? '' : 'p-5 sm:p-6',
      props.ajustable ? 'flex-1 min-h-0' : '',
    ].filter(Boolean).join(' '));

    return { clases, hayCabecera, clasesCuerpo };
  },
};
