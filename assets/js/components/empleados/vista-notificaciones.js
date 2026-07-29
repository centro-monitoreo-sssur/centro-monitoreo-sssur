// Vista: Notificaciones (Empleados)
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useNotificaciones } from '../../stores/notificaciones.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { 
      notificaciones, 
      contadorNoLeidas,
      marcarComoLeida,
      marcarTodasComoLeidas,
      eliminarNotificacion,
      eliminarTodasLeidas,
      filtrarPorTipo,
      filtrarPorPrioridad
    } = useNotificaciones();
    
    const filtroTipo = ref('todas');
    const filtroPrioridad = ref('todas');
    const mostrarFiltros = ref(false);
    
    // Computed para notificaciones filtradas
    const notificacionesFiltradas = computed(() => {
      let filtradas = notificaciones.value;
      
      if (filtroTipo.value !== 'todas') {
        filtradas = filtrarPorTipo(filtroTipo.value);
      }
      
      if (filtroPrioridad.value !== 'todas') {
        filtradas = filtrarPorPrioridad(filtroPrioridad.value);
      }
      
      return filtradas.sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
    });
    
    // Computed para notificaciones agrupadas por fecha
    const notificacionesPorFecha = computed(() => {
      const agrupadas = {};
      notificacionesFiltradas.value.forEach(notif => {
        const fecha = new Date(notif.fecha_creacion).toLocaleDateString('es-SV', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
        if (!agrupadas[fecha]) {
          agrupadas[fecha] = [];
        }
        agrupadas[fecha].push(notif);
      });
      return agrupadas;
    });
    
    // Marcar como leída al hacer click
    const handleNotificacionClick = (notif) => {
      if (!notif.leida) {
        marcarComoLeida(notif.id);
      }
      // Opcional: navegar a detalle relacionado
      if (notif.metadata && notif.metadata.ruta) {
        irA(notif.metadata.ruta);
      }
    };
    
    // Marcar todas como leídas
    const handleMarcarTodas = () => {
      marcarTodasComoLeidas();
    };
    
    // Eliminar notificación
    const handleEliminar = (id) => {
      if (confirm('¿Eliminar esta notificación?')) {
        eliminarNotificacion(id);
      }
    };
    
    // Eliminar todas las leídas
    const handleEliminarTodasLeidas = () => {
      if (confirm('¿Eliminar todas las notificaciones leídas?')) {
        eliminarTodasLeidas();
      }
    };
    
    // Limpiar filtros
    const handleLimpiarFiltros = () => {
      filtroTipo.value = 'todas';
      filtroPrioridad.value = 'todas';
    };
    
    // Formatear fecha relativa
    const getFechaRelativa = (fecha) => {
      const ahora = new Date();
      const fechaNotif = new Date(fecha);
      const diffMs = ahora - fechaNotif;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHoras = Math.floor(diffMs / 3600000);
      const diffDias = Math.floor(diffMs / 86400000);
      
      if (diffMin < 1) return 'Ahora mismo';
      if (diffMin < 60) return `Hace ${diffMin} min`;
      if (diffHoras < 24) return `Hace ${diffHoras} h`;
      if (diffDias < 7) return `Hace ${diffDias} días`;
      return fechaNotif.toLocaleDateString('es-SV', { day: '2-digit', month: 'short' });
    };
    
    // Obtener icono según tipo
    const getIconoTipo = (tipo) => {
      const iconos = {
        alerta: 'fa-exclamation-triangle',
        informacion: 'fa-info-circle',
        exito: 'fa-check-circle',
        advertencia: 'fa-exclamation-circle',
        emergencia: 'fa-bell',
        sistema: 'fa-cog'
      };
      return iconos[tipo] || 'fa-bell';
    };
    
    // Obtener color según prioridad
    const getColorPrioridad = (prioridad) => {
      const colores = {
        baja: 'text-gray-500 bg-gray-100',
        normal: 'text-blue-500 bg-blue-100',
        alta: 'text-orange-500 bg-orange-100',
        critica: 'text-red-500 bg-red-100',
        emergencia: 'text-red-600 bg-red-200'
      };
      return colores[prioridad] || 'text-gray-500 bg-gray-100';
    };
    
    // Obtener etiqueta de prioridad
    const getEtiquetaPrioridad = (prioridad) => {
      const etiquetas = {
        baja: 'Baja',
        normal: 'Normal',
        alta: 'Alta',
        critica: 'Crítica',
        emergencia: 'Emergencia'
      };
      return etiquetas[prioridad] || prioridad;
    };
    
    return {
      notificaciones,
      notificacionesFiltradas,
      notificacionesPorFecha,
      contadorNoLeidas,
      filtroTipo,
      filtroPrioridad,
      mostrarFiltros,
      irA,
      handleNotificacionClick,
      handleMarcarTodas,
      handleEliminar,
      handleEliminarTodasLeidas,
      handleLimpiarFiltros,
      getFechaRelativa,
      getIconoTipo,
      getColorPrioridad,
      getEtiquetaPrioridad
    };
  }
};
