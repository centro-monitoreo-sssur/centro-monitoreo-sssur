// ============================================================
// STORE: cuadrillas de campo y su composición
//
// Las tablas `cuadrillas` y `cuadrilla_integrantes` existen desde schema.sql y
// migration_v10 les puso RLS, pero nunca hubo frontend: se construyó la
// cerradura y no la puerta. Este store es la puerta.
//
// ── DÓNDE ESTÁ LA VERDAD DE LA PERTENENCIA ──────────────────────────────────
// En `cuadrilla_integrantes`. Es lo que leen las funciones de seguridad
// `auth_cuadrillas_del_usuario()` (v16) y `auth_caso_en_mi_ambito()` (v14), así
// que es lo que decide qué casos ve un empleado.
//
// `usuarios.cuadrilla_id` es una denormalización heredada de schema.sql:147 que
// NINGUNA policy consulta. Se mantiene sincronizada aquí para que la pantalla de
// Usuarios no contradiga a la de Cuadrillas, pero no manda. Cuando alguien
// pertenece a más de una cuadrilla la columna solo puede guardar una —la última
// asignada—, y esa pérdida es inherente a la columna, no a este código.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const cuadrillas = ref([]);
const personal = ref([]);          // usuarios activos, para el selector de integrantes
const cargando = ref(false);
const guardando = ref(false);
const error = ref('');

// Índice usuario → cuadrillas a las que pertenece. Se reconstruye en cada carga
// y evita recorrer todas las cuadrillas por cada fila del selector: con ~200
// empleados y ~20 cuadrillas, la búsqueda lineal se notaría al escribir.
const cuadrillasPorUsuario = ref(new Map());

/** Traduce errores de Postgres a algo accionable por quien administra. */
function mensajeDeError(e, contexto) {
  const codigo = e?.code;
  const texto = e?.message || '';

  if (codigo === '23505') return 'Ya existe una cuadrilla con ese código.';
  if (codigo === '23503') {
    return 'No se puede eliminar: hay casos asignados a esta cuadrilla. ' +
           'Desactívala en lugar de borrarla para conservar el historial.';
  }
  if (codigo === '23514') return 'Algún campo no cumple las validaciones de la base.';
  if (codigo === '42501' || /row-level security/i.test(texto)) {
    return 'Tu rol no tiene permiso para modificar cuadrillas.';
  }
  console.error(`[cuadrillas] ${contexto}:`, e);
  return texto || 'Error desconocido al guardar.';
}

/**
 * Una escritura bloqueada por RLS no lanza excepción: PostgREST responde 200 y
 * cero filas. Sin comprobarlo, la interfaz diría «guardado» sin haber guardado.
 */
function verificarAfectadas(data, accion) {
  if (Array.isArray(data) && data.length === 0) {
    return {
      ok: false,
      error: `La base aceptó la petición pero no ${accion} ninguna fila. ` +
             'Suele significar que tu rol no tiene permiso de edición sobre ' +
             'cuadrillas, o que falta aplicar migration_v10_policies_faltantes.sql.',
    };
  }
  return { ok: true };
}

/** Nombre presentable de un usuario, con respaldos si faltan los nombres. */
function nombreDePersona(u) {
  const completo = [u?.nombres, u?.apellidos].filter(Boolean).join(' ').trim();
  return completo || u?.username || u?.email_institucional || 'Sin nombre';
}

// ── Carga ────────────────────────────────────────────────────────────────────

/**
 * Trae cuadrillas, su composición y el personal en TRES consultas, no en una
 * por cuadrilla. El cruce se hace en cliente con `Map`, O(n+m).
 *
 * Los integrantes vienen anidados por la FK (`cuadrilla_integrantes(...)`), pero
 * los nombres NO se piden en ese anidamiento: `cuadrilla_integrantes` referencia
 * `usuarios`, y pedir el join anidado obligaría a PostgREST a resolver la misma
 * fila de usuario tantas veces como cuadrillas la contengan. Se traen una vez y
 * se resuelven aquí.
 */
