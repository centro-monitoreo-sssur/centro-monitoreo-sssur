// Store de Notificaciones
// Gestión centralizada de alertas y notificaciones del sistema
// DEMO: Funcionalidad simulada - reemplazar con API real cuando se conecte backend
import { ref, computed } from '../core/vue.js';
import eventBus from '../core/event-bus.js';
import { EVENTOS_NOTIFICACIONES } from '../core/eventos.js';

// Estado del store
const notificaciones = ref([]);
const notificacionesNoLeidas = ref(0);
const cargando = ref(false);

// Tipos de notificación
const TIPOS_NOTIFICACION = {
  INFO: 'info',
  EXITO: 'exito',
  ADVERTENCIA: 'advertencia',
  ERROR: 'error',
  EMERGENCIA: 'emergencia'
};

// Prioridades
const PRIORIDADES = {
  BAJA: 'baja',
  MEDIA: 'media',
  ALTA: 'alta',
  CRITICA: 'critica'
};

// Cargar notificaciones desde localStorage (demo)
const cargarNotificaciones = () => {
  const guardadas = localStorage.getItem('notificaciones');
  if (guardadas) {
    notificaciones.value = JSON.parse(guardadas);
    actualizarNoLeidas();
  }
};

// Guardar notificaciones en localStorage (demo)
const guardarNotificaciones = () => {
  localStorage.setItem('notificaciones', JSON.stringify(notificaciones.value));
};

// Actualizar contador de no leídas
const actualizarNoLeidas = () => {
  notificacionesNoLeidas.value = notificaciones.value.filter(n => !n.leida).length;
};

// Agregar notificación
const agregarNotificacion = (notificacion) => {
  const nuevaNotificacion = {
    id: Date.now(),
    titulo: notificacion.titulo || 'Notificación',
    mensaje: notificacion.mensaje || '',
    tipo: notificacion.tipo || TIPOS_NOTIFICACION.INFO,
    prioridad: notificacion.prioridad || PRIORIDADES.MEDIA,
    leida: false,
    fechaCreacion: new Date().toISOString(),
    datos: notificacion.datos || null,
    origen: notificacion.origen || 'sistema',
    distrito: notificacion.distrito || null,
    expiracion: notificacion.expiracion || null
  };
  
  notificaciones.value.unshift(nuevaNotificacion);
  
  // Limitar a 100 notificaciones
  if (notificaciones.value.length > 100) {
    notificaciones.value = notificaciones.value.slice(0, 100);
  }
  
  actualizarNoLeidas();
  guardarNotificaciones();
  
  // Emitir evento al Event Bus
  eventBus.emit(EVENTOS_NOTIFICACIONES.NOTIFICACION_ENVIADA, nuevaNotificacion);
  
  return nuevaNotificacion;
};

// Marcar como leída
const marcarComoLeida = (id) => {
  const notificacion = notificaciones.value.find(n => n.id === id);
  if (notificacion) {
    notificacion.leida = true;
    actualizarNoLeidas();
    guardarNotificaciones();
    
    eventBus.emit(EVENTOS_NOTIFICACIONES.NOTIFICACION_LEIDA, notificacion);
  }
};

// Marcar todas como leídas
const marcarTodasComoLeidas = () => {
  notificaciones.value.forEach(n => n.leida = true);
  actualizarNoLeidas();
  guardarNotificaciones();
};

// Eliminar notificación
const eliminarNotificacion = (id) => {
  notificaciones.value = notificaciones.value.filter(n => n.id !== id);
  actualizarNoLeidas();
  guardarNotificaciones();
};

// Limpiar todas las notificaciones
const limpiarNotificaciones = () => {
  notificaciones.value = [];
  actualizarNoLeidas();
  guardarNotificaciones();
};

// Filtrar notificaciones por tipo
const filtrarPorTipo = (tipo) => {
  return computed(() => notificaciones.value.filter(n => n.tipo === tipo));
};

// Filtrar notificaciones por prioridad
const filtrarPorPrioridad = (prioridad) => {
  return computed(() => notificaciones.value.filter(n => n.prioridad === prioridad));
};

// Filtrar notificaciones por distrito
const filtrarPorDistrito = (distrito) => {
  return computed(() => notificaciones.value.filter(n => n.distrito === distrito || !n.distrito));
};

// Enviar alerta de emergencia
const enviarAlertaEmergencia = (alerta) => {
  return agregarNotificacion({
    titulo: alerta.titulo || '⚠️ ALERTA DE EMERGENCIA',
    mensaje: alerta.mensaje,
    tipo: TIPOS_NOTIFICACION.EMERGENCIA,
    prioridad: PRIORIDADES.CRITICA,
    distrito: alerta.distrito,
    datos: alerta.datos,
    origen: 'admin'
  });
};

// Enviar notificación masiva
const enviarNotificacionMasiva = (config) => {
  const notificacion = agregarNotificacion({
    titulo: config.titulo,
    mensaje: config.mensaje,
    tipo: config.tipo || TIPOS_NOTIFICACION.INFO,
    prioridad: config.prioridad || PRIORIDADES.ALTA,
    distrito: config.distrito, // null = todos los distritos
    datos: config.datas,
    origen: 'admin'
  });
  
  eventBus.emit(EVENTOS_NOTIFICACIONES.NOTIFICACION_MASIVA, notificacion);
  
  return notificacion;
};

// Computed properties
const notificacionesOrdenadas = computed(() => {
  return [...notificaciones.value].sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
});

const notificacionesEmergencia = computed(() => {
  return notificaciones.value.filter(n => n.tipo === TIPOS_NOTIFICACION.EMERGENCIA && !n.leida);
});

// Suscribirse a eventos del Event Bus
const suscribirEventos = () => {
  eventBus.on(EVENTOS_NOTIFICACIONES.NOTIFICACION_ENVIADA, (notificacion) => {
    // Mostrar toast si es de alta prioridad
    if (notificacion.prioridad === PRIORIDADES.ALTA || notificacion.prioridad === PRIORIDADES.CRITICA) {
      // Emitir evento para mostrar toast
      eventBus.emit('ui:toast_mostrado', {
        mensaje: notificacion.mensaje,
        tipo: notificacion.tipo,
        duracion: 6000
      });
    }
  });
};

// Inicializar
cargarNotificaciones();
suscribirEventos();

// Exportar store
export const useNotificaciones = () => {
  return {
    notificaciones,
    notificacionesOrdenadas,
    notificacionesNoLeidas,
    notificacionesEmergencia,
    cargando,
    agregarNotificacion,
    marcarComoLeida,
    marcarTodasComoLeidas,
    eliminarNotificacion,
    limpiarNotificaciones,
    filtrarPorTipo,
    filtrarPorPrioridad,
    filtrarPorDistrito,
    enviarAlertaEmergencia,
    enviarNotificacionMasiva,
    TIPOS_NOTIFICACION,
    PRIORIDADES
  };
};
