// Event Bus para comunicación entre componentes
// Implementación simple usando mitt-like pattern
// DEMO: Funcionalidad simulada - reemplazar con mitt o similar cuando se conecte backend

class EventBus {
  constructor() {
    this.events = {};
    this.loggingEnabled = false;
  }

  // Suscribirse a un evento
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    
    if (this.loggingEnabled) {
      console.log(`[EventBus] Suscrito a evento: ${event}`);
    }
    
    // Retornar función para desuscribirse
    return () => this.off(event, callback);
  }

  // Desuscribirsede un evento
  off(event, callback) {
    if (!this.events[event]) return;
    
    if (callback) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    } else {
      delete this.events[event];
    }
    
    if (this.loggingEnabled) {
      console.log(`[EventBus] Desuscrito de evento: ${event}`);
    }
  }

  // Emitir un evento
  emit(event, data) {
    if (!this.events[event]) {
      if (this.loggingEnabled) {
        console.log(`[EventBus] Evento emitido sin suscriptores: ${event}`, data);
      }
      return;
    }
    
    if (this.loggingEnabled) {
      console.log(`[EventBus] Emitiendo evento: ${event}`, data);
    }
    
    this.events[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[EventBus] Error en callback para evento ${event}:`, error);
      }
    });
  }

  // Emitir evento asíncrono
  async emitAsync(event, data) {
    if (!this.events[event]) {
      if (this.loggingEnabled) {
        console.log(`[EventBus] Evento asíncrono emitido sin suscriptores: ${event}`, data);
      }
      return;
    }
    
    if (this.loggingEnabled) {
      console.log(`[EventBus] Emitiendo evento asíncrono: ${event}`, data);
    }
    
    const promises = this.events[event].map(callback => {
      try {
        return Promise.resolve(callback(data));
      } catch (error) {
        console.error(`[EventBus] Error en callback asíncrono para evento ${event}:`, error);
        return Promise.reject(error);
      }
    });
    
    await Promise.allSettled(promises);
  }

  // Suscribirse una sola vez
  once(event, callback) {
    const onceCallback = (data) => {
      callback(data);
      this.off(event, onceCallback);
    };
    this.on(event, onceCallback);
  }

  // Limpiar todos los eventos
  clear() {
    this.events = {};
    if (this.loggingEnabled) {
      console.log('[EventBus] Todos los eventos limpiados');
    }
  }

  // Habilitar/deshabilitar logging
  setLogging(enabled) {
    this.loggingEnabled = enabled;
  }

  // Obtener lista de eventos con suscriptores
  getEvents() {
    return Object.keys(this.events).reduce((acc, event) => {
      acc[event] = this.events[event].length;
      return acc;
    }, {});
  }
}

// Instancia global del Event Bus
const eventBus = new EventBus();

// Exponer al window para uso global (compatibilidad con código existente)
if (typeof window !== 'undefined') {
  window.eventBus = eventBus;
}

// Exportar para uso modular (ES6)
export default eventBus;
