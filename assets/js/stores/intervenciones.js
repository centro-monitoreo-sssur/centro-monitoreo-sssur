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

export function useIntervenciones() {
  return {
    intervenciones,
    cargandoIntervenciones,
    cargarIntervenciones,
  };
}
