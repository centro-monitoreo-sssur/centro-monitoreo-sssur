// ============================================================
// STORE: dashboard KPIs
// Consulta counts directamente en Supabase en vez de cargar filas completas.
// Fallback: calcular desde el store de denuncias si no hay db.
// ============================================================
import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';

const kpis = ref({
  total: 0,
  pendientes: 0,
  enCurso: 0,
  resueltas: 0,
  tasaResolucion: 0,
  empleadosActivos: 0,
});
const cargandoKpis = ref(false);

async function cargarKpis() {
  if (!db) return; // sin db los kpis vienen del store de denuncias reactivo
  cargandoKpis.value = true;
  try {
    // Usar count=exact de Supabase para no traer rows completas
    const [resTotal, resPendientes, resEnCurso, resResueltas, resEmpleados] = await Promise.all([
      db.from('casos').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      db.from('casos').select('*', { count: 'exact', head: true })
        .is('deleted_at', null).eq('estado_codigo', 'recibida'),
      db.from('casos').select('*', { count: 'exact', head: true })
        .is('deleted_at', null).eq('estado_codigo', 'en_atencion'),
      db.from('casos').select('*', { count: 'exact', head: true })
        .is('deleted_at', null).in('estado_codigo', ['resuelta', 'cerrada']),
      db.from('usuarios').select('*', { count: 'exact', head: true }).eq('activo', true),
    ]);

    const total    = resTotal.count    || 0;
    const resueltas = resResueltas.count || 0;

    kpis.value = {
      total,
      pendientes:      resPendientes.count  || 0,
      enCurso:         resEnCurso.count     || 0,
      resueltas,
      tasaResolucion:  total > 0 ? Math.round((resueltas / total) * 100) : 0,
      empleadosActivos: resEmpleados.count  || 0,
    };
  } catch (e) {
    console.warn('KPIs: error al consultar Supabase.', e.message);
  } finally {
    cargandoKpis.value = false;
  }
}

export function useDashboard() {
  return { kpis, cargandoKpis, cargarKpis };
}
