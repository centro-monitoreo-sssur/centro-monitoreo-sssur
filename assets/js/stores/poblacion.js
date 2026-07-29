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
      const { data, error } = await db.from('ciudadanos').select('*');
      if (error) throw error;
      if (data && data.length) poblacion.value = data;
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
