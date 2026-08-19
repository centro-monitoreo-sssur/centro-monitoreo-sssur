// ============================================================
// PRIMITIVA: control segmentado
//
// El «Hoy | 7 días | 30 días» del tablero y el «Kanban | Lista» de
// intervenciones: tres vistas, tres estilos distintos para el mismo control, y
// ninguno anuncia al teclado que es un grupo de pestañas. Aquí lleva
// `role="tablist"` y flechas izquierda/derecha, que es como se espera navegar
// un segmentado.
//
// El estilo es el del tablero, que Richard ya aprobó: cápsula gris, opción
// activa en blanco con sombra mínima.
// ============================================================
import { computed } from '../../../core/vue.js';

const TAMANOS = {
  // 40 px de alto: el objetivo táctil del sistema.
  md:       'px-4 py-2 text-sm',
  // Para cabeceras de tarjeta densas, como el rango del tablero.
  compacto: 'px-3 py-1.5 text-xs',
};

export default {
  props: {
    // [{ valor, etiqueta, icono? }]
    opciones:   { type: Array, required: true },
    modelValue: { type: [String, Number], required: true },
    tamano:     { type: String, default: 'md' },
    etiquetaAccesible: { type: String, default: 'Opciones' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const claseTamano = computed(() => TAMANOS[props.tamano] ?? TAMANOS.md);

    const elegir = (valor) => emit('update:modelValue', valor);

    // Flechas: mover la selección, no solo el foco. Es el comportamiento de un
    // radio group nativo y el que menos sorprende en un segmentado.
    const alFlecha = (delta) => {
      const i = props.opciones.findIndex((o) => o.valor === props.modelValue);
      if (i === -1) return;
      const destino = (i + delta + props.opciones.length) % props.opciones.length;
      elegir(props.opciones[destino].valor);
    };

    return { claseTamano, elegir, alFlecha };
  },
};
