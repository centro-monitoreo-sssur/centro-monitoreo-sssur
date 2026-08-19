// ============================================================
// PRIMITIVA: contenedor de página
//
// La caja exterior de una vista del panel. Hoy cada plantilla la repite a mano
// y no siempre igual: casi todas abren con `h-full min-h-0 flex flex-col`, pero
// `vista-roles` añade además `max-w-7xl mx-auto w-full` y otras no limitan el
// ancho, así que en un monitor del Centro las mismas tablas se estiran en unas
// pantallas y se centran en otras.
//
// ── POR QUÉ `min-h-0` ESTÁ EN TODAS ─────────────────────────────────────────
// Un hijo flex tiene `min-height: auto` y se niega a encogerse por debajo de su
// contenido. Sin `min-h-0`, una tarjeta con `overflow-hidden` desborda al padre
// y recorta las últimas filas sin dejar barra de desplazamiento. Es el mismo
// fallo que ya está documentado a mano en las cabeceras de `vista-roles`,
// `vista-departamentos` y `vista-catalogo`: tres copias del mismo comentario
// porque no había dónde ponerlo una sola vez.
//
// ── EL RELLENO NO SE PONE AQUÍ ──────────────────────────────────────────────
// Lo pone `<main>` en `app-root.html`. Repetirlo aquí lo duplicaría, que es
// justo el parche que hoy lleva `vista-intervenciones` con `sm:px-0 sm:pt-0`
// para deshacerlo. Una sola fuente de relleno; la Fase 3 la unifica.
// ============================================================
import { computed } from '../../../core/vue.js';

/* Anchos máximos. `completo` es el que necesitan las consolas de mapa y las
   tablas anchas; `lectura` evita líneas de 200 caracteres en un monitor de
   27 pulgadas, que es donde se opera el Centro. */
const ANCHOS = {
  completo: '',
  ancho:    'max-w-screen-2xl mx-auto w-full',
  lectura:  'max-w-7xl mx-auto w-full',
};

export default {
  props: {
    ancho: { type: String, default: 'ancho' },
    // Para vistas que se desplazan enteras en vez de repartir alto entre
    // paneles con scroll propio. `vista-reportes` es el caso: en móvil es una
    // página larga, no un tablero de alto fijo.
    fluido: { type: Boolean, default: false },
    // Página larga en teléfono, tablero de alto fijo desde lg. Es la forma de
    // roles y reportes: en un monitor conviene que cada panel tenga su scroll,
    // pero en un teléfono los paneles apilados se reparten un alto minúsculo
    // y ninguno se puede usar — mejor que la página entera se desplace.
    hibrido: { type: Boolean, default: false },
  },
  setup(props) {
    const clases = computed(() => [
      props.hibrido
        ? 'flex min-h-full flex-col lg:h-full lg:min-h-0'
        : (props.fluido ? 'w-full' : 'h-full min-h-0 flex flex-col'),
      ANCHOS[props.ancho] ?? ANCHOS.ancho,
    ].filter(Boolean).join(' '));

    return { clases };
  },
};
