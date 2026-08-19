// ============================================================
// PRIMITIVA: área de texto
//
// El hermano multilínea de `ui-input`, con el mismo contrato: etiqueta ligada
// por `for`, error anunciado con `aria-describedby`, un solo aspecto de foco.
// Sin él ningún formulario migrado puede evitar el marcado a mano: seis
// campos de descripción y motivo lo esperan.
// ============================================================
import { computed } from '../../../core/vue.js';

let contador = 0;

export default {
  props: {
    modelValue:    { type: String, default: '' },
    etiqueta:      { type: String, default: '' },
    marcador:      { type: String, default: '' },
    ayuda:         { type: String, default: '' },
    error:         { type: String, default: '' },
    filas:         { type: Number, default: 4 },
    maximo:        { type: Number, default: 0 },  // 0 = sin contador de caracteres
    requerido:     { type: Boolean, default: false },
    deshabilitado: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const id = `area-${++contador}`;
    const idAyuda = `${id}-ayuda`;

    const clasesCampo = computed(() => [
      'w-full rounded-lg border bg-transparent p-3 text-sm shadow-theme-xs transition-colors',
      'text-gray-800 placeholder:text-gray-400 dark:text-white/90 dark:placeholder:text-white/30',
      'focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-none',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      props.error
        ? 'border-error-500 focus:border-error-500 focus:ring-error-500/10'
        : 'border-gray-300 dark:border-gray-700',
    ].join(' '));

    const restantes = computed(() =>
      props.maximo > 0 ? props.maximo - (props.modelValue?.length ?? 0) : null
    );

    const alEscribir = (evento) => emit('update:modelValue', evento.target.value);

    return { id, idAyuda, clasesCampo, restantes, alEscribir };
  },
};
