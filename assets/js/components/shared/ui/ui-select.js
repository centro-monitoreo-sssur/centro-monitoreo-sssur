// ============================================================
// PRIMITIVA: selector
//
// Acepta las opciones como datos (`opciones`) o como contenido (slot). Los
// catálogos del proyecto no comparten forma —`categorias_caso` usa
// {id, nombre}, `distritos` usa {id, nombre}, los estados son cadenas sueltas—
// así que `claveValor` y `claveEtiqueta` permiten mapear sin transformar el
// array en cada vista.
// ============================================================
import { computed } from '../../../core/vue.js';

let contador = 0;

export default {
  props: {
    modelValue:    { type: [String, Number, null], default: '' },
    etiqueta:      { type: String, default: '' },
    opciones:      { type: Array, default: () => [] },
    claveValor:    { type: String, default: 'id' },
    claveEtiqueta: { type: String, default: 'nombre' },
    // Opción inicial neutra ("Todos los estados"). Cadena vacía = no se muestra.
    textoVacio:    { type: String, default: '' },
    valorVacio:    { type: [String, Number], default: '' },
    ayuda:         { type: String, default: '' },
    error:         { type: String, default: '' },
    requerido:     { type: Boolean, default: false },
    deshabilitado: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const id = `selector-${++contador}`;
    const idAyuda = `${id}-ayuda`;

    // Normaliza tanto [{id, nombre}] como ['recibida', 'en_atencion'].
    const items = computed(() => props.opciones.map((o) =>
      (o !== null && typeof o === 'object')
        ? { valor: o[props.claveValor], texto: o[props.claveEtiqueta] }
        : { valor: o, texto: String(o) }
    ));

    const clasesCampo = computed(() => [
      'w-full px-3 py-2 rounded-xl border text-sm transition-all',
      'bg-gray-50 dark:bg-gray-900 dark:text-white',
      'focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      props.error
        ? 'border-rose-400 focus:ring-rose-500'
        : 'border-gray-200 dark:border-gray-700',
    ].join(' '));

    const alCambiar = (evento) => emit('update:modelValue', evento.target.value);

    return { id, idAyuda, items, clasesCampo, alCambiar };
  },
};
