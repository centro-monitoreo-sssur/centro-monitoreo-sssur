// Store de Notificaciones
// Gestión centralizada de alertas y notificaciones del sistema
// DEMO: Funcionalidad simulada - reemplazar con API real cuando se conecte backend
import { ref, computed } from '../core/vue.js';
import eventBus from '../core/event-bus.js';
import { EVENTOS_NOTIFICACIONES } from '../core/eventos.js';
import { db } from '../core/supabase.js';

// Estado del store
const notificaciones = ref([]);
const notificacionesNoLeidas = ref(0);
const cargando = ref(false);
const errorNotificaciones = ref('');

/**
 * Traduce el error de Postgres a algo accionable. La policy de v5
 * (`notificaciones_admin_all`) solo admite `admin` y `superadmin`: cualquier
 * otro rol recibe 42501 en escritura y cero filas en lectura.
 */
const mensajeDeError = (e) => {
  const codigo = e?.code;
  const texto = e?.message || '';
  if (codigo === '42501' || /row-level security/i.test(texto)) {
    return 'Tu rol no tiene permiso sobre las notificaciones. La gestión está ' +
           'reservada a administradores.';
  }
  if (codigo === '23503') return 'La notificación hace referencia a un usuario que ya no existe.';
  return texto || 'Error desconocido.';
};

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


// Cargar notificaciones desde DB (con fallback local)
const cargarNotificaciones = async () => {
  cargando.value = true;
  errorNotificaciones.value = '';
  try {
    if (db) {
      const { data, error } = await db.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      if (data) {
        notificaciones.value = data.map(n => ({
          id: n.id, titulo: n.titulo, mensaje: n.mensaje,
          tipo: n.tipo, prioridad: n.prioridad, leida: n.leida,
          datos: n.datos, origen: n.origen,
          fechaCreacion: n.created_at
        }));
        actualizarNoLeidas();
        cargando.value = false;
        return;
      }
    }
  } catch (e) {
    // Con la policy de v5, un rol que no sea admin recibe cero filas en lugar
    // de un error. Se distingue el fallo real para poder decirlo en pantalla.
    errorNotificaciones.value = mensajeDeError(e);
    console.warn('[notificaciones] Usando la copia local:', e.message);
  }
  const guardadas = localStorage.getItem('notificaciones');
  if (guardadas) {
    notificaciones.value = JSON.parse(guardadas);
    actualizarNoLeidas();
  }
  cargando.value = false;
};

// ── Realtime ────────────────────────────────────────────────────────────────
// `migration_v5` añade la tabla a la publicación `supabase_realtime`, pero
// nadie se suscribía: una alerta emitida desde otro puesto no aparecía hasta
// recargar. En un centro de monitoreo eso vacía de sentido la palabra "alerta".
let canalNotificaciones = null;

const suscribirRealtime = () => {
  if (!db || canalNotificaciones) return;
  canalNotificaciones = db
    .channel('notificaciones-live')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notificaciones' },
      () => cargarNotificaciones())
    .subscribe();
};

const desuscribirRealtime = () => {
  if (!db || !canalNotificaciones) return;
  db.removeChannel(canalNotificaciones);
  canalNotificaciones = null;
};

// Guardar notificaciones (solo local, DB se maneja por evento insert)
const guardarNotificaciones = () => {
  localStorage.setItem('notificaciones', JSON.stringify(notificaciones.value));
};

// Actualizar contador de no leídas
const actualizarNoLeidas = () => {
  notificacionesNoLeidas.value = notificaciones.value.filter(n => !n.leida).length;
};

