// ============================================================
// STORE: catálogo de categorías de caso y departamentos
// Schema v4: categorias_caso (no tipos_denuncia), departamentos.
// Fallback local si Supabase no está disponible.
// ============================================================
import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { tiposDenunciaFallback, departamentosFallback } from '../utils/demo-data.js';

const tiposDenuncia = ref(tiposDenunciaFallback);
const departamentos = ref(departamentosFallback);
const cargandoCatalogos = ref(false);

async function cargarTipos() {
  cargandoCatalogos.value = true;
  try {
    if (db) {
      // Schema v4: tabla categorias_caso (heredera de tipos_denuncia en AppSheet)
      const { data, error } = await db
        .from('categorias_caso')
        .select('id, nombre, descripcion, color_hex, icono, departamento_responsable_id, activo')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      if (data && data.length) tiposDenuncia.value = data;
    } else {
      await new Promise((r) => setTimeout(r, 200)); // latencia simulada
    }
  } catch (e) {
    console.warn('Usando catálogo local de categorías:', e.message);
  } finally {
    cargandoCatalogos.value = false;
  }
}

async function cargarDepartamentos() {
  cargandoCatalogos.value = true;
  try {
    if (db) {
      const { data, error } = await db
        .from('departamentos')
        .select('id, nombre, codigo, activo')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      if (data && data.length) departamentos.value = data;
    } else {
      await new Promise((r) => setTimeout(r, 200)); // latencia simulada
    }
  } catch (e) {
    console.warn('Usando catálogo local de departamentos:', e.message);
  } finally {
    cargandoCatalogos.value = false;
  }
}

export function useCatalogos() {
  const buscar = (id) => tiposDenuncia.value.find((t) => t.id === id) || {};
  const nombreDeTipo = (id) => buscar(id).nombre || id;
  const colorDeTipo  = (id) => buscar(id).color_hex || '#6b7280';
  const iconoDeTipo  = (id) => buscar(id).icono || 'fa-circle';
  const areaDeTipo   = (id) => {
    // En schema v4 el área se resuelve via departamento_responsable_id de la categoría
    const cat = buscar(id);
    return cat.departamento_responsable_id ? nombreDepartamento(cat.departamento_responsable_id) : (cat.area || id);
  };

  const buscarDepartamento = (id) => departamentos.value.find((d) => d.id === id) || {};
  const nombreDepartamento = (id) => buscarDepartamento(id).nombre || id;
  const direccionDepartamento = (id) => ''; // Pendiente join con direcciones_administrativas

  return {
    tiposDenuncia, departamentos, cargandoCatalogos, cargarTipos, cargarDepartamentos,
    nombreDeTipo, colorDeTipo, iconoDeTipo, areaDeTipo,
    buscarDepartamento, nombreDepartamento, direccionDepartamento
  };
}
