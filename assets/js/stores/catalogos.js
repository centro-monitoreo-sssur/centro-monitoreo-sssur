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
// Los 5 distritos del municipio. A diferencia del resto de catálogos NO tiene
// fallback de demo: en una consola territorial, un distrito inventado es peor
// que una lista vacía — llevaría a leer cifras de un territorio que no existe.
const distritos = ref([]);
// Nivel gerencial superior del organigrama. Sin fallback por el mismo motivo
// que los distritos: una dirección inventada rompería la asignación de
// departamentos, que es una FK not null.
const direcciones = ref([]);
const cargandoCatalogos = ref(false);

// Un catálogo vacío en Supabase NO lanza excepción: la query responde []. Sin
// esta bandera el store conserva los datos de demo-data.js y la UI los muestra
// como si fueran reales — indistinguible de valores hardcodeados. Se expone
// para que las vistas puedan avisar que están operando sobre datos de demo.
const catalogosEnFallback = ref({ tipos: true, departamentos: true, distritos: true });

async function cargarTipos() {
  cargandoCatalogos.value = true;
  try {
    if (db) {
      // Schema v4: tabla categorias_caso (heredera de tipos_denuncia en AppSheet)
      const { data, error } = await db
        .from('categorias_caso')
        // `codigo` alimenta la agrupación del clasificador de denuncias
        // (utils/grupos-categorias.js): su prefijo — VIA, RIE, COM… — define
        // el macro-grupo. Sin él la agrupación cae a las palabras clave del
        // nombre, que es menos preciso.
        .select('id, codigo, nombre, descripcion, color_hex, icono, departamento_responsable_id, activo')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      if (data && data.length) {
        tiposDenuncia.value = data;
        catalogosEnFallback.value.tipos = false;
      } else {
        console.error(
          '[catalogos] La tabla `categorias_caso` está VACÍA en Supabase. ' +
          'El Centro de Monitoreo está mostrando las categorías de demo de ' +
          'demo-data.js, no las que gestionan los departamentos. ' +
          'Cárgala antes de usar el sistema en producción.'
        );
      }
    } else {
      await new Promise((r) => setTimeout(r, 200)); // latencia simulada
    }
  } catch (e) {
    console.error('[catalogos] Falló la carga de categorías, usando datos de demo:', e.message);
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
        .select(`
          id,
          nombre,
          codigo,
          estado,
          direccion_id,
          direcciones_administrativas:direccion_id (
            id,
            nombre
          )
        `)
        .order('nombre');
      if (error) throw error;
      if (data && data.length) {
        departamentos.value = data;
        catalogosEnFallback.value.departamentos = false;
      } else {
        console.error('[catalogos] La tabla `departamentos` está VACÍA en Supabase. Usando datos de demo.');
      }
    } else {
      await new Promise((r) => setTimeout(r, 200)); // latencia simulada
    }
  } catch (e) {
    console.error('[catalogos] Falló la carga de departamentos, usando datos de demo:', e.message);
  } finally {
    cargandoCatalogos.value = false;
  }
}

async function cargarDistritos() {
  cargandoCatalogos.value = true;
  try {
    if (db) {
      const { data, error } = await db
        .from('distritos')
        .select('id, codigo, nombre, municipio_id, activo')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      if (data && data.length) {
        distritos.value = data;
        catalogosEnFallback.value.distritos = false;
      } else {
        console.error(
          '[catalogos] La tabla `distritos` está VACÍA en Supabase. El filtro ' +
          'territorial del Mapa en Vivo quedará deshabilitado. Ejecuta ' +
          'migration_v11_seed_seguridad_y_catalogos.sql.'
        );
      }
    }
  } catch (e) {
    console.error('[catalogos] Falló la carga de distritos:', e.message);
  } finally {
    cargandoCatalogos.value = false;
  }
}

