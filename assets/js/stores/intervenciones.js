// ============================================================
// STORE: intervenciones (casos asignados a cuadrilla/empleado)
// Filtra casos que ya tienen responsable asignado (son intervenciones activas).
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const intervenciones = ref([]);
const cargandoIntervenciones = ref(false);

// Mock fallback para cuando no hay datos reales aún
const intervencionesDemo = [
  { id: 101, titulo: 'Reparación de bache profundo', ubicacion: 'Bulevar Venezuela frente a gasolinera', area: 'Obras', estado: 'pendiente', progreso: 0, fecha: '2026-07-16' },
  { id: 102, titulo: 'Retiro de árbol caído', ubicacion: 'Carretera Panamericana km 12', area: 'P. Civil', estado: 'en_progreso', progreso: 60, fecha: '2026-07-15', personal: 'Cuadrilla Delta' },
  { id: 103, titulo: 'Cambio de luminarias', ubicacion: 'Colonia Escalón, calle Los Sisimiles', area: 'Alumbrado', estado: 'en_progreso', progreso: 30, fecha: '2026-07-15', personal: 'Brigada Eléctrica 2' },
  { id: 104, titulo: 'Limpieza de promontorio', ubicacion: 'Pasaje 4, Colonia San Benito', area: 'Aseo', estado: 'pendiente', progreso: 0, fecha: '2026-07-16' },
  { id: 105, titulo: 'Reparación de calle finalizada', ubicacion: 'Colonia Modelo, calle principal', area: 'Obras', estado: 'completado', progreso: 100, fecha: '2026-07-13', personal: 'Cuadrilla Alfa' },
  { id: 106, titulo: 'Cuadrilla CAM en sitio', ubicacion: 'Residencial San Luis, bloque 3', area: 'CAM', estado: 'en_progreso', progreso: 85, fecha: '2026-07-15', personal: 'Agentes CAM' },
];

function mapEstado(codigo) {
  const mapa = {
    recibida: 'pendiente',
    asignada: 'pendiente',
    en_atencion: 'en_progreso',
    resuelta: 'completado',
    cerrada: 'completado',
    anulada: 'completado',
  };
  return mapa[codigo] || 'pendiente';
}

async function cargarIntervenciones() {
  cargandoIntervenciones.value = true;
  try {
    if (db) {
      const { data, error } = await db
        .from('casos')
        .select(`
          id,
          titulo,
          descripcion,
          estado_codigo,
          prioridad_id,
          direccion_referencia,
          created_at,
          fecha_cierre,
          categorias_caso ( nombre ),
          departamentos ( nombre ),
          usuarios!casos_usuario_responsable_id_fkey ( nombres, apellidos ),
          distrito_id
        `)
        .is('deleted_at', null)
        .not('usuario_responsable_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data && data.length > 0) {
        intervenciones.value = data.map(c => ({
          id: c.id,
          titulo: c.titulo,
          descripcion: c.descripcion,
          estado: mapEstado(c.estado_codigo),
          progreso: c.estado_codigo === 'resuelta' || c.estado_codigo === 'cerrada' ? 100
                  : c.estado_codigo === 'en_atencion' ? 50
                  : 0,
          ubicacion: c.direccion_referencia,
          area: c.categorias_caso?.nombre || 'General',
          fecha: c.created_at?.slice(0, 10),
          personal: c.usuarios ? `${c.usuarios.nombres} ${c.usuarios.apellidos}` : null,
          distrito_id: c.distrito_id,
          estado_codigo: c.estado_codigo,
        }));
      } else {
        // Sin datos asignados en BD — estado vacío (no demo)
        intervenciones.value = [];
      }
    } else {
      // Sin conexión a DB — usar demo para visualización
      intervenciones.value = intervencionesDemo;
    }
  } catch (e) {
    console.warn('Intervenciones: usando datos demo.', e.message);
    intervenciones.value = intervencionesDemo;
  } finally {
    cargandoIntervenciones.value = false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CAPAS DEL MAPA EN VIVO
// Un caso con `recorrido` es un tramo (se pinta como polilínea); uno con
// responsable asignado y solo punto es una intervención activa (se pinta como
// marcador). La distinción es geométrica, no de catálogo — ver la cabecera de
// database/migration_v15_tramos_y_vistas_seguras.sql.
//
// Se consulta v_casos_mapa, que desde la v15 declara security_invoker, así que
// el alcance por departamento de la migration_v14 se aplica también aquí.
// ────────────────────────────────────────────────────────────────────────────
const tramos = ref([]);
const intervencionesMapa = ref([]);
const cargandoCapasMapa = ref(false);

// ST_AsGeoJSON entrega [lng, lat]; Leaflet espera [lat, lng].
function geoJsonALatLng(geojson) {
  try {
    const g = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
    if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates)) return [];
    return g.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch (e) {
    console.error('[intervenciones] Recorrido con GeoJSON inválido:', e.message);
    return [];
  }
}

async function cargarCapasMapa() {
  if (!db) {
    // Sin conexión no se inventan tramos: son datos operativos, no decorado.
    tramos.value = [];
    intervencionesMapa.value = [];
    return;
  }

  cargandoCapasMapa.value = true;
  try {
    const { data, error } = await db
      .from('v_casos_mapa')
      .select(`id, titulo, estado_codigo, categoria_nombre, categoria_color,
               departamento_nombre, lat, lng, recorrido_geojson, recorrido_modo,
               recorrido_metros, es_tramo, usuario_responsable_id,
               cuadrilla_responsable_id, fecha_cierre`)
      .is('fecha_cierre', null)
      .limit(500);

    if (error) throw error;
    const filas = data || [];

    tramos.value = filas
      .filter((c) => c.es_tramo)
      .map((c) => ({
        id: c.id,
        name: c.titulo,
        type: c.categoria_nombre || 'Tramo',
        color: c.categoria_color || '#b06a20',
        coords: geoJsonALatLng(c.recorrido_geojson),
        metros: c.recorrido_metros,
        modo: c.recorrido_modo,
        area: c.departamento_nombre,
      }))
      .filter((t) => t.coords.length >= 2);

    intervencionesMapa.value = filas
      .filter((c) => !c.es_tramo
        && (c.usuario_responsable_id || c.cuadrilla_responsable_id)
        && c.lat != null && c.lng != null)
      .map((c) => ({
        id: c.id,
        name: c.titulo,
        area: c.departamento_nombre || 'General',
        status: mapEstado(c.estado_codigo),
        color: c.categoria_color || '#c8a200',
        lat: c.lat,
        lng: c.lng,
      }));
  } catch (e) {
    // Vaciar en vez de caer a demo: con la RLS por departamento activa, un
    // resultado vacío es legítimo y mostrar datos falsos sería peor.
    tramos.value = [];
    intervencionesMapa.value = [];
    console.error('[intervenciones] No se pudieron cargar las capas del mapa:', e.message);
  } finally {
    cargandoCapasMapa.value = false;
  }
}

export function useIntervenciones() {
  return {
    intervenciones,
    cargandoIntervenciones,
    cargarIntervenciones,
    // Capas del Mapa en Vivo
    tramos,
    intervencionesMapa,
    cargandoCapasMapa,
    cargarCapasMapa,
  };
}
