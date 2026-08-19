// ============================================================
// PRIMITIVA: cabecera de página
//
// El título de la vista, su descripción y los botones de acción. Se repite en
// once plantillas y ya divergió en lo más visible: `vista-roles` titula con
// `text-title-md` y `vista-bitacora` con `text-2xl font-bold`. Son tamaños
// distintos (24 px con peso 700 frente a 24 px con peso 700 pero otra altura de
// línea) para exactamente la misma cosa, y nadie lo decidió: se copió mal una
// vez y se propagó.
//
// ── EL TÍTULO ES UN <h1>, Y SOLO HAY UNO ────────────────────────────────────
// Hoy conviven vistas que abren en `<h1>` y tarjetas que titulan en `<h2>` sin
// que exista el `<h1>`. Para quien navega con lector de pantalla, el nivel de
// encabezado es el índice de la página. Aquí queda fijado.
//
// ── EN MÓVIL, LAS ACCIONES BAJAN ────────────────────────────────────────────
// TailAdmin resuelve la cabecera con `flex-col` y un escalón a `sm:flex-row`.
// Es lo que evita el título partido en tres líneas junto a un botón estrecho,
// que es como se ve hoy «Reportes y Estadísticas» en un teléfono.
// ============================================================
import { computed } from '../../../core/vue.js';

export default {
  props: {
    titulo:    { type: String, required: true },
    subtitulo: { type: String, default: '' },
    // Migas de pan: array de { etiqueta, id } donde `id` es un destino de
    // navegación opcional. El último elemento nunca es enlace.
    ruta:      { type: Array, default: () => [] },
    // Cabecera pegajosa para vistas con lista larga. No se activa sola: en un
    // tablero de alto fijo robaría espacio sin ganar nada.
    fija:      { type: Boolean, default: false },
  },
  emits: ['navegar'],
  setup(props) {
    const clases = computed(() => [
      'mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
      props.fija ? 'sticky top-0 z-cabecera bg-gray-50/95 py-2 backdrop-blur dark:bg-gray-900/95' : 'shrink-0',
    ].join(' '));

    return { clases };
  },
};
