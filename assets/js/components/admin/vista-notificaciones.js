// Vista: Gestión de Notificaciones (Admin)
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useNotificaciones } from '../../stores/notificaciones.js';
import { useCatalogos } from '../../stores/catalogos.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { 
      notificaciones, 
      notificacionesOrdenadas, 
      notificacionesNoLeidas,
      enviarNotificacionMasiva,
      enviarAlertaEmergencia,
      limpiarNotificaciones,
      TIPOS_NOTIFICACION,
      PRIORIDADES
    } = useNotificaciones();
    const { distritos } = useCatalogos();
    
    // Estado del formulario de envío
    const mostrarFormularioEnvio = ref(false);
    const tipoEnvio = ref('masiva'); // 'masiva' o 'emergencia'
    const formulario = ref({
      titulo: '',
      mensaje: '',
      tipo: TIPOS_NOTIFICACION.INFO,
      prioridad: PRIORIDADES.ALTA,
      distrito_id: null, // null = todos los distritos
      datos: null
    });
    
    // Estado de filtros
    const filtroTipo = ref('todos');
    const filtroPrioridad = ref('todos');
    const filtroDistrito = ref('todos');
    
    // Notificaciones filtradas
    const notificacionesFiltradas = computed(() => {
      let lista = notificacionesOrdenadas.value;
      
      if (filtroTipo.value !== 'todos') {
        lista = lista.filter(n => n.tipo === filtroTipo.value);
      }
      
      if (filtroPrioridad.value !== 'todos') {
        lista = lista.filter(n => n.prioridad === filtroPrioridad.value);
      }
      
      if (filtroDistrito.value !== 'todos') {
        lista = lista.filter(n => n.distrito === filtroDistrito.value || !n.distrito);
      }
      
      return lista;
    });
    
    // Estadísticas
    const estadisticas = computed(() => {
      const total = notificaciones.value.length;
      const noLeidas = notificaciones.value.filter(n => !n.leida).length;
      const emergencias = notificaciones.value.filter(n => n.tipo === TIPOS_NOTIFICACION.EMERGENCIA).length;
      const criticas = notificaciones.value.filter(n => n.prioridad === PRIORIDADES.CRITICA).length;
      
      return { total, noLeidas, emergencias, criticas };
    });
    
    // Abrir formulario de envío
    const abrirFormularioEnvio = (tipo) => {
      tipoEnvio.value = tipo;
      mostrarFormularioEnvio.value = true;
      formulario.value = {
        titulo: '',
        mensaje: '',
        tipo: tipo === 'emergencia' ? TIPOS_NOTIFICACION.EMERGENCIA : TIPOS_NOTIFICACION.INFO,
        prioridad: tipo === 'emergencia' ? PRIORIDADES.CRITICA : PRIORIDADES.ALTA,
        distrito_id: null,
        datos: null
      };
    };
    
    // Cerrar formulario
    const cerrarFormulario = () => {
      mostrarFormularioEnvio.value = false;
      formulario.value = {
        titulo: '',
        mensaje: '',
        tipo: TIPOS_NOTIFICACION.INFO,
        prioridad: PRIORIDADES.ALTA,
        distrito_id: null,
        datos: null
      };
    };
    
    // Enviar notificación
    const enviarNotificacion = () => {
      if (!formulario.value.titulo || !formulario.value.mensaje) {
        alert('Por favor completa el título y el mensaje');
        return;
      }
      
      if (tipoEnvio.value === 'emergencia') {
        enviarAlertaEmergencia({
          titulo: formulario.value.titulo,
          mensaje: formulario.value.mensaje,
          distrito: formulario.value.distrito_id,
          datos: formulario.value.datos
        });
      } else {
        enviarNotificacionMasiva({
          titulo: formulario.value.titulo,
          mensaje: formulario.value.mensaje,
          tipo: formulario.value.tipo,
          prioridad: formulario.value.prioridad,
          distrito: formulario.value.distrito_id,
          datos: formulario.value.datos
        });
      }
      
      cerrarFormulario();
    };
    
    // Helpers para UI
    const getTipoIcono = (tipo) => {
      const iconos = {
        info: 'fa-info-circle',
        exito: 'fa-check-circle',
        advertencia: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        emergencia: 'fa-radiation'
      };
      return iconos[tipo] || 'fa-info-circle';
    };
    
    const getTipoColor = (tipo) => {
      const colores = {
        info: 'bg-blue-100 text-blue-700',
        exito: 'bg-green-100 text-green-700',
        advertencia: 'bg-yellow-100 text-yellow-700',
        error: 'bg-red-100 text-red-700',
        emergencia: 'bg-red-900 text-white'
      };
      return colores[tipo] || 'bg-gray-100 text-gray-700';
    };
    
    const getPrioridadColor = (prioridad) => {
      const colores = {
        baja: 'bg-gray-100 text-gray-600',
        media: 'bg-blue-100 text-blue-600',
        alta: 'bg-orange-100 text-orange-600',
        critica: 'bg-red-100 text-red-600'
      };
      return colores[prioridad] || 'bg-gray-100 text-gray-600';
    };
    
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
    
    const getNombreDistrito = (distritoId) => {
      const distrito = distritos.value?.find(d => d.id === distritoId);
      return distrito?.nombre || 'Todos';
    };
    
    return {
      irA,
      notificaciones,
      notificacionesOrdenadas,
      notificacionesFiltradas,
      notificacionesNoLeidas,
      estadisticas,
      mostrarFormularioEnvio,
      tipoEnvio,
      formulario,
      filtroTipo,
      filtroPrioridad,
      filtroDistrito,
      distritos,
      abrirFormularioEnvio,
      cerrarFormulario,
      enviarNotificacion,
      limpiarNotificaciones,
      TIPOS_NOTIFICACION,
      PRIORIDADES,
      getTipoIcono,
      getTipoColor,
      getPrioridadColor,
      formatDate,
      getNombreDistrito
    };
  }
};
