// Manejo unificado de errores
// Sistema centralizado para gestionar errores de la aplicación
// DEMO: Funcionalidad simulada - reemplazar con sistema de logging real cuando se conecte backend

// Códigos de error estandarizados
export const CODIGOS_ERROR = {
  // Errores de red
  RED_ERROR: 'RED_001',
  RED_TIMEOUT: 'RED_002',
  RED_OFFLINE: 'RED_003',
  
  // Errores de validación
  VALIDACION_CAMPO_REQUERIDO: 'VAL_001',
  VALIDACION_FORMATO_INVALIDO: 'VAL_002',
  VALIDACION_FUERA_RANGO: 'VAL_003',
  VALIDACION_JURISDICCION: 'VAL_004',
  
  // Errores de autenticación
  AUTH_NO_AUTENTICADO: 'AUTH_001',
  AUTH_CREDENCIALES_INVALIDAS: 'AUTH_002',
  AUTH_SESION_EXPIRADA: 'AUTH_003',
  AUTH_PERMISO_DENEGADO: 'AUTH_004',
  
  // Errores de datos
  DATOS_NO_ENCONTRADOS: 'DAT_001',
  DATOS_DUPLICADOS: 'DAT_002',
  DATOS_CORRUPTOS: 'DAT_003',
  DATOS_CONFLICTO: 'DAT_004',
  
  // Errores de geolocalización
  GEO_SIN_PERMISO: 'GEO_001',
  GEO_TIMEOUT: 'GEO_002',
  GEO_POSICION_NO_DISPONIBLE: 'GEO_003',
  
  // Errores de almacenamiento
  ALMACENAMIENTO_LLENO: 'ALM_001',
  ALMACENAMIENTO_NO_DISPONIBLE: 'ALM_002',
  ALMACENAMIENTO_ERROR_ESCRITURA: 'ALM_003',
  
  // Errores generales
  ERROR_DESCONOCIDO: 'GEN_001',
  ERROR_INTERNO: 'GEN_002',
  ERROR_NO_IMPLEMENTADO: 'GEN_003',
};

// Tipos de error
export const TIPOS_ERROR = {
  ERROR: 'error',
  ADVERTENCIA: 'advertencia',
  INFO: 'info',
  EXITO: 'exito',
};

// Niveles de severidad
export const SEVERIDAD = {
  BAJA: 'baja',
  MEDIA: 'media',
  ALTA: 'alta',
  CRITICA: 'critica',
};

// Clase de error personalizada
class AppError extends Error {
  constructor(codigo, mensaje, tipo = TIPOS_ERROR.ERROR, severidad = SEVERIDAD.MEDIA, detalles = null) {
    super(mensaje);
    this.name = 'AppError';
    this.codigo = codigo;
    this.tipo = tipo;
    this.severidad = severidad;
    this.detalles = detalles;
    this.timestamp = new Date().toISOString();
  }
}

// Sistema de logging
class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000; // Máximo de logs a mantener en memoria
    this.loggingEnabled = true;
    this.logToConsole = true;
  }

  // Agregar log
  log(mensaje, nivel = 'info', contexto = {}) {
    if (!this.loggingEnabled) return;

    const logEntry = {
      mensaje,
      nivel,
      contexto,
      timestamp: new Date().toISOString(),
    };

    // Agregar al array de logs
    this.logs.push(logEntry);

    // Limitar tamaño
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Imprimir en consola si está habilitado
    if (this.logToConsole) {
      const consoleMethod = nivel === 'error' ? console.error :
                           nivel === 'warn' ? console.warn :
                           nivel === 'debug' ? console.debug :
                           console.log;
      
      consoleMethod(`[${nivel.toUpperCase()}] ${mensaje}`, contexto);
    }
  }

  // Métodos de conveniencia
  info(mensaje, contexto) {
    this.log(mensaje, 'info', contexto);
  }

  warn(mensaje, contexto) {
    this.log(mensaje, 'warn', contexto);
  }

  error(mensaje, contexto) {
    this.log(mensaje, 'error', contexto);
  }

  debug(mensaje, contexto) {
    this.log(mensaje, 'debug', contexto);
  }

  // Obtener logs
  getLogs(filtro = {}) {
    let logsFiltrados = this.logs;

    if (filtro.nivel) {
      logsFiltrados = logsFiltrados.filter(log => log.nivel === filtro.nivel);
    }

    if (filtro.desde) {
      logsFiltrados = logsFiltrados.filter(log => new Date(log.timestamp) >= new Date(filtro.desde));
    }

    if (filtro.hasta) {
      logsFiltrados = logsFiltrados.filter(log => new Date(log.timestamp) <= new Date(filtro.hasta));
    }

    return logsFiltrados;
  }

  // Limpiar logs
  clearLogs() {
    this.logs = [];
  }

  // Habilitar/deshabilitar logging
  setEnabled(enabled) {
    this.loggingEnabled = enabled;
  }

  // Habilitar/deshabilitar console logging
  setConsoleLogging(enabled) {
    this.logToConsole = enabled;
  }
}

