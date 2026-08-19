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
      // Altura 11 (44 px): el objetivo táctil mínimo cómodo. La consola se
      // opera también desde tabletas, y un campo de 36 px obliga a apuntar.
      'h-11 w-full rounded-lg border bg-transparent text-sm shadow-theme-xs transition-colors',
      'text-gray-800 placeholder:text-gray-400 dark:text-white/90 dark:placeholder:text-white/30',
      // Anillo de 3 px al 10 %: marca el foco sin repintar el borde entero,
      // que es lo que hacía que el campo pareciera en error al enfocarlo.
      'focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-none',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      props.icono ? 'pl-9 pr-3' : 'px-3',
      props.error
        ? 'border-error-500 focus:border-error-500 focus:ring-error-500/10'
        : 'border-gray-300 dark:border-gray-700',
    ].join(' '));

    const alEscribir = (evento) => emit('update:modelValue', evento.target.value);

    return { id, idAyuda, clasesCampo, alEscribir };
  },
};
