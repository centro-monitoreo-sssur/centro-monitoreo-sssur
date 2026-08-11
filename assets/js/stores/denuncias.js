// ============================================================
// STORE: casos (renombrado de "denuncias" en el frontend)
// Schema v4: tabla `casos` (equivalente a denuncias en AppSheet).
// Expone refs, carga con fallback demo y suscripción realtime.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { useCatalogos } from './catalogos.js';

const denuncias = ref([]);
const cargandoDenuncias = ref(true);
const filtroTipo = ref(null);

/* Una sola definición de columnas para la carga inicial y para la relectura de
   Realtime. Si divergen, un caso recién cambiado aparecería con menos datos que
   el resto — y sería un fallo intermitente, de los peores de diagnosticar. */
const COLUMNAS_CASO = `
  id,
  correlativo,
  titulo,
  descripcion,
  estado_codigo,
  resolucion,
  created_at,
  updated_at,
  fecha_recibido,
  fecha_asignado,
  fecha_cierre,
  ubicacion,
  direccion_referencia,
  categoria_id,
  departamento_actual_id,
  distrito_id,
  prioridad_id,
  canal_reporte_id,
  usuario_responsable_id,
  cuadrilla_responsable_id,
  caso_padre_id
`;

/* ⚠ TOPE SILENCIOSO. Con más de 200 casos visibles, los indicadores que se
   calculan sobre esta lista MIENTEN, y nada lo advierte. `hayMasCasos` lo
   expone para que la interfaz pueda decirlo; la solución de fondo es paginar
   por cursor o filtrar por período, y está pendiente. */
const TOPE_CASOS = 200;
const hayMasCasos = ref(false);

async function cargarDenuncias() {
  cargandoDenuncias.value = true;
  try {
    if (db) {
      // RLS en Supabase ya filtra lo que el usuario autenticado puede ver.
      const { data, error } = await db
        .from('casos')
        .select(COLUMNAS_CASO)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(TOPE_CASOS);
      if (error) throw error;
      // Mapear `casos` al formato esperado por los componentes UI (compatibilidad)
      denuncias.value = (data || []).map((c) => mapearCasoADenuncia(c, { nombreDistrito }));
      hayMasCasos.value = (data || []).length >= TOPE_CASOS;
    } else {
      await new Promise((r) => setTimeout(r, 400));
      denuncias.value = []; // Sin mock si la BD está vacía
      hayMasCasos.value = false;
    }
  } catch (e) {
    console.error('Error cargando casos:', e);
    denuncias.value = []; // Sin mock, es mejor no mentir en producción
    hayMasCasos.value = false;
  } finally {
    // El índice de Realtime tiene que quedar alineado con la lista recién
    // cargada; si no, el primer parcheo escribiría en la posición equivocada.
    reconstruirIndice();
    cargandoDenuncias.value = false;
  }
}

// ── Coordenadas ────────────────────────────────────────────────────────────
// `casos.ubicacion` es `geography(Point,4326)`. PostgREST NO la serializa igual
// según versión y cabecera: puede llegar como objeto GeoJSON o como cadena EWKB
// hexadecimal ("0101000020E6100000…"). El código anterior solo contemplaba el
// primer caso, así que ante EWKB devolvía lat/lng nulos y el mapa se quedaba sin
// un solo marcador. Se aceptan ambas formas para no depender de ese detalle.