// Instancia global del logger
const logger = new Logger();

// Handler de errores
class ErrorHandler {
  constructor() {
    this.logger = logger;
  }

  // Manejar error
  handleError(error, contexto = {}) {
    // Si es un AppError, usar sus propiedades
    if (error instanceof AppError) {
      this.logger.log(error.mensaje, 'error', {
        codigo: error.codigo,
        tipo: error.tipo,
        severidad: error.severidad,
        detalles: error.detalles,
        ...contexto,
      });
      return error;
    }

    // Si es un Error estándar
    if (error instanceof Error) {
      this.logger.log(error.message, 'error', {
        stack: error.stack,
        ...contexto,
      });
      return new AppError(
        CODIGOS_ERROR.ERROR_DESCONOCIDO,
        error.message,
        TIPOS_ERROR.ERROR,
        SEVERIDAD.MEDIA,
        { stack: error.stack, ...contexto }
      );
    }

    // Si es un string o cualquier otro tipo
    this.logger.log(String(error), 'error', contexto);
    return new AppError(
      CODIGOS_ERROR.ERROR_DESCONOCIDO,
      String(error),
      TIPOS_ERROR.ERROR,
      SEVERIDAD.MEDIA,
      contexto
    );
  }

  // Crear error específico
  crearError(codigo, mensaje, tipo, severidad, detalles) {
    return new AppError(codigo, mensaje, tipo, severidad, detalles);
  }

  // Wrappers para errores comunes
  errorRed(mensaje, detalles) {
    return this.crearError(CODIGOS_ERROR.RED_ERROR, mensaje, TIPOS_ERROR.ERROR, SEVERIDAD.ALTA, detalles);
  }

  errorValidacion(mensaje, detalles) {
    return this.crearError(CODIGOS_ERROR.VALIDACION_CAMPO_REQUERIDO, mensaje, TIPOS_ERROR.ADVERTENCIA, SEVERIDAD.MEDIA, detalles);
  }

  errorAuth(mensaje, detalles) {
    return this.crearError(CODIGOS_ERROR.AUTH_NO_AUTENTICADO, mensaje, TIPOS_ERROR.ERROR, SEVERIDAD.ALTA, detalles);
  }

  errorDatosNoEncontrados(mensaje, detalles) {
    return this.crearError(CODIGOS_ERROR.DATOS_NO_ENCONTRADOS, mensaje, TIPOS_ERROR.ADVERTENCIA, SEVERIDAD.MEDIA, detalles);
  }

  errorGeo(mensaje, detalles) {
    return this.crearError(CODIGOS_ERROR.GEO_SIN_PERMISO, mensaje, TIPOS_ERROR.ADVERTENCIA, SEVERIDAD.MEDIA, detalles);
  }
}

// Instancia global del error handler
const errorHandler = new ErrorHandler();

// Exponer al window para uso global
if (typeof window !== 'undefined') {
  window.logger = logger;
  window.errorHandler = errorHandler;
  window.AppError = AppError;
  window.CODIGOS_ERROR = CODIGOS_ERROR;
  window.TIPOS_ERROR = TIPOS_ERROR;
  window.SEVERIDAD = SEVERIDAD;
}

// Exportar para uso modular (ES6)
export { logger, errorHandler, AppError, CODIGOS_ERROR, TIPOS_ERROR, SEVERIDAD };
