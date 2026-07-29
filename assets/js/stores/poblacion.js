// ============================================================
// STORE: Gestión de población registrada
// Estado compartido (singleton de módulo) con fallback local.
// ============================================================
import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { poblacionDemo } from '../utils/demo-data.js';

const poblacion = ref(poblacionDemo);
const cargandoPoblacion = ref(false);

async function cargarPoblacion() {
  cargandoPoblacion.value = true;
  try {
    if (db) {
      const { data, error } = await db
        .from('ciudadanos')
        .select(`
          id,
          dui,
          telefono,
          nombres,
          apellidos,
          activo,
          created_at,
          distritos ( nombre )
        `);
      if (error) throw error;
      if (data) {
        poblacion.value = data.map(c => ({
          id: c.id,
          dui: c.dui || '',
          telefono: c.telefono || '',
          nombre: `${c.nombres} ${c.apellidos}`,
          email: '', // email requeriría auth.users view, lo dejamos vacío por ahora
          distrito: c.distritos?.nombre || 'Desconocido',
          estado: c.activo ? 'activo' : 'inactivo',
          fechaRegistro: c.created_at,
          verificado: true // temporal
        }));
      }
    } else {
      await new Promise((r) => setTimeout(r, 200)); // latencia simulada
    }
  } catch (e) {
    console.warn('Usando datos demo de población:', e.message);
  } finally {
    cargandoPoblacion.value = false;
  }
}

function buscarCiudadano(id) {
  return poblacion.value.find((c) => c.id === id) || {};
}

export function usePoblacion() {
  return {
    poblacion, cargandoPoblacion, cargarPoblacion, buscarCiudadano
  };
}