const agregarNotificacion = async (notificacion) => {
  const nuevaNotificacion = {
    titulo: notificacion.titulo || 'Notificación',
    mensaje: notificacion.mensaje || '',
    tipo: notificacion.tipo || TIPOS_NOTIFICACION.INFO,
    prioridad: notificacion.prioridad || PRIORIDADES.MEDIA,
    leida: false,
    datos: notificacion.datos || null,
    origen: notificacion.origen || 'sistema'
  };

  try {
    if (db) {
      const { data, error } = await db.from('notificaciones').insert([nuevaNotificacion]).select().single();
      if (!error && data) {
        notificaciones.value.unshift({
          id: data.id, titulo: data.titulo, mensaje: data.mensaje,
          tipo: data.tipo, prioridad: data.prioridad, leida: data.leida,
          datos: data.datos, origen: data.origen, fechaCreacion: data.created_at,
          distrito: data.distrito, expiracion: data.expiracion
        });
        actualizarNoLeidas();
        guardarNotificaciones();
        eventBus.emit(EVENTOS_NOTIFICACIONES.NOTIFICACION_ENVIADA, notificaciones.value[0]);
        return notificaciones.value[0];
      }
    }
  } catch (e) {
    console.error('Error insertando notificacion en DB', e);
  }

  // Fallback local
  const localNotificacion = {
    ...nuevaNotificacion,
    id: Date.now(),
    fechaCreacion: new Date().toISOString()
  };
  
  notificaciones.value.unshift(localNotificacion);
  
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
const marcarComoLeida = async (id) => {
  const notificacion = notificaciones.value.find(n => n.id === id);
  if (!notificacion) return { ok: false, error: 'La notificación ya no está en la lista.' };
  if (notificacion.leida) return { ok: true };

  notificacion.leida = true;
  actualizarNoLeidas();
  guardarNotificaciones();

  try {
    if (db) {
      const { error } = await db.from('notificaciones').update({ leida: true }).eq('id', id);
      if (error) throw error;
    }
    eventBus.emit(EVENTOS_NOTIFICACIONES.NOTIFICACION_LEIDA, notificacion);
    return { ok: true };
  } catch (e) {
    // Antes el catch estaba vacío: si la RLS rechazaba la escritura, la lista
    // se veía marcada como leída y al recargar volvía a aparecer sin leer. Se
    // revierte el cambio local para que la pantalla no mienta.
    notificacion.leida = false;
    actualizarNoLeidas();
    guardarNotificaciones();
    console.error('[notificaciones] No se pudo marcar como leída:', e.message);
    return { ok: false, error: mensajeDeError(e) };
  }
};

// Marcar todas como leídas
const marcarTodasComoLeidas = async () => {
  const pendientes = notificaciones.value.filter(n => !n.leida).map(n => n.id);
  if (!pendientes.length) return { ok: true };

  const previas = notificaciones.value.map(n => n.leida);
  notificaciones.value.forEach(n => { n.leida = true; });
  actualizarNoLeidas();
  guardarNotificaciones();

  try {
    if (db) {
      // Esta función NO tocaba la base: marcaba en memoria y al recargar volvía
      // todo a "sin leer". El contador del topbar y la realidad no coincidían.
      const { error } = await db.from('notificaciones')
        .update({ leida: true }).in('id', pendientes);
      if (error) throw error;
    }
    return { ok: true };
  } catch (e) {
    notificaciones.value.forEach((n, i) => { n.leida = previas[i]; });
    actualizarNoLeidas();
    guardarNotificaciones();
    console.error('[notificaciones] No se pudieron marcar todas:', e.message);
    return { ok: false, error: mensajeDeError(e) };
  }
};

// Eliminar notificación
const eliminarNotificacion = async (id) => {
  const previas = notificaciones.value;
  notificaciones.value = notificaciones.value.filter(n => n.id !== id);
  actualizarNoLeidas();
  guardarNotificaciones();

  try {
    if (db) {
      const { data, error } = await db.from('notificaciones').delete().eq('id', id).select();
      if (error) throw error;
      // Una eliminación bloqueada por RLS no lanza error: devuelve cero filas.
      if (Array.isArray(data) && data.length === 0) {
        throw Object.assign(new Error('sin filas afectadas'), { code: '42501' });
      }
    }
    return { ok: true };
  } catch (e) {
    notificaciones.value = previas;
    actualizarNoLeidas();
    guardarNotificaciones();
    console.error('[notificaciones] No se pudo eliminar:', e.message);
    return { ok: false, error: mensajeDeError(e) };
  }
};

/** Borra en la base todas las notificaciones ya leídas. */
const eliminarLeidas = async () => {
  const ids = notificaciones.value.filter(n => n.leida).map(n => n.id);
  if (!ids.length) return { ok: true, borradas: 0 };

  try {
    if (db) {
      const { error } = await db.from('notificaciones').delete().in('id', ids);
      if (error) throw error;
    }
    notificaciones.value = notificaciones.value.filter(n => !n.leida);
    actualizarNoLeidas();
    guardarNotificaciones();
    return { ok: true, borradas: ids.length };
  } catch (e) {
    console.error('[notificaciones] No se pudieron eliminar las leídas:', e.message);
    return { ok: false, error: mensajeDeError(e) };
  }
};

// Vacía la lista EN MEMORIA. No borra nada en la base: al recargar vuelven.
// Para eliminar de verdad está `eliminarLeidas()`.
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
    errorNotificaciones,
    cargarNotificaciones,
    suscribirRealtime,
    desuscribirRealtime,
    agregarNotificacion,
    marcarComoLeida,
    marcarTodasComoLeidas,
    eliminarNotificacion,
    eliminarLeidas,
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