async function cargarCuadrillas() {
  if (!db) { error.value = 'Sin conexión a la base de datos.'; return; }
  cargando.value = true;
  error.value = '';
  try {
    const [resCuadrillas, resIntegrantes, resPersonal] = await Promise.all([
      db.from('cuadrillas')
        .select('id, departamento_id, codigo, nombre, activo, created_at')
        .order('nombre'),
      db.from('cuadrilla_integrantes')
        .select('cuadrilla_id, usuario_id, es_lider, assigned_at'),
      db.from('usuarios')
        .select('id, nombres, apellidos, username, email_institucional, ' +
                'puesto_cargo, departamento_id, distrito_id, rol_id, cuadrilla_id, activo')
        .eq('activo', true)
        .order('apellidos'),
    ]);

    if (resCuadrillas.error) throw resCuadrillas.error;
    if (resIntegrantes.error) throw resIntegrantes.error;

    personal.value = (resPersonal.data || []).map((u) => ({
      ...u, nombreCompleto: nombreDePersona(u),
    }));

    const porId = new Map(personal.value.map((u) => [u.id, u]));

    // Agrupar integrantes por cuadrilla en una sola pasada.
    const porCuadrilla = new Map();
    const porUsuario = new Map();
    for (const fila of resIntegrantes.data || []) {
      const persona = porId.get(fila.usuario_id);
      const integrante = {
        usuarioId: fila.usuario_id,
        esLider: fila.es_lider,
        desde: fila.assigned_at,
        // Un integrante dado de baja como usuario sigue en la tabla puente. Se
        // muestra igualmente y marcado: ocultarlo dejaría una cuadrilla que
        // parece incompleta sin decir por qué.
        nombre: persona ? persona.nombreCompleto : 'Usuario inactivo o sin acceso',
        puesto: persona?.puesto_cargo || '',
        activo: !!persona,
      };
      if (!porCuadrilla.has(fila.cuadrilla_id)) porCuadrilla.set(fila.cuadrilla_id, []);
      porCuadrilla.get(fila.cuadrilla_id).push(integrante);

      if (!porUsuario.has(fila.usuario_id)) porUsuario.set(fila.usuario_id, []);
      porUsuario.get(fila.usuario_id).push(fila.cuadrilla_id);
    }
    cuadrillasPorUsuario.value = porUsuario;

    cuadrillas.value = (resCuadrillas.data || []).map((c) => {
      const integrantes = porCuadrilla.get(c.id) || [];
      // El líder primero: es a quien se llama por radio.
      integrantes.sort((a, b) => (b.esLider - a.esLider) || a.nombre.localeCompare(b.nombre, 'es'));
      return {
        ...c,
        integrantes,
        totalIntegrantes: integrantes.length,
        lider: integrantes.find((i) => i.esLider) || null,
      };
    });
  } catch (e) {
    error.value = mensajeDeError(e, 'cargarCuadrillas');
    cuadrillas.value = [];
  } finally {
    cargando.value = false;
  }
}

// ── Cuadrillas ───────────────────────────────────────────────────────────────

/** Alta o edición. Devuelve `{ ok }` o `{ ok:false, error }`. */
async function guardarCuadrilla(datos) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };

  const codigo = (datos.codigo || '').trim().toUpperCase();
  const nombre = (datos.nombre || '').trim();
  if (!codigo) return { ok: false, error: 'El código es obligatorio.' };
  if (!nombre) return { ok: false, error: 'El nombre es obligatorio.' };
  if (!datos.departamento_id) {
    return { ok: false, error: 'Elige el departamento al que pertenece la cuadrilla.' };
  }

  guardando.value = true;
  error.value = '';
  try {
    const payload = {
      codigo,
      nombre,
      departamento_id: Number(datos.departamento_id),
      activo: datos.activo !== false,
    };

    const { data, error: err } = datos.id
      ? await db.from('cuadrillas').update(payload).eq('id', datos.id).select()
      : await db.from('cuadrillas').insert(payload).select();

    if (err) throw err;
    const verificado = verificarAfectadas(data, datos.id ? 'actualizó' : 'insertó');
    if (!verificado.ok) return verificado;

    await cargarCuadrillas();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'guardarCuadrilla') };
  } finally {
    guardando.value = false;
  }
}

/**
 * Activar o desactivar. No se borra: `casos.cuadrilla_responsable_id` apunta
 * aquí, y borrar una cuadrilla dejaría casos históricos sin poder decir quién
 * los atendió. Una cuadrilla desactivada deja de ofrecerse para asignar y
 * conserva su historial.
 */
async function fijarActivo(id, activo) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('cuadrillas').update({ activo }).eq('id', id).select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'actualizó');
    if (!verificado.ok) return verificado;

    const fila = cuadrillas.value.find((c) => c.id === id);
    if (fila) fila.activo = activo;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'fijarActivo') };
  } finally {
    guardando.value = false;
  }
}

// ── Composición ──────────────────────────────────────────────────────────────

/**
 * Refleja la pertenencia en `usuarios.cuadrilla_id`.
 *
 * Es un espejo, no la verdad: ver la cabecera del archivo. Su fallo NO invalida
 * la operación —un `jefe_area` puede tener permiso sobre cuadrillas y no sobre
 * usuarios, en cuyo caso esta escritura afecta a cero filas—, así que se ignora
 * en silencio y solo se deja rastro en consola.
 */
