// Vista: Buzón Offline (Empleados)
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useOfflineQueue } from '../../stores/offline-queue.js';
import { useConexion } from '../../services/conexion.js';
import { EVENTOS_OFFLINE } from '../../core/eventos-offline.js';
import eventBus from '../../core/event-bus.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { 
      operacionesPendientes, 
      operacionesEnProceso,
      contadorPendientes,
      estaSincronizando,
      ultimaSincronizacion,
      erroresSincronizacion,
      sincronizar,
      reintentarOperacion,
      limpiarCola,
      limpiarErrores,
      ESTADO_OPERACION
    } = useOfflineQueue();
    const { estaOnline, verificarConexion } = useConexion();
    
    const mostrarErrores = ref(false);
    
    // Computed para operaciones agrupadas por tipo
    const operacionesPorTipo = computed(() => {
      const agrupadas = {};
      operacionesPendientes.value.forEach(op => {
        if (!agrupadas[op.tipo]) {
          agrupadas[op.tipo] = [];
        }
        agrupadas[op.tipo].push(op);
      });
      return agrupadas;
    });
    
    // Sincronizar manual
    const handleSincronizar = async () => {
      if (!estaOnline.value) {
        await verificarConexion();
        if (!estaOnline.value) {
          alert('No hay conexión a internet');
          return;
        }
      }
      await sincronizar();
    };
    
    // Reintentar operación específica
    const handleReintentar = async (id) => {
      await reintentarOperacion(id);
    };
    
    // Limpiar todo
    const handleLimpiar = () => {
      if (confirm('¿Estás seguro de limpiar la cola de operaciones?')) {
        limpiarCola();
      }
    };
    
    // Formatear fecha
    const formatDate = (fecha) => {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-SV', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    
    // Obtener etiqueta de estado
    const getEstadoLabel = (estado) => {
      const labels = {
        pendiente: 'Pendiente',
        en_proceso: 'Procesando',
        completada: 'Completada',
        fallida: 'Fallida',
        reintentando: 'Reintentando'
      };
      return labels[estado] || estado;
    };
    
    // Obtener clase de estado
    const getEstadoClass = (estado) => {
      const classes = {
        pendiente: 'bg-yellow-100 text-yellow-700',
        en_proceso: 'bg-blue-100 text-blue-700',
        completada: 'bg-green-100 text-green-700',
        fallida: 'bg-red-100 text-red-700',
        reintentando: 'bg-orange-100 text-orange-700'
      };
      return classes[estado] || 'bg-gray-100 text-gray-700';
    };
    
    // Obtener nombre de tipo de operación
    const getTipoLabel = (tipo) => {
      const labels = {
        crear_denuncia: 'Crear Denuncia',
        actualizar_intervencion: 'Actualizar Intervención',
        cerrar_incidente: 'Cerrar Incidente',
        levantar_denuncia: 'Levantar Denuncia',
        subir_foto: 'Subir Foto',
        actualizar_ubicacion: 'Actualizar Ubicación'
      };
      return labels[tipo] || tipo;
    };
    
    // Escuchar eventos de sincronización
    const handleSincronizacionCompletada = () => {
      // Opcional: mostrar notificación
    };
    
    const handleSincronizacionError = (error) => {
      console.error('Error de sincronización:', error);
    };
    
    onMounted(() => {
      eventBus.on(EVENTOS_OFFLINE.SINCRONIZACION_COMPLETADA, handleSincronizacionCompletada);
      eventBus.on(EVENTOS_OFFLINE.SINCRONIZACION_ERROR, handleSincronizacionError);
    });
    
    onUnmounted(() => {
      eventBus.off(EVENTOS_OFFLINE.SINCRONIZACION_COMPLETADA, handleSincronizacionCompletada);
      eventBus.off(EVENTOS_OFFLINE.SINCRONIZACION_ERROR, handleSincronizacionError);
    });
    
    return {
      estaOnline,
      operacionesPendientes,
      operacionesEnProceso,
      contadorPendientes,
      estaSincronizando,
      ultimaSincronizacion,
      erroresSincronizacion,
      mostrarErrores,
      operacionesPorTipo,
      irA,
      handleSincronizar,
      handleReintentar,
      handleLimpiar,
      limpiarErrores,
      formatDate,
      getEstadoLabel,
      getEstadoClass,
      getTipoLabel,
      ESTADO_OPERACION
    };
  }
};
