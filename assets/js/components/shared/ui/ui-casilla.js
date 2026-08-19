// ============================================================
// PRIMITIVA: casilla de verificación
//
// Ocho casillas a mano en el sistema, cada una con su tamaño y ninguna con el
// aspecto de foco del resto de controles. Se apoya en el checkbox NATIVO —el
// teclado, el estado indeterminado y el anuncio al lector de pantalla vienen
// gratis— y `accent-color` lo pinta del azul institucional.
// ============================================================
let contador = 0;

export default {
  props: {
    modelValue:    { type: Boolean, default: false },
    etiqueta:      { type: String, default: '' },
    descripcion:   { type: String, default: '' },
    deshabilitado: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup() {
    const id = `casilla-${++contador}`;
    return { id };
  },
};