// EWKB de un POINT: 1 byte de endianness · 4 de tipo (bit 0x20000000 = trae
// SRID) · 4 de SRID si aplica · 8 de X · 8 de Y.
function puntoDesdeEWKB(hex) {
  if (typeof hex !== 'string' || hex.length < 42) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    const vista = new DataView(bytes.buffer);
    const little = bytes[0] === 1;
    const tipo = vista.getUint32(1, little);
    if ((tipo & 0xff) !== 1) return null;          // 1 = Point; otra geometría no aplica
    const traeSrid = (tipo & 0x20000000) !== 0;
    const offset = traeSrid ? 9 : 5;
    if (bytes.length < offset + 16) return null;
    const lng = vista.getFloat64(offset, little);
    const lat = vista.getFloat64(offset + 8, little);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function extraerCoordenadas(ubicacion) {
  if (!ubicacion) return { lat: null, lng: null };
  // GeoJSON: { type: 'Point', coordinates: [lng, lat] }
  const coords = ubicacion.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    return { lat: coords[1] ?? null, lng: coords[0] ?? null };
  }
  // GeoJSON serializado como texto
  if (typeof ubicacion === 'string' && ubicacion.trim().startsWith('{')) {
    try {
      const j = JSON.parse(ubicacion);
      if (Array.isArray(j.coordinates)) return { lat: j.coordinates[1], lng: j.coordinates[0] };
    } catch { /* cae al EWKB */ }
  }
  const punto = puntoDesdeEWKB(ubicacion);
  return punto || { lat: null, lng: null };
}

// Mapea el esquema real (casos) al formato que consumen los componentes.
//
// Sobre los alias: el mapa y la vista de denuncias filtran por `tipo_id`
// (`vista-mapa.js:267`, `vista-denuncias.js:31`) mientras que el store y los
// reportes usan `tipo`. Antes solo se emitía `tipo`, así que ambos filtros
// comparaban contra `undefined` y no casaba ni una fila. Se emiten los dos
// nombres apuntando al mismo id en lugar de tocar cinco vistas a la vez.
//
// `distrito` pasa a ser el NOMBRE, no el id: es lo que ya comparaban
// `vista-mapa.js:198` y `vista-cartograma.js:125`, que hasta ahora recibían un
// smallint y por eso nunca filtraban. El id queda en `distrito_id`.
function mapearCasoADenuncia(caso, catalogo = {}) {
  const { lat, lng } = extraerCoordenadas(caso.ubicacion);
  return {
    id: caso.id,
    correlativo: caso.correlativo,
    tipo: caso.categoria_id,          // alias histórico
    tipo_id: caso.categoria_id,       // nombre que usan mapa y denuncias
    titulo: caso.titulo,
    descripcion: caso.descripcion,
    estado: caso.estado_codigo,       // frontend usa `estado` → apunta a estado_codigo
    // La resolución la escribe el cierre (RPC `cerrar_caso_campo` desde campo,
    // `cambiar_estado_caso` desde la consola) y el panel de gestión la muestra.
    resolucion: caso.resolucion,
    lat,
    lng,
    direccion: caso.direccion_referencia,
    departamento: caso.departamento_actual_id,
    departamento_id: caso.departamento_actual_id,
    distrito: catalogo.nombreDistrito ? catalogo.nombreDistrito(caso.distrito_id) : caso.distrito_id,
    distrito_id: caso.distrito_id,
    prioridad: caso.prioridad_id,
    prioridad_id: caso.prioridad_id,
    canal: caso.canal_reporte_id,
    responsable: caso.usuario_responsable_id,
    cuadrilla: caso.cuadrilla_responsable_id,
    caso_padre_id: caso.caso_padre_id,
    created_at: caso.created_at,
    updated_at: caso.updated_at,
    fecha_recibido: caso.fecha_recibido,
    fecha_asignado: caso.fecha_asignado,
    fecha_cierre: caso.fecha_cierre,
  };
}

// ── Realtime ───────────────────────────────────────────────────────────────
//
// El canal se guarda en una variable de módulo —`let` plano, NUNCA un `ref`:
// un objeto de Supabase dentro de un proxy reactivo de Vue es el mismo patrón
// que ya rompió el mapa de Leaflet— para poder cumplir dos garantías:
//
//   1. UNA sola suscripción. `suscribirRealtime()` se llama desde dos sitios
//      (app-root al montar con sesión viva, y vista-login tras autenticar).
//      Sin el guardia, `db.channel('casos-live')` creaba DOS canales con el
//      mismo topic y cada cambio en la base disparaba `cargarDenuncias()` dos
//      veces: 400 filas releídas por cada caso que alguien tocara.
//
//   2. Cierre limpio al salir. Sin él, la suscripción del usuario anterior
//      seguía viva y el siguiente heredaba un canal abierto con un token que
//      ya no es el suyo.
let canalCasos = null;

