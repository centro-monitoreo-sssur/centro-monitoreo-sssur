// ============================================================
// PRIMITIVA: campo de texto
//
// Aporta lo que las copias sueltas de clases nunca traían:
//   · `<label for>` real ligado por id → el clic en la etiqueta enfoca el campo
//     y un lector de pantalla anuncia de qué campo se trata.
//   · `aria-invalid` + `aria-describedby` cuando hay error, para que el mensaje
//     se lea junto al campo en vez de quedar como texto rojo suelto.
//   · Un único aspecto de foco en todo el sistema.
//
// `components.css` ya definía `.form-input`, `.form-label` y `.form-group`, pero
// ninguna plantilla las usaba: 0 coincidencias en `assets/templates/`. Esta
// primitiva las sustituye; el CSS muerto se retira en la fase de limpieza.
// ============================================================
import { computed } from '../../../core/vue.js';

let contador = 0;

export default {
  props: {
    modelValue:    { type: [String, Number], default: '' },
    etiqueta:      { type: String, default: '' },
    tipo:          { type: String, default: 'text' },
    marcador:      { type: String, default: '' },
    icono:         { type: String, default: '' },
    ayuda:         { type: String, default: '' },
    error:         { type: String, default: '' },
    requerido:     { type: Boolean, default: false },
    deshabilitado: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const id = `campo-${++contador}`;
    const idAyuda = `${id}-ayuda`;

    const clasesCampo = computed(() => [
      'w-full py-2 rounded-xl border text-sm transition-all',
      'bg-gray-50 dark:bg-gray-900 dark:text-white',
      'focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      props.icono ? 'pl-9 pr-3' : 'px-3',
      props.error
        ? 'border-rose-400 focus:ring-rose-500 focus:border-rose-500'
        : 'border-gray-200 dark:border-gray-700',
    ].join(' '));

    const alEscribir = (evento) => emit('update:modelValue', evento.target.value);

    return { id, idAyuda, clasesCampo, alEscribir };
  },
};
