// Store de Offline Queue
// Gestión de cola de operaciones para modo offline-first
// DEMO: Funcionalidad simulada - reemplazar con API real cuando se conecte backend
import { ref, computed } from '../core/vue.js';
import eventBus from '../core/event-bus.js';
import { EVENTOS_OFFLINE } from '../core/eventos-offline.js';

// Estado del store
const colaOperaciones = ref([]);
const estaSincronizando = ref(false);
const ultimaSincronizacion = ref(null);
const erroresSincronizacion = ref([]);

// Tipos de operaciones
const TIPOS_OPERACION = {
  CREAR_DENUNCIA: 'crear_denuncia',
  ACTUALIZAR_INTERVENCION: 'actualizar_intervencion',
  CERRAR_INCIDENTE: 'cerrar_incidente',
  LEVANTAR_DENUNCIA: 'levantar_denuncia',
  SUBIR_FOTO: 'subir_foto',
  ACTUALIZAR_UBICACION: 'actualizar_ubicacion'
};

// Estados de operación
const ESTADO_OPERACION = {
  PENDIENTE: 'pendiente',
  EN_PROCESO: 'en_proceso',
  COMPLETADA: 'completada',
  FALLIDA: 'fallida',
  REINTENTANDO: 'reintentando'
};

// Cargar cola desde localStorage
const cargarCola = () => {
  const guardada = localStorage.getItem('offline_queue');
  if (guardada) {
    colaOperaciones.value = JSON.parse(guardada);
  }
};

// Guardar cola en localStorage
const guardarCola = () => {
  localStorage.setItem('offline_queue', JSON.stringify(colaOperaciones.value));
};

// Agregar operación a la cola
const agregarOperacion = (operacion) => {
  const nuevaOperacion = {
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    tipo: operacion.tipo,
    datos: operacion.datos,
    estado: ESTADO_OPERACION.PENDIENTE,
    intentos: 0,
    maxIntentos: operacion.maxIntentos || 3,
    fechaCreacion: new Date().toISOString(),
    fechaUltimoIntento: null,
    error: null,
    prioridad: operacion.prioridad || 'normal'
  };
  
  colaOperaciones.value.push(nuevaOperacion);
  guardarCola();
  
  eventBus.emit(EVENTOS_OFFLINE.OPERACION_AGREGADA, nuevaOperacion);
  
  return nuevaOperacion;
};

// Marcar operación como en proceso
const marcarEnProceso = (id) => {
  const operacion = colaOperaciones.value.find(op => op.id === id);
  if (operacion) {
    operacion.estado = ESTADO_OPERACION.EN_PROCESO;
    operacion.fechaUltimoIntento = new Date().toISOString();
    operacion.intentos++;
    guardarCola();
  }
};

// Marcar operación como completada
const marcarCompletada = (id) => {
  const index = colaOperaciones.value.findIndex(op => op.id === id);
  if (index !== -1) {
    const operacion = colaOperaciones.value[index];
    operacion.estado = ESTADO_OPERACION.COMPLETADA;
    guardarCola();
    
    // Remover de la cola después de un delay
    setTimeout(() => {
      removerOperacion(id);
    }, 5000);
    
    eventBus.emit(EVENTOS_OFFLINE.OPERACION_COMPLETADA, operacion);
  }
};

// Marcar operación como fallida
const marcarFallida = (id, error) => {
  const operacion = colaOperaciones.value.find(op => op.id === id);
  if (operacion) {
    operacion.estado = ESTADO_OPERACION.FALLIDA;
    operacion.error = error;
    guardarCola();
    
    erroresSincronizacion.value.push({
      operacionId: id,
      error: error,
      fecha: new Date().toISOString()
    });
    
    eventBus.emit(EVENTOS_OFFLINE.OPERACION_FALLIDA, operacion);
  }
};

// Remover operación de la cola
const removerOperacion = (id) => {
  colaOperaciones.value = colaOperaciones.value.filter(op => op.id !== id);
  guardarCola();
};

