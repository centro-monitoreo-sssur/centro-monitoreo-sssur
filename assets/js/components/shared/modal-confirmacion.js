// Modal de Confirmación Genérico
import { ref } from '../../core/vue.js';

export default {
  props: {
    mostrar: Boolean,
    titulo: {
      type: String,
      default: '¿Estás seguro?'
    },
    mensaje: {
      type: String,
      default: 'Esta acción no se puede deshacer.'
    },
    textoConfirmar: {
      type: String,
      default: 'Confirmar'
    }
  },
  emits: ['cerrar', 'confirmar'],
  setup(props, { emit }) {
    const cerrar = () => {
      emit('cerrar');
    };

    const confirmar = () => {
      emit('confirmar');
    };

    return {
      cerrar,
      confirmar
    };
  }
};
