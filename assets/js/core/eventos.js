// Catálogo de eventos estándar del sistema
// Define todos los eventos que pueden ser emitidos a través del Event Bus

// Eventos de Denuncias
export const EVENTOS_DENUNCIAS = {
  DENUNCIA_CREADA: 'denuncia:creada',
  DENUNCIA_ACTUALIZADA: 'denuncia:actualizada',
  DENUNCIA_ELIMINADA: 'denuncia:eliminada',
  DENUNCIA_DUPLICADA: 'denuncia:duplicada',
  ESTADO_DENUNCIA_CAMBIADO: 'denuncia:estado_cambiado',
  DENUNCIA_ASIGNADA: 'denuncia:asignada',
};

// Eventos de Intervenciones
export const EVENTOS_INTERVENCIONES = {
  INTERVENCION_CREADA: 'intervencion:creada',
  INTERVENCION_ACTUALIZADA: 'intervencion:actualizada',
  INTERVENCION_COMPLETADA: 'intervencion:completada',
  INTERVENCION_CANCELADA: 'intervencion:cancelada',
  INTERVENCION_ASIGNADA: 'intervencion:asignada',
};

// Eventos de Usuarios
export const EVENTOS_USUARIOS = {
  USUARIO_LOGIN: 'usuario:login',
  USUARIO_LOGOUT: 'usuario:logout',
  USUARIO_CREADO: 'usuario:creado',
  USUARIO_ACTUALIZADO: 'usuario:actualizado',
  USUARIO_ELIMINADO: 'usuario:eliminado',
  PERMISOS_CAMBIADOS: 'usuario:permisos_cambiados',
};

// Eventos de Notificaciones
export const EVENTOS_NOTIFICACIONES = {
  NOTIFICACION_ENVIADA: 'notificacion:enviada',
  NOTIFICACION_LEIDA: 'notificacion:leida',
  NOTIFICACION_MASIVA: 'notificacion:masiva',
  ALERTA_EMERGENCIA: 'notificacion:alerta_emergencia',
};

// Eventos de Mapa
export const EVENTOS_MAPA = {
  MAPA_INICIALIZADO: 'mapa:inicializado',
  UBICACION_CAMBIADA: 'mapa:ubicacion_cambiada',
  ZOOM_CAMBIADO: 'mapa:zoom_cambiado',
  CAPA_CAMBIADA: 'mapa:capa_cambiada',
  MARCADOR_SELECCIONADO: 'mapa:marcador_seleccionado',
};

// Eventos de UI
export const EVENTOS_UI = {
  MODAL_ABIERTO: 'ui:modal_abierto',
  MODAL_CERRADO: 'ui:modal_cerrado',
  TOAST_MOSTRADO: 'ui:toast_mostrado',
  TOAST_OCULTO: 'ui:toast_oculto',
  NAVEGACION_CAMBIADA: 'ui:navegacion_cambiada',
};

// Eventos de Sistema
export const EVENTOS_SISTEMA = {
  APLICACION_INICIADA: 'sistema:aplicacion_iniciada',
  CONEXION_CAMBIADA: 'sistema:conexion_cambiada',
  ERROR_OCURRIDO: 'sistema:error_ocurrido',
  DATOS_CARGADOS: 'sistema:datos_cargados',
  DATOS_GUARDADOS: 'sistema:datos_guardados',
};

// Eventos de Offline/Sincronización
export const EVENTOS_OFFLINE = {
  MODO_OFFLINE: 'offline:modo_offline',
  MODO_ONLINE: 'offline:modo_online',
  SINCRONIZACION_INICIADA: 'offline:sincronizacion_iniciada',
  SINCRONIZACION_COMPLETADA: 'offline:sincronizacion_completada',
  SINCRONIZACION_FALLIDA: 'offline:sincronizacion_fallida',
  OPERACION_ENCOLADA: 'offline:operacion_encolada',
};

// Consolidar todos los eventos en un solo objeto
export const EVENTOS = {
  ...EVENTOS_DENUNCIAS,
  ...EVENTOS_INTERVENCIONES,
  ...EVENTOS_USUARIOS,
  ...EVENTOS_NOTIFICACIONES,
  ...EVENTOS_MAPA,
  ...EVENTOS_UI,
  ...EVENTOS_SISTEMA,
  ...EVENTOS_OFFLINE,
};

// Función helper para validar si un evento es válido
export function esEventoValido(evento) {
  return Object.values(EVENTOS).includes(evento);
}

// Función helper para obtener eventos por categoría
export function obtenerEventosPorCategoria(categoria) {
  const categorias = {
    denuncias: EVENTOS_DENUNCIAS,
    intervenciones: EVENTOS_INTERVENCIONES,
    usuarios: EVENTOS_USUARIOS,
    notificaciones: EVENTOS_NOTIFICACIONES,
    mapa: EVENTOS_MAPA,
    ui: EVENTOS_UI,
    sistema: EVENTOS_SISTEMA,
    offline: EVENTOS_OFFLINE,
  };
  
  return categorias[categoria] || {};
}