async function espejarEnUsuario(usuarioId, cuadrillaId) {
  try {
    const { error: err } = await db
      .from('usuarios').update({ cuadrilla_id: cuadrillaId }).eq('id', usuarioId);
    if (err) console.warn('[cuadrillas] No se pudo espejar usuarios.cuadrilla_id:', err.message);
  } catch (e) {
    console.warn('[cuadrillas] No se pudo espejar usuarios.cuadrilla_id:', e.message);
  }
}

/**
 * Añade a alguien a una cuadrilla.
 *
 * Se usa `upsert` y no `insert` porque la clave primaria es
 * (cuadrilla_id, usuario_id): reañadir a quien ya está debe ser inofensivo, no
 * un error 23505 en la cara del administrador.
 */
async function agregarIntegrante(cuadrillaId, usuarioId, esLider = false) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  if (!cuadrillaId || !usuarioId) return { ok: false, error: 'Falta la cuadrilla o la persona.' };

  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('cuadrilla_integrantes')
      .upsert({ cuadrilla_id: cuadrillaId, usuario_id: usuarioId, es_lider: !!esLider },
              { onConflict: 'cuadrilla_id,usuario_id' })
      .select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'insertó');
    if (!verificado.ok) return verificado;

    await espejarEnUsuario(usuarioId, cuadrillaId);
    await cargarCuadrillas();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'agregarIntegrante') };
  } finally {
    guardando.value = false;
  }
}

/** Saca a alguien de una cuadrilla. */
async function quitarIntegrante(cuadrillaId, usuarioId) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('cuadrilla_integrantes')
      .delete()
      .eq('cuadrilla_id', cuadrillaId)
      .eq('usuario_id', usuarioId)
      .select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'eliminó');
    if (!verificado.ok) return verificado;

    // El espejo apunta a otra cuadrilla que le quede, o se limpia. Sin esto, la
    // ficha del usuario seguiría mostrando una cuadrilla de la que ya salió.
    const restantes = (cuadrillasPorUsuario.value.get(usuarioId) || [])
      .filter((id) => id !== cuadrillaId);
    await espejarEnUsuario(usuarioId, restantes[0] ?? null);

    await cargarCuadrillas();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'quitarIntegrante') };
  } finally {
    guardando.value = false;
  }
}

/**
 * Nombra o releva al líder.
 *
 * El liderazgo es único por cuadrilla: al nombrar uno nuevo se retira al
 * anterior en la misma operación. La tabla no lo impone —no hay índice único
 * parcial sobre (cuadrilla_id) where es_lider—, así que lo garantiza este
 * código. Es una regla que conviene subir a la base cuando haya otra migración.
 */
async function fijarLider(cuadrillaId, usuarioId, esLider) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  guardando.value = true;
  try {
    if (esLider) {
      const { error: errPrevio } = await db
        .from('cuadrilla_integrantes')
        .update({ es_lider: false })
        .eq('cuadrilla_id', cuadrillaId)
        .eq('es_lider', true);
      if (errPrevio) throw errPrevio;
    }

    const { data, error: err } = await db
      .from('cuadrilla_integrantes')
      .update({ es_lider: !!esLider })
      .eq('cuadrilla_id', cuadrillaId)
      .eq('usuario_id', usuarioId)
      .select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'actualizó');
    if (!verificado.ok) return verificado;

    await cargarCuadrillas();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'fijarLider') };
  } finally {
    guardando.value = false;
  }
}

// ── API del store ────────────────────────────────────────────────────────────

export function useCuadrillas() {
  const totalCuadrillas = computed(() => cuadrillas.value.length);
  const cuadrillasActivas = computed(() => cuadrillas.value.filter((c) => c.activo).length);
  const cuadrillasSinLider = computed(() =>
    cuadrillas.value.filter((c) => c.activo && !c.lider).length
  );
  const personalAsignado = computed(() => cuadrillasPorUsuario.value.size);

  /** Cuadrillas activas, para los selectores de asignación de casos. */
  const cuadrillasAsignables = computed(() => cuadrillas.value.filter((c) => c.activo));

  /** A qué cuadrillas pertenece alguien. Lectura O(1) sobre el índice. */
  const cuadrillasDe = (usuarioId) => cuadrillasPorUsuario.value.get(usuarioId) || [];

  return {
    // Estado
    cuadrillas, personal, cargando, guardando, error,
    // Derivados
    totalCuadrillas, cuadrillasActivas, cuadrillasSinLider, personalAsignado,
    cuadrillasAsignables, cuadrillasDe,
    // Acciones
    cargarCuadrillas, guardarCuadrilla, fijarActivo,
    agregarIntegrante, quitarIntegrante, fijarLider,
  };
}
