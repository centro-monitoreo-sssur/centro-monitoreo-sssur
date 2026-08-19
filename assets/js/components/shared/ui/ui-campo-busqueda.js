// ============================================================
// PRIMITIVA: campo de búsqueda
//
// La lupa con retardo. Hoy unas nueve vistas rehacen las dos piezas por su
// cuenta: el icono posicionado a mano en la plantilla y un `debounce` propio
// en cada `.js` —algunos con fuga: el temporizador sobrevive al desmontaje y
// dispara una búsqueda sobre un componente muerto—.
//
// El retardo vive AQUÍ y no en la vista: `update:modelValue` ya sale
// espaciado, así que la vista solo reacciona a su `watch` como con cualquier
// otro v-model. Enter salta el retardo, porque quien pulsa Enter ya terminó
// de escribir.
// ============================================================
import { ref, watch, computed, onUnmounted } from '../../../core/vue.js';

const TAMANOS = {
  md:       'h-11 text-sm',
  // Para barras de filtros densas. 36 px es el mínimo que sigue siendo
  // pulsable en tableta; por debajo ya se apunta con esfuerzo.
  compacto: 'h-9 text-xs',
};

export default {
  props: {
    modelValue: { type: String, default: '' },
    marcador:   { type: String, default: 'Buscar…' },
    retraso:    { type: Number, default: 300 },
    tamano:     { type: String, default: 'md' },
    etiquetaAccesible: { type: String, default: 'Buscar' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const valorLocal = ref(props.modelValue);
    let temporizador = null;

    // El padre puede limpiar el filtro desde fuera (botón «Limpiar filtros»).
    watch(() => props.modelValue, (v) => { valorLocal.value = v; });

    const emitir = (valor) => {
      clearTimeout(temporizador);
      temporizador = null;
      emit('update:modelValue', valor);
    };

    const alEscribir = (evento) => {
      valorLocal.value = evento.target.value;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => emitir(valorLocal.value), props.retraso);
    };

    const alEnter = () => emitir(valorLocal.value);

    const limpiar = () => {
      valorLocal.value = '';
      emitir('');
    };

    // Sin esto, el temporizador dispara una búsqueda sobre un componente que
    // ya no existe. Es la fuga que esta primitiva elimina de cada vista.
    onUnmounted(() => clearTimeout(temporizador));

    const clasesCampo = computed(() => [
      'w-full rounded-lg border border-gray-300 bg-transparent pl-9 shadow-theme-xs transition-colors',
      'text-gray-800 placeholder:text-gray-400 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30',
      'focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-none',
      valorLocal.value ? 'pr-9' : 'pr-3',
      TAMANOS[props.tamano] ?? TAMANOS.md,
    ].join(' '));

    return { valorLocal, alEscribir, alEnter, limpiar, clasesCampo };
  },
};
