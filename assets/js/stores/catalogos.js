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
// Prioridades con su SLA (`tiempo_objetivo_horas`). No se cargaban, así que las
// vistas traducían el id a mano —y mal: la bitácora del empleado daba por
// "media" la prioridad 2, que en el catálogo es "Alta".
const prioridades = ref([]);
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
        // `estados_flujo` y `estado_inicial` definen el ciclo de vida de los
        // casos de cada categoría. Sin ellos, las vistas deducían el estado con
        // tablas fijas escritas a mano —y ninguna coincidía con el flujo que
        // siembra migration_v9, así que todo caía en el valor por defecto.
        .select(`id, codigo, nombre, descripcion, color_hex, icono,
                 departamento_responsable_id, prioridad_default_id,
                 estados_flujo, estado_inicial, requiere_ubicacion, activo`)
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
        // Cero filas tiene DOS causas y el mensaje anterior solo nombraba una,
        // mandando a ejecutar una migración que ya estaba aplicada.
        //
        // Una consulta bloqueada por RLS no da error: devuelve una lista
        // vacía, exactamente igual que una tabla sin datos. Y pasa de verdad
        // —el formulario de registro consulta como `anon`, porque quien se
        // registra todavía no tiene cuenta—, que es lo que arregla la v33.
        const { data: { session } } = await db.auth.getSession();
        console.error(
          session
            ? '[catalogos] `distritos` devolvió cero filas con sesión abierta. ' +
              'O la tabla está vacía —ejecuta migration_v11_seed_seguridad_y_catalogos.sql— ' +
              'o la RLS se lo oculta a este usuario.'
            : '[catalogos] `distritos` devolvió cero filas SIN sesión. Lo más ' +
              'probable es la RLS: la policy base solo alcanza a `authenticated`. ' +
              'Ejecuta migration_v33_catalogo_publico_registro.sql, que concede ' +
              'la lectura de los distritos activos al rol `anon`.'
        );
      }
    }
  } catch (e) {
    console.error('[catalogos] Falló la carga de distritos:', e.message);
  } finally {
    cargandoCatalogos.value = false;
  }
}

async function cargarPrioridades() {
  if (!db) return;
  try {
    const { data, error } = await db
      .from('prioridades')
      .select('id, codigo, nombre, nivel, color_hex, tiempo_objetivo_horas')
      .order('nivel');
    if (error) throw error;
    prioridades.value = data || [];
    if (!prioridades.value.length) {
      console.error(
        '[catalogos] `prioridades` está VACÍA. Sin ella no hay SLA ni semáforo, ' +
        'y `casos.prioridad_id` es NOT NULL. Ejecuta migration_v11.'
      );
    }
  } catch (e) {
    console.error('[catalogos] Falló la carga de prioridades:', e.message);
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

  // ── Prioridades ────────────────────────────────────────────────────────
  const buscarPrioridad   = (id) => prioridades.value.find((p) => p.id === id) || {};
  const nombrePrioridad   = (id) => buscarPrioridad(id).nombre || '';
  const codigoPrioridad   = (id) => buscarPrioridad(id).codigo || '';
  const colorPrioridad    = (id) => buscarPrioridad(id).color_hex || '#6b7280';
  // `nivel` va de 1 (Crítica) a 5 (Informativa). Es el criterio de orden del
  // feed operativo, no el id: los ids son de catálogo y podrían reordenarse.
  const nivelPrioridad    = (id) => buscarPrioridad(id).nivel ?? 99;
  const horasObjetivo     = (id) => buscarPrioridad(id).tiempo_objetivo_horas ?? null;

  // ── Flujo de estados ───────────────────────────────────────────────────
  // La verdad está en `categorias_caso.estados_flujo`: cada categoría define su
  // propio ciclo. Las vistas tenían tablas fijas escritas a mano con códigos
  // (`recibida`, `asignada`, `en_atencion`, `cerrada`, `anulada`) que NO
  // existen en el flujo sembrado por migration_v9, así que todo caso caía en el
  // valor por defecto y el estado que veía el empleado era siempre el mismo.
  const flujoDeCategoria = (categoriaId) => {
    const flujo = buscar(categoriaId).estados_flujo;
    return Array.isArray(flujo) ? flujo : [];
  };

  const estadoDelFlujo = (categoriaId, codigo) =>
    flujoDeCategoria(categoriaId).find((e) => e.id === codigo) || null;

  const esEstadoFinal = (categoriaId, codigo) => {
    const estado = estadoDelFlujo(categoriaId, codigo);
    // Sin flujo cargado se usa el final del flujo por defecto de migration_v9.
    if (!estado) return codigo === 'resuelta' || codigo === 'rechazada';
    return estado.es_final === true;
  };

  /**
   * Agrupa el estado real en las tres situaciones que entiende alguien en
   * campo: por hacer, en curso, terminado.
   *
   * No es una simplificación gratuita. El vocabulario completo —"En revisión"
   * frente a "En obra"— es lenguaje del Centro de Monitoreo; a quien está en la
   * calle solo le cambia el comportamiento si el caso sigue abierto o no. El
   * código REAL se conserva aparte y es el que viaja a la base.
   */
  const situacionDeEstado = (categoriaId, codigo) => {
    if (esEstadoFinal(categoriaId, codigo)) return 'completada';
    const inicial = buscar(categoriaId).estado_inicial || 'pendiente';
    return codigo === inicial ? 'pendiente' : 'en_proceso';
  };

  /** Primer estado final declarado por la categoría; 'resuelta' si no hay flujo. */
  const estadoDeCierre = (categoriaId) =>
    flujoDeCategoria(categoriaId).find((e) => e.es_final === true)?.id || 'resuelta';

  return {
    tiposDenuncia, departamentos, distritos, direcciones, prioridades,
    cargandoCatalogos, catalogosEnFallback,
    cargarTipos, cargarDepartamentos, cargarDistritos, cargarDirecciones, cargarPrioridades,
    guardarDepartamento, desactivarDepartamento,
    buscarDireccion, nombreDireccion,
    nombreDeTipo, colorDeTipo, iconoDeTipo, areaDeTipo,
    buscarDepartamento, nombreDepartamento, direccionDepartamento,
    buscarDistrito, nombreDistrito,
    buscarPrioridad, nombrePrioridad, codigoPrioridad, colorPrioridad,
    nivelPrioridad, horasObjetivo,
    flujoDeCategoria, estadoDelFlujo, esEstadoFinal, situacionDeEstado, estadoDeCierre,
  };
}
