// ============================================================
// STORE: catálogo de tipos de denuncia y departamentos
// Estado compartido (singleton de módulo) con fallback local.
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
      const { data, error } = await db.from('tipos_denuncia').select('*');
      if (error) throw error;
      if (data && data.length) tiposDenuncia.value = data;
    } else {
      await new Promise((r) => setTimeout(r, 200)); // latencia simulada
    }
  } catch (e) {
    console.warn('Usando catálogo local de tipos de denuncia:', e.message);
  } finally {
    cargandoCatalogos.value = false;
  }
}

async function cargarDepartamentos() {
  cargandoCatalogos.value = true;
  try {
    if (db) {
      const { data, error } = await db.from('departamentos').select('*');
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
  const areaDeTipo   = (id) => buscar(id).area || id;
  
  const buscarDepartamento = (id) => departamentos.value.find((d) => d.id === id) || {};
  const nombreDepartamento = (id) => buscarDepartamento(id).nombre_dpto || id;
  const direccionDepartamento = (id) => buscarDepartamento(id).nombre_direccion || '';

  return {
    tiposDenuncia, departamentos, cargandoCatalogos, cargarTipos, cargarDepartamentos,
    nombreDeTipo, colorDeTipo, iconoDeTipo, areaDeTipo,
    buscarDepartamento, nombreDepartamento, direccionDepartamento
  };
}
