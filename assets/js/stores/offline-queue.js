// ============================================================
// COLA DE OPERACIONES OFFLINE
//
// Un empleado en territorio pierde señal con normalidad, así que toda escritura
// que falle se guarda aquí y se reintenta al recuperar conexión. Cada elemento
// de la cola es una orden autocontenida —tipo + datos— que se puede reproducir
// más tarde: patrón Orden (Command), que es lo que permite persistirla y
// reintentarla sin que quien la encoló siga vivo en memoria.
//
// La cola vive en el almacén CON PREFIJO DE CONTEXTO. Antes estaba en la clave
// global `offline_queue`, de modo que el Centro de Monitoreo abierto en otra
// pestaña la leía y sincronizaba con SU token los partes de un empleado.
// ============================================================
import { ref, computed } from '../core/vue.js';
import eventBus from '../core/event-bus.js';
import { EVENTOS_OFFLINE } from '../core/eventos-offline.js';
import { db } from '../core/supabase.js';
import { almacen } from '../core/almacen.js';
import { registrarCasoEnCampo } from '../services/casos-campo.js';
import { useMisCasos } from './mis-casos.js';

const CLAVE_COLA = 'offline_queue';

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

// Un JSON corrupto —una escritura interrumpida al cerrarse la app— dejaba la
// cola irrecuperable y lanzaba en tiempo de carga del módulo, tumbando la app
// entera. `leerJson` devuelve el valor por defecto en ese caso.
const cargarCola = () => {
  const guardada = almacen.leerJson(CLAVE_COLA, []);
  colaOperaciones.value = Array.isArray(guardada) ? guardada : [];
};

// Devuelve `{ ok, error, mensaje }`. NO es decorativo: la cola guarda las
// fotografías en base64 y localStorage da unos 5 MB por origen, así que
// agotar la cuota es el fallo esperable de una jornada sin señal. Quien encola
// tiene que poder avisar en pantalla en vez de responder "guardado" y perderlo.
const guardarCola = () => almacen.escribirJson(CLAVE_COLA, colaOperaciones.value);