/** Estado del canal, para que la consola pueda avisar si se cae. */
const estadoRealtime = ref('CERRADO');

/* ── Parcheo incremental ─────────────────────────────────────────────────────
   La versión anterior hacía `cargarDenuncias()` completo ante CUALQUIER evento:
   200 filas releídas, en TODOS los clientes conectados, cada vez que alguien
   tocaba un caso. Con veinte personas en el centro y un empleado cerrando
   partes, eran 4 000 filas por cierre.

   Ahora se relee SOLO la fila afectada. Y no se usa el `new` que trae el evento
   —que vendría gratis— por dos razones:

     · El payload sale de la TABLA, no de la vista: `ubicacion` llega en WKB y
       sin los nombres de catálogo, y su serialización depende de la versión de
       Realtime. Releer usa exactamente la misma consulta que la carga inicial.
     · Si un cambio saca la fila del alcance del usuario —reasignar un caso a
       otro distrito, por ejemplo— la relectura devuelve vacío y el caso
       desaparece de la lista. Con el payload crudo se quedaría en pantalla un
       caso que la RLS ya no autoriza a ver.

   `indicePorId` da la posición en O(1). Se reconstruye solo cuando la lista
   cambia de tamaño, que es lo raro; un UPDATE —lo frecuente— no la mueve. */
let indicePorId = new Map();

function reconstruirIndice() {
  indicePorId = new Map(denuncias.value.map((d, i) => [d.id, i]));
}

/** Posición que le corresponde a un caso en la lista, ordenada por fecha desc. */
function posicionPorFecha(creado) {
  const t = new Date(creado).getTime();
  const lista = denuncias.value;
  // Recorrido lineal a propósito: un caso nuevo es casi siempre el más
  // reciente, así que sale en la primera comparación.
  for (let i = 0; i < lista.length; i++) {
    if (new Date(lista[i].created_at).getTime() <= t) return i;
  }
  return lista.length;
}

function upsertCaso(fila) {
  const mapeado = mapearCasoADenuncia(fila, { nombreDistrito });
  const indice = indicePorId.get(mapeado.id);

  if (indice !== undefined) {
    denuncias.value[indice] = mapeado;   // misma posición: el índice sigue válido
    return;
  }
  denuncias.value.splice(posicionPorFecha(mapeado.created_at), 0, mapeado);
  reconstruirIndice();
}

function quitarCaso(id) {
  const indice = indicePorId.get(id);
  if (indice === undefined) return;
  denuncias.value.splice(indice, 1);
  reconstruirIndice();
}

/* Coalescencia de eventos.
   Aplicar una asignación toca el caso y su historial, y un cierre desde campo
   dispara varios cambios seguidos. Sin agrupar, cada uno sería una consulta.
   Se juntan los ids de 150 ms y se resuelven con un solo `in (...)`. */
let idsPendientes = new Set();
let temporizadorRefresco = null;

function programarRefresco(id) {
  idsPendientes.add(id);
  if (temporizadorRefresco) return;
  temporizadorRefresco = setTimeout(resolverPendientes, 150);
}

async function resolverPendientes() {
  temporizadorRefresco = null;
  const ids = [...idsPendientes];
  idsPendientes.clear();
  if (!ids.length || !db) return;

  try {
    const { data, error } = await db
      .from('casos').select(COLUMNAS_CASO).in('id', ids).is('deleted_at', null);
    if (error) throw error;

    const devueltos = new Set((data || []).map((c) => c.id));
    // Lo que se pidió y no volvió ya no es visible para este usuario: o se
    // borró, o un cambio lo sacó de su alcance.
    for (const id of ids) if (!devueltos.has(id)) quitarCaso(id);
    for (const fila of data || []) upsertCaso(fila);
  } catch (e) {
    // Sin recarga completa de respaldo: dejaría la puerta abierta a la
    // avalancha que este mecanismo viene a evitar. Se registra y se sigue; el
    // siguiente evento volverá a intentarlo.
    console.error('[realtime] No se pudo refrescar los casos cambiados:', e.message);
  }
}

