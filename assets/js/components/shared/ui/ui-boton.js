// ============================================================
// PRIMITIVA: botón
//
// Existe porque las mismas 12 clases de Tailwind estaban copiadas literalmente
// en decenas de plantillas. Cada copia derivó por su cuenta: unos con
// `rounded-xl`, otros con `rounded-lg`; unos con `bg-blue-600` —que no es el
// azul de la alcaldía— y otros con el institucional.
//
// El estado `cargando` no es decoración: sin él, cada vista resolvía a mano el
// "no dejes que lo pulse dos veces" y varias no lo resolvían.
// ============================================================
import { computed } from '../../../core/vue.js';

const VARIANTES = {
  primario:   'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 shadow-card disabled:hover:bg-brand-600',
  secundario: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 focus-visible:outline-brand-600 shadow-card',
  peligro:    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 shadow-card disabled:hover:bg-rose-600',
  fantasma:   'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750 focus-visible:outline-brand-600',
};

const TAMANOS = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

export default {
  props: {
    variante:     { type: String, default: 'primario' },
    tamano:       { type: String, default: 'md' },
    icono:        { type: String, default: '' },      // clase Font Awesome
    tipo:         { type: String, default: 'button' },
    cargando:     { type: Boolean, default: false },
    deshabilitado:{ type: Boolean, default: false },
    bloque:       { type: Boolean, default: false },  // ancho completo
    // Los botones de solo ícono son invisibles para un lector de pantalla si no
    // se les da nombre. Es obligatorio cuando no hay texto en el slot.
    etiquetaAccesible: { type: String, default: '' },
  },
  emits: ['click'],
  setup(props, { emit }) {
    const clases = computed(() => [
      'inline-flex items-center justify-center font-semibold rounded-xl transition-colors',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      VARIANTES[props.variante] || VARIANTES.primario,
      TAMANOS[props.tamano] || TAMANOS.md,
      props.bloque ? 'w-full' : '',
    ].join(' '));

    // `cargando` también inhabilita: un botón que muestra spinner pero sigue
    // aceptando clics es exactamente el que genera denuncias duplicadas.
    const inactivo = computed(() => props.deshabilitado || props.cargando);

    const alPulsar = (evento) => {
      if (inactivo.value) return;
      emit('click', evento);
    };

    return { clases, inactivo, alPulsar };
  },
};
