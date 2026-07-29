// Servicio de detección de conexión
// Monitorea el estado de la conexión a internet
import { ref } from '../core/vue.js';
import eventBus from '../core/event-bus.js';
import { EVENTOS_OFFLINE } from '../core/eventos-offline.js';

const estaOnline = ref(navigator.onLine);
const ultimaConexion = ref(navigator.onLine ? new Date().toISOString() : null);

// Manejadores de eventos de conexión
const handleOnline = () => {
  estaOnline.value = true;
  ultimaConexion.value = new Date().toISOString();
  eventBus.emit(EVENTOS_OFFLINE.MODO_ONLINE);
  eventBus.emit(EVENTOS_OFFLINE.CONEXION_CAMBIO, { online: true });
};

const handleOffline = () => {
  estaOnline.value = false;
  eventBus.emit(EVENTOS_OFFLINE.MODO_OFFLINE);
  eventBus.emit(EVENTOS_OFFLINE.CONEXION_CAMBIO, { online: false });
};

// Inicializar listeners
const inicializarListeners = () => {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
};

// Limpiar listeners
const limpiarListeners = () => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
};

// Verificar conexión (ping a servidor)
const verificarConexion = async () => {
  try {
    // Intentar hacer una petición simple
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    await fetch(window.location.href, { 
      method: 'HEAD',
      cache: 'no-cache',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!estaOnline.value) {
      estaOnline.value = true;
      ultimaConexion.value = new Date().toISOString();
      eventBus.emit(EVENTOS_OFFLINE.MODO_ONLINE);
    }
    
    return true;
  } catch (error) {
    if (estaOnline.value) {
      estaOnline.value = false;
      eventBus.emit(EVENTOS_OFFLINE.MODO_OFFLINE);
    }
    return false;
  }
};

// Inicializar
inicializarListeners();

export const useConexion = () => {
  return {
    estaOnline,
    ultimaConexion,
    verificarConexion,
    inicializarListeners,
    limpiarListeners
  };
};
