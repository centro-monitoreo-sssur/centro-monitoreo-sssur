// ============================================================
// PRIMITIVA: interruptor
//
// El toggle de Configuración, hoy dibujado a mano con divs que un lector de
// pantalla anuncia como «grupo» sin decir si está encendido. Aquí es un
// `<button role="switch">` con `aria-checked`: se opera con Enter y Espacio
// sin escribir ni una línea de manejo de teclado, porque el botón nativo ya
// lo trae.
// ============================================================
export default {
  props: {
    modelValue:    { type: Boolean, default: false },
    etiqueta:      { type: String, default: '' },
    descripcion:   { type: String, default: '' },
    deshabilitado: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const alternar = () => {
      if (props.deshabilitado) return;
      emit('update:modelValue', !props.modelValue);
    };
    return { alternar };
  },
};
