// ============================================================
// STORE: casos (renombrado de "denuncias" en el frontend)
// Schema v4: tabla `casos` (equivalente a denuncias en AppSheet).
// Expone refs, carga con fallback demo y suscripción realtime.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { denunciasDemo } from '../utils/demo-data.js';
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
      denuncias.value = (data || []).map(mapearCasoADenuncia);
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

// Mapea el esquema real (casos) al formato legacy del frontend para compatibilidad
function mapearCasoADenuncia(caso) {
  return {
    id: caso.id,
    correlativo: caso.correlativo,
    tipo: caso.categoria_id,         // frontend usa `tipo` → apunta a categoria_id
    titulo: caso.titulo,
    descripcion: caso.descripcion,
    estado: caso.estado_codigo,       // frontend usa `estado` → apunta a estado_codigo
    lat: caso.ubicacion?.coordinates?.[1] ?? null,
    lng: caso.ubicacion?.coordinates?.[0] ?? null,
    direccion: caso.direccion_referencia,
    departamento: caso.departamento_actual_id,
    distrito: caso.distrito_id,
    prioridad: caso.prioridad_id,
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

const { nombreDeTipo, colorDeTipo } = useCatalogos();

const denunciasFiltradas = computed(() => {
  if (!filtroTipo.value) return denuncias.value;
  return denuncias.value.filter((d) => d.tipo === filtroTipo.value);
});

// Vue template expects denunciasPendientesCount to render the sidebar badge
const denunciasPendientesCount = computed(() => {
  return denuncias.value.filter((d) => d.estado !== 'cerrado' && d.estado !== 'resuelto').length;
});

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