async function cargarDirecciones() {
  if (!db) return;
  try {
    const { data, error } = await db
      .from('direcciones_administrativas')
      .select('id, codigo, nombre, activo')
      .eq('activo', true)
      .order('nombre');
    if (error) throw error;
    direcciones.value = data || [];
    if (!direcciones.value.length) {
      console.error(
        '[catalogos] `direcciones_administrativas` está VACÍA. No se podrán ' +
        'crear departamentos: `departamentos.direccion_id` es NOT NULL.'
      );
    }
  } catch (e) {
    console.error('[catalogos] Falló la carga de direcciones:', e.message);
  }
}

// ── Escritura de departamentos ───────────────────────────────
// Devuelven { ok, error } en vez de lanzar: la vista necesita mostrar el
// mensaje en el modal, no romper el render con una excepción sin capturar.

// Traduce los errores de Postgres a algo que un administrador municipal pueda
// accionar. `error.message` en crudo menciona nombres de constraint que no
// significan nada fuera del esquema.
function mensajeDeError(error, contexto) {
  const codigo = error?.code;
  if (codigo === '23505') return 'Ya existe un registro con ese código. Los códigos deben ser únicos.';
  if (codigo === '23503') return 'La dirección seleccionada no existe o fue eliminada.';
  if (codigo === '23502') return 'Faltan campos obligatorios.';
  if (codigo === '42501' || /row-level security/i.test(error?.message || '')) {
    return 'Tu rol no tiene permiso para esta operación.';
  }
  console.error(`[catalogos] ${contexto}:`, error);
  return error?.message || 'Error desconocido al guardar.';
}

async function guardarDepartamento(dep) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };

  const payload = {
    codigo: (dep.codigo || '').trim(),
    nombre: (dep.nombre || '').trim(),
    direccion_id: dep.direccion_id ? Number(dep.direccion_id) : null,
    estado: dep.estado === 'inactivo' ? 'inactivo' : 'activo',
  };

  if (!payload.codigo)      return { ok: false, error: 'El código es obligatorio.' };
  if (!payload.nombre)      return { ok: false, error: 'El nombre es obligatorio.' };
  if (!payload.direccion_id) return { ok: false, error: 'Selecciona la dirección a la que pertenece.' };

  try {
    // `departamentos.id` es `generated always as identity`: no se puede enviar
    // en el insert, y en el update va en el filtro, nunca en el cuerpo.
    const { error } = dep.id
      ? await db.from('departamentos').update(payload).eq('id', dep.id)
      : await db.from('departamentos').insert(payload);
    if (error) throw error;
    await cargarDepartamentos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'guardarDepartamento') };
  }
}

// No hay borrado físico y no lo habrá: `departamentos.id` es FK desde
// `categorias_caso`, `casos`, `usuarios` y `departamento_categorias`. Un delete
// real o falla por la FK o se lleva por delante casos históricos.
async function desactivarDepartamento(id) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  try {
    const { error } = await db.from('departamentos')
      .update({ estado: 'inactivo' }).eq('id', id);
    if (error) throw error;
    await cargarDepartamentos();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'desactivarDepartamento') };
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

  // Distritos. `nombreDistrito` devuelve cadena vacía si el catálogo aún no ha
  // cargado: devolver el id haría que la UI mostrase un número donde espera un
  // topónimo, y que los filtros por nombre casaran contra basura.
  const buscarDistrito = (id) => distritos.value.find((d) => d.id === id) || {};
  const nombreDistrito = (id) => buscarDistrito(id).nombre || '';

  const buscarDireccion = (id) => direcciones.value.find((d) => d.id === id) || {};
  const nombreDireccion = (id) => buscarDireccion(id).nombre || '';

  return {
    tiposDenuncia, departamentos, distritos, direcciones,
    cargandoCatalogos, catalogosEnFallback,
    cargarTipos, cargarDepartamentos, cargarDistritos, cargarDirecciones,
    guardarDepartamento, desactivarDepartamento,
    buscarDireccion, nombreDireccion,
    nombreDeTipo, colorDeTipo, iconoDeTipo, areaDeTipo,
    buscarDepartamento, nombreDepartamento, direccionDepartamento,
    buscarDistrito, nombreDistrito
  };
}