async function suscribirRealtime() {
  if (!db || canalCasos) return;

  // Esperar a que el SDK haya terminado de restaurar la sesión.
  //
  // Esto es lo que producía el aviso «WebSocket is closed before the connection
  // is established» en consola. `autenticado` se pinta de forma optimista desde
  // el almacén local, así que app-root llamaba aquí ANTES de que Supabase
  // hubiera aplicado el JWT del usuario: el socket arrancaba con la clave anon
  // —se veía en la URL del aviso, `"role":"anon"`— y milisegundos después el
  // SDK lo derribaba para reconectar ya autenticado. Además de ruido, durante
  // esa ventana el canal escuchaba como anónimo, así que la RLS filtraba todo.
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;   // sin sesión no hay nada que escuchar

  canalCasos = db
    .channel('casos-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'casos' }, (evento) => {
      if (evento.eventType === 'DELETE') {
        // En un DELETE solo llega `old`, y con REPLICA IDENTITY por defecto
        // solo trae la clave primaria. Es todo lo que hace falta.
        if (evento.old?.id != null) quitarCaso(evento.old.id);
        return;
      }
      const id = evento.new?.id;
      if (id != null) programarRefresco(id);
    })
    .subscribe((estado) => {
      // El estado del canal es información operativa en un centro de
      // monitoreo: si el tiempo real se cae, el operador está mirando datos
      // congelados sin saberlo. Por eso se publica en un `ref` y no solo en
      // la consola: la interfaz puede avisarlo.
      estadoRealtime.value = estado;
      if (estado === 'SUBSCRIBED')   console.info('[realtime] Escuchando cambios en casos.');
      if (estado === 'CHANNEL_ERROR') console.error('[realtime] Canal en error; el SDK reintentará.');
      if (estado === 'TIMED_OUT')     console.warn('[realtime] Tiempo de espera agotado al suscribir.');
    });
}

async function desuscribirRealtime() {
  // Los refrescos en vuelo se descartan aunque no haya canal: si la sesión se
  // cerró, esa consulta se ejecutaría con el token del usuario anterior o
  // fallaría, y en ningún caso su resultado debe entrar en la lista.
  if (temporizadorRefresco) {
    clearTimeout(temporizadorRefresco);
    temporizadorRefresco = null;
  }
  idsPendientes.clear();
  estadoRealtime.value = 'CERRADO';

  if (!db || !canalCasos) return;
  const canal = canalCasos;
  canalCasos = null;         // antes del await: evita una doble baja si se llama dos veces
  try {
    await db.removeChannel(canal);
  } catch (e) {
    console.warn('[realtime] Falló el cierre del canal:', e.message);
  }
}

const { nombreDeTipo, colorDeTipo, nombreDistrito } = useCatalogos();

const denunciasFiltradas = computed(() => {
  if (!filtroTipo.value) return denuncias.value;
  return denuncias.value.filter((d) => d.tipo === filtroTipo.value);
});

// Estados finales del flujo, según `categorias_caso.estados_flujo`
// (migration_v9_seed_categorias.sql:43-47). El badge del sidebar comparaba
// contra 'cerrado' y 'resuelto', que no son códigos válidos: los casos cerrados
// se contaban como pendientes y el contador solo crecía.
const ESTADOS_FINALES = ['resuelta', 'rechazada'];

const denunciasPendientesCount = computed(
  () => denuncias.value.filter((d) => !ESTADOS_FINALES.includes(d.estado)).length
);

export function useDenuncias() {
  return {
    denuncias,
    denunciasFiltradas,
    denunciasPendientesCount,
    filtroTipo,
    cargandoDenuncias,
    cargarDenuncias,
    suscribirRealtime,
    desuscribirRealtime,
    estadoRealtime,
    hayMasCasos,
    nombreDeTipo,
    colorDeTipo,
  };
}