// Obtener operaciones pendientes
const operacionesPendientes = computed(() => {
  return colaOperaciones.value.filter(op => 
    op.estado === ESTADO_OPERACION.PENDIENTE || 
    op.estado === ESTADO_OPERACION.FALLIDA
  ).sort((a, b) => {
    // Ordenar por prioridad primero
    const prioridadOrden = { alta: 0, normal: 1, baja: 2 };
    if (prioridadOrden[a.prioridad] !== prioridadOrden[b.prioridad]) {
      return prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad];
    }
    // Luego por fecha de creación
    return new Date(a.fechaCreacion) - new Date(b.fechaCreacion);
  });
});

// Obtener operaciones en proceso
const operacionesEnProceso = computed(() => {
  return colaOperaciones.value.filter(op => op.estado === ESTADO_OPERACION.EN_PROCESO);
});

// Contador de operaciones pendientes
const contadorPendientes = computed(() => {
  return operacionesPendientes.value.length;
});

// Procesar una operación (simulado - reemplazar con API real)
const procesarOperacion = async (operacion) => {
  marcarEnProceso(operacion.id);
  
  try {
    // Simular llamada a API
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simular éxito 70% de las veces
        if (Math.random() > 0.3) {
          resolve({ success: true });
        } else {
          reject(new Error('Error de conexión simulado'));
        }
      }, 1000 + Math.random() * 2000);
    });
    
    marcarCompletada(operacion.id);
    return { success: true };
  } catch (error) {
    if (operacion.intentos >= operacion.maxIntentos) {
      marcarFallida(operacion.id, error.message);
    } else {
      // Reintentar con backoff exponencial
      const backoffMs = Math.pow(2, operacion.intentos) * 1000;
      setTimeout(() => {
        procesarOperacion(operacion);
      }, backoffMs);
    }
    return { success: false, error: error.message };
  }
};

// Sincronizar todas las operaciones pendientes
const sincronizar = async () => {
  if (estaSincronizando.value || operacionesPendientes.value.length === 0) {
    return;
  }
  
  estaSincronizando.value = true;
  
  try {
    for (const operacion of operacionesPendientes.value) {
      if (operacion.estado === ESTADO_OPERACION.PENDIENTE || 
          operacion.estado === ESTADO_OPERACION.FALLIDA) {
        await procesarOperacion(operacion);
      }
    }
    
    ultimaSincronizacion.value = new Date().toISOString();
    eventBus.emit(EVENTOS_OFFLINE.SINCRONIZACION_COMPLETADA);
  } catch (error) {
    console.error('Error en sincronización:', error);
    eventBus.emit(EVENTOS_OFFLINE.SINCRONIZACION_ERROR, error);
  } finally {
    estaSincronizando.value = false;
  }
};

// Limpiar cola (eliminar operaciones completadas)
const limpiarCola = () => {
  colaOperaciones.value = colaOperaciones.value.filter(op => 
    op.estado !== ESTADO_OPERACION.COMPLETADA
  );
  guardarCola();
};

// Limpiar errores
const limpiarErrores = () => {
  erroresSincronizacion.value = [];
  localStorage.removeItem('offline_errores');
};

// Reintentar operación específica
const reintentarOperacion = async (id) => {
  const operacion = colaOperaciones.value.find(op => op.id === id);
  if (operacion) {
    operacion.estado = ESTADO_OPERACION.PENDIENTE;
    operacion.error = null;
    guardarCola();
    await procesarOperacion(operacion);
  }
};

// Inicializar
cargarCola();

// Exportar store
export const useOfflineQueue = () => {
  return {
    colaOperaciones,
    operacionesPendientes,
    operacionesEnProceso,
    contadorPendientes,
    estaSincronizando,
    ultimaSincronizacion,
    erroresSincronizacion,
    agregarOperacion,
    marcarEnProceso,
    marcarCompletada,
    marcarFallida,
    removerOperacion,
    procesarOperacion,
    sincronizar,
    limpiarCola,
    limpiarErrores,
    reintentarOperacion,
    TIPOS_OPERACION,
    ESTADO_OPERACION
  };
};
