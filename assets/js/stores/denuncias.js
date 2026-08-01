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

async function cargarDenuncias() {
  cargandoDenuncias.value = true;
  try {
    if (db) {
      // Schema v4: tabla `casos`. Seleccionamos los campos necesarios para UI + mapa.
      // RLS en Supabase ya filtra lo que el usuario autenticado puede ver.
      const { data, error } = await db
        .from('casos')
        .select(`
          id,
          correlativo,
          titulo,
          descripcion,
          estado_codigo,
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
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      // Mapear `casos` al formato esperado por los componentes UI (compatibilidad)
      denuncias.value = (data || []).map((c) => mapearCasoADenuncia(c, { nombreDistrito }));
    } else {
      await new Promise((r) => setTimeout(r, 400));
      denuncias.value = []; // Sin mock si la BD está vacía
    }
  } catch (e) {
    console.error('Error cargando casos:', e);
    denuncias.value = []; // Sin mock, es mejor no mentir en producción
  } finally {
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

// Realtime: se activa automáticamente si hay conexión con Supabase.
// Reemplaza el simularDenuncia() con setInterval que había antes.
function suscribirRealtime() {
  if (!db) return;
  db.channel('casos-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'casos' }, () => cargarDenuncias())
    .subscribe();
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
    nombreDeTipo,
    colorDeTipo,
  };
}