// Agregar operación a la cola.
// Devuelve `{ ok, operacion, mensaje }`. Si la persistencia falla se revierte
// el push: una orden que solo existe en memoria desaparece al cerrar la app y
// habría quedado contada como pendiente sin llegar a estarlo.
const agregarOperacion = (operacion) => {
  const nuevaOperacion = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
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
  const guardado = guardarCola();

  if (!guardado.ok) {
    colaOperaciones.value.pop();
    return {
      ok: false,
      operacion: null,
      mensaje: guardado.error === 'cuota'
        ? 'No queda espacio en el dispositivo para guardar el reporte. ' +
          'Conéctate a una red para sincronizar el buzón offline y libera espacio.'
        : 'No se pudo guardar el reporte en el dispositivo.',
    };
  }

  eventBus.emit(EVENTOS_OFFLINE.OPERACION_AGREGADA, nuevaOperacion);

  return { ok: true, operacion: nuevaOperacion, mensaje: '' };
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

// ── Manejadores por tipo de operación ──────────────────────────────────────
//
// Registro en vez del `switch` que había antes. Dos motivos, y ninguno es
// estético:
//   · Despacho O(1) por clave, en lugar de recorrer ramas.
//   · Abierto a extensión, cerrado a modificación: añadir un tipo de operación
//     es añadir una entrada, sin tocar el motor que reintenta y persiste. Ese
//     motor es la parte delicada; cuanto menos se edite, mejor.
//
// Cada manejador devuelve `{ permanente }` cuando el servidor RECHAZA la
// operación. Distinguirlo importa: un rechazo (categoría inexistente, punto
// fuera del municipio) va a fallar igual las tres veces, así que gastar
// reintentos en él solo retrasa a las operaciones que sí podrían pasar.
const MANEJADORES = {
  // Alta de un caso levantado en territorio.
  //
  // El id de la operación viaja como `referencia_cliente`, y ahí está la clave
  // de todo: si la red se cortó DESPUÉS de que la base insertara pero antes de
  // que llegara la respuesta, este reintento no crea un segundo caso — la base
  // reconoce la referencia y devuelve el que ya existe.
  async [TIPOS_OPERACION.LEVANTAR_DENUNCIA](operacion) {
    const { datos } = operacion;
    const resultado = await registrarCasoEnCampo({
      categoriaId: datos.categoriaId,
      descripcion: datos.descripcion,
      direccionReferencia: datos.direccionReferencia,
      lat: datos.lat,
      lng: datos.lng,
      titulo: datos.titulo,
      canal: datos.canal || 'pwa_empleado',
      referenciaCliente: datos.referenciaCliente || operacion.id,
      adjuntos: datos.adjuntos,
    });

    if (!resultado.ok) {
      const e = new Error(resultado.mensaje);
      e.permanente = !resultado.esDeRed;
      throw e;
    }
  },

  // Cierre de una intervención. Va por el RPC `cerrar_caso_campo` y no por un
  // `update` directo: el cierre son cuatro escrituras —estado, fecha, evidencia
  // e historial— y desde el navegador no hay forma de hacerlas atómicas.
  //
  // Es idempotente por naturaleza: un caso ya cerrado responde `ya_cerrado` sin
  // sobrescribir la resolución ni la fecha originales, así que reintentar es
  // seguro aunque el primer intento sí llegara a aplicarse.
  async [TIPOS_OPERACION.CERRAR_INCIDENTE](operacion) {
    const { casoId, resolucion, observaciones, adjuntos } = operacion.datos;
    const { cerrarCaso } = useMisCasos();

    const r = await cerrarCaso({ casoId, resolucion, observaciones, adjuntos });
    if (!r.ok) {
      const e = new Error(r.mensaje);
      e.permanente = !r.esDeRed;
      throw e;
    }
  },

  async [TIPOS_OPERACION.ACTUALIZAR_INTERVENCION](operacion) {
    const { id, ...cambios } = operacion.datos;
    const { error } = await db.from('casos').update(cambios).eq('id', id);
    if (error) { const e = new Error(error.message); e.permanente = Boolean(error.code); throw e; }
  },
};

// `CREAR_DENUNCIA` comparte manejador con `LEVANTAR_DENUNCIA`: es el mismo
// alta, solo cambia quién la origina.
MANEJADORES[TIPOS_OPERACION.CREAR_DENUNCIA] = MANEJADORES[TIPOS_OPERACION.LEVANTAR_DENUNCIA];

// SUBIR_FOTO ya no existe como operación suelta. Escribía las imágenes en
// `casos.datos_extra`, columna que NUNCA ha existido en el esquema, así que
// fallaba siempre. Las fotografías se suben ahora a cPanel y viajan como URLs
// dentro del propio alta, que es además lo que la hace atómica: no hay estado
// intermedio de "caso creado, evidencia perdida".

const despacharOperacion = async (operacion) => {
  if (!db) {
    // Transitorio por definición: sin cliente no se ha intentado nada.
    throw new Error('Sin conexión a Supabase');
  }

  const manejador = MANEJADORES[operacion.tipo];
  if (!manejador) {
    // Una operación que nadie sabe atender no debe quedarse bloqueando la cola
    // para siempre. Se marca permanente para que salga del ciclo de reintentos
    // y quede visible en el buzón.
    const e = new Error(`Tipo de operación no soportado: ${operacion.tipo}`);
    e.permanente = true;
    throw e;
  }

  return manejador(operacion);
};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Procesa una operación hasta agotarla: éxito, rechazo definitivo o reintentos
// consumidos.
//
// Antes el reintento se lanzaba con un `setTimeout` suelto y la función volvía
// de inmediato. Eso dejaba el reintento corriendo POR FUERA del bucle de
// `sincronizar()`, así que la misma operación podía estar despachándose dos
// veces a la vez —y una segunda llamada a `sincronizar()`, que dispara el
// evento 'online' en cuanto la red parpadea, multiplicaba el efecto—. Ahora la
// espera se aguarda dentro, y la cola vuelve a ser estrictamente secuencial.
const procesarOperacion = async (operacion) => {
  for (;;) {
    marcarEnProceso(operacion.id);   // incrementa `intentos`

    try {
      await despacharOperacion(operacion);
      marcarCompletada(operacion.id);
      return { ok: true };
    } catch (error) {
      // Rechazo del servidor: fallará igual las tres veces. Gastar reintentos
      // aquí solo retrasa a las operaciones que sí podrían pasar.
      if (error.permanente) {
        marcarFallida(operacion.id, error.message);
        return { ok: false, error: error.message, permanente: true };
      }

      if (operacion.intentos >= operacion.maxIntentos) {
        marcarFallida(operacion.id, error.message);
        return { ok: false, error: error.message, permanente: false };
      }

      // Retroceso exponencial con techo de 30 s: sin él, al cuarto intento un
      // teléfono estaría esperando minutos con el reporte sin enviar.
      await esperar(Math.min(2 ** operacion.intentos * 1000, 30_000));
    }
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
    
    // Auto-limpiar operaciones completadas para no saturar memoria/localStorage
    limpiarCola();
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

// Limpiar errores. Solo viven en memoria: la clave `offline_errores` que se
// borraba aquí no la escribía nadie, así que la llamada no hacía nada.
const limpiarErrores = () => {
  erroresSincronizacion.value = [];
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

// Auto-sincronizar cuando se recupera la conexión
window.addEventListener('online', () => {
  if (operacionesPendientes.value.length > 0) {
    console.info('[OfflineQueue] Conexión restaurada. Sincronizando cola automáticamente...');
    sincronizar();
  }
});

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
