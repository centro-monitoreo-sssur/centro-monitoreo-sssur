// Componente Toast de Notificaciones
// Sistema de notificaciones tipo toast para mostrar mensajes al usuario
import { ref, onMounted } from '../../core/vue.js';
import eventBus from '../../core/event-bus.js';
import { EVENTOS_UI } from '../../core/eventos.js';

export default {
  setup() {
    const toasts = ref([]);
    let toastIdCounter = 0;

    // Mostrar toast
    const mostrarToast = (mensaje, tipo = 'info', duracion = 4000) => {
      const id = ++toastIdCounter;
      const toast = {
        id,
        mensaje,
        tipo, // 'success', 'error', 'warning', 'info'
        duracion,
        visible: true,
      };

      toasts.value.push(toast);

      // Auto-ocultar después de la duración
      if (duracion > 0) {
        setTimeout(() => {
          ocultarToast(id);
        }, duracion);
      }

      return id;
    };

    // Ocultar toast
    const ocultarToast = (id) => {
      const index = toasts.value.findIndex(t => t.id === id);
      if (index !== -1) {
        toasts.value[index].visible = false;
        // Remover después de la animación
        setTimeout(() => {
          toasts.value = toasts.value.filter(t => t.id !== id);
        }, 300);
      }
    };

    // Obtener icono según tipo
    const getIcono = (tipo) => {
      const iconos = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
      };
      return iconos[tipo] || 'fa-info-circle';
    };

    // Obtener color según tipo
    const getColorClass = (tipo) => {
      const colores = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500',
        info: 'bg-blue-500',
      };
      return colores[tipo] || 'bg-blue-500';
    };

    // Suscribirse a eventos del Event Bus
    onMounted(() => {
      eventBus.on(EVENTOS_UI.TOAST_MOSTRADO, (data) => {
        mostrarToast(data.mensaje, data.tipo, data.duracion);
      });
    });

    return {
      toasts,
      mostrarToast,
      ocultarToast,
      getIcono,
      getColorClass,
    };
  }
};
