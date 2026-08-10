// ============================================================
// STORE: roles, módulos y matriz de permisos
//
// La pantalla de Roles era de solo lectura porque `roles`, `permisos_modulos`
// y `roles_permisos` tienen RLS activo y SOLO políticas de SELECT: cualquier
// escritura se deniega. `database/migration_v22_gestion_roles.sql` añade las
// políticas que faltan, restringidas a `superadmin`.
//
// Sin esa migración aplicada, todo lo de aquí devolverá "Tu rol no tiene
// permiso para esta operación" — que es la verdad, aunque el motivo real sea
// que la policy no existe todavía.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const roles = ref([]);
const modulos = ref([]);
const rolesPermisos = ref([]);
const usuariosPorRol = ref(new Map());
const cargando = ref(false);
const guardando = ref(false);
const error = ref('');

// La matriz visual habla de leer / escribir / borrar / exportar; la tabla
// guarda bits CRUD. Este es el puente entre ambos vocabularios: "escribir"
// abarca crear y editar, que en esta aplicación nunca se conceden por separado.
export const COLUMNAS_POR_ACCION = Object.freeze({
  leer:     ['ver'],
  escribir: ['crear', 'editar'],
  borrar:   ['borrar'],
  exportar: ['exportar'],
});

export const ACCIONES = Object.freeze(Object.keys(COLUMNAS_POR_ACCION));

/** Traduce errores de Postgres a algo accionable por un administrador. */
function mensajeDeError(e, contexto) {
  const codigo = e?.code;
  const texto = e?.message || '';

  if (codigo === '23505') return 'Ya existe un rol con ese código o ese nombre.';
  if (codigo === '23503') {
    return 'No se puede eliminar: hay usuarios asignados a este rol. ' +
           'Reasígnalos a otro rol antes de borrarlo.';
  }
  if (codigo === '23514') return 'Algún campo no cumple las validaciones de la base.';
  // El trigger de v22 usa restrict_violation con un mensaje ya redactado para
  // el usuario; se muestra tal cual en lugar de sustituirlo por uno genérico.
  if (codigo === '2BP01' || codigo === '23001') return texto;
  if (codigo === '42501' || /row-level security/i.test(texto)) {
    return 'Tu rol no tiene permiso para esta operación. La gestión de roles ' +
           'está reservada al superadministrador.';
  }
  console.error(`[roles] ${contexto}:`, e);
  return texto || 'Error desconocido al guardar.';
}

/**
 * Una escritura bloqueada por RLS no lanza excepción: PostgREST responde 200 y
 * cero filas. Sin comprobarlo, la UI diría "guardado" sin haber guardado nada
 * — que es exactamente cómo se percibía este módulo antes.
 */
function verificarAfectadas(data, accion) {
  if (Array.isArray(data) && data.length === 0) {
    return {
      ok: false,
      error: `La base aceptó la petición pero no ${accion} ninguna fila. ` +
             'Suele significar que falta aplicar migration_v22_gestion_roles.sql ' +
             'o que tu usuario no tiene el rol superadmin.',
    };
  }
  return { ok: true };
}

async function cargarTodo() {
  if (!db) { error.value = 'Sin conexión a la base de datos.'; return; }
  cargando.value = true;
  error.value = '';
  try {
    const [resRoles, resModulos, resPermisos, resUsuarios] = await Promise.all([
      db.from('roles').select('*').order('id'),
      db.from('permisos_modulos').select('*').eq('activo', true).order('id'),
      db.from('roles_permisos').select('*'),
      db.from('usuarios').select('rol_id').eq('activo', true),
    ]);

    if (resRoles.error) throw resRoles.error;

    const cuenta = new Map();
    for (const u of resUsuarios.data || []) {
      cuenta.set(u.rol_id, (cuenta.get(u.rol_id) || 0) + 1);
    }
    usuariosPorRol.value = cuenta;

    roles.value = resRoles.data || [];
    // `dbId` conserva el id numérico: roles_permisos referencia
    // permisos_modulos por id, no por código.
    modulos.value = (resModulos.data || []).map((m) => ({
      id: m.codigo_modulo, dbId: m.id, label: m.nombre_modulo, descripcion: m.descripcion,
    }));
    rolesPermisos.value = resPermisos.data || [];

    if (!roles.value.length) {
      error.value = 'La tabla `roles` está vacía. Ejecuta migration_v11 y migration_v13.';
    } else if (!modulos.value.length) {
      error.value = 'La tabla `permisos_modulos` está vacía: sin módulos no hay matriz que editar. Ejecuta migration_v11.';
    }
  } catch (e) {
    error.value = mensajeDeError(e, 'cargarTodo');
    roles.value = [];
    modulos.value = [];
    rolesPermisos.value = [];
  } finally {
    cargando.value = false;
  }
}

// ── Roles ────────────────────────────────────────────────────────────────────

async function guardarRol(rol) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };

  const payload = {
    codigo: (rol.codigo || '').trim().toLowerCase(),
    nombre: (rol.nombre || '').trim(),
    descripcion: (rol.descripcion || '').trim() || null,
    activo: rol.activo !== false,
  };

  if (!payload.codigo) return { ok: false, error: 'El código es obligatorio.' };
  if (!/^[a-z][a-z0-9_]*$/.test(payload.codigo)) {
    return {
      ok: false,
      error: 'El código solo admite minúsculas, números y guion bajo, y debe ' +
             'empezar por letra (ej. jefe_distrito). Es el identificador que ' +
             'usan las políticas de la base, no una etiqueta visible.',
    };
  }
  if (!payload.nombre) return { ok: false, error: 'El nombre es obligatorio.' };

  guardando.value = true;
  try {
    // `.select()` al final es lo que permite contar filas afectadas y detectar
    // el bloqueo silencioso por RLS.
    const { data, error: err } = rol.id
      ? await db.from('roles').update(payload).eq('id', rol.id).select()
      : await db.from('roles').insert(payload).select();
    if (err) throw err;

    const comprobacion = verificarAfectadas(data, rol.id ? 'actualizó' : 'insertó');
    if (!comprobacion.ok) return comprobacion;

    await cargarTodo();
    return { ok: true, rol: data[0] };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'guardarRol') };
  } finally {
    guardando.value = false;
  }
}

async function eliminarRol(id) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  guardando.value = true;
  try {
    const { data, error: err } = await db.from('roles').delete().eq('id', id).select();
    if (err) throw err;

    const comprobacion = verificarAfectadas(data, 'eliminó');
    if (!comprobacion.ok) return comprobacion;

    await cargarTodo();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'eliminarRol') };
  } finally {
    guardando.value = false;
  }
}

// ── Matriz de permisos ───────────────────────────────────────────────────────

/** Fila de roles_permisos para un rol y un módulo, o null. */
function filaPermiso(rolId, moduloDbId) {
  return rolesPermisos.value.find(
    (p) => p.rol_id === rolId && p.permiso_modulo_id === moduloDbId
  ) || null;
}

/** ¿El rol tiene concedida esta acción sobre este módulo? */
function tienePermiso(rolId, moduloDbId, accion) {
  const fila = filaPermiso(rolId, moduloDbId);
  if (!fila) return false;
  return (COLUMNAS_POR_ACCION[accion] || []).some((col) => fila[col] === true);
}

/**
 * Concede o revoca una acción y lo persiste con upsert.
 *
 * Se guarda casilla por casilla, sin botón "Guardar cambios", porque un
 * borrador de permisos sin aplicar es peligroso: quien lo deja a medias cree
 * haber restringido un acceso que sigue abierto.
 */
async function fijarPermiso(rolId, moduloDbId, accion, valor) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };

  const columnas = COLUMNAS_POR_ACCION[accion] || [];
  if (!columnas.length) return { ok: false, error: 'Acción desconocida: ' + accion };

  const actual = filaPermiso(rolId, moduloDbId);
  const payload = {
    rol_id: rolId,
    permiso_modulo_id: moduloDbId,
    ver:      actual?.ver      ?? false,
    crear:    actual?.crear    ?? false,
    editar:   actual?.editar   ?? false,
    borrar:   actual?.borrar   ?? false,
    exportar: actual?.exportar ?? false,
  };
  columnas.forEach((col) => { payload[col] = valor; });

  // Quitar la lectura deja el resto de acciones sin sentido: no se puede editar
  // lo que no se puede abrir. Se revocan juntas para que la matriz no muestre
  // combinaciones que la aplicación no sabe representar.
  if (accion === 'leer' && valor === false) {
    payload.crear = payload.editar = payload.borrar = payload.exportar = false;
  }
  // Y al revés: conceder cualquier acción implica poder ver el módulo.
  if (accion !== 'leer' && valor === true) payload.ver = true;

  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('roles_permisos')
      .upsert(payload, { onConflict: 'rol_id,permiso_modulo_id' })
      .select();
    if (err) throw err;

    const comprobacion = verificarAfectadas(data, 'guardó');
    if (!comprobacion.ok) return comprobacion;

    // Actualización local en vez de recargar toda la matriz: son hasta 9
    // módulos × 6 roles y recargar en cada clic haría la edición lenta.
    const guardada = data[0];
    const i = rolesPermisos.value.findIndex(
      (p) => p.rol_id === rolId && p.permiso_modulo_id === moduloDbId
    );
    if (i === -1) rolesPermisos.value = [...rolesPermisos.value, guardada];
    else rolesPermisos.value = rolesPermisos.value.map((p, k) => (k === i ? guardada : p));

    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'fijarPermiso') };
  } finally {
    guardando.value = false;
  }
}

export function useRoles() {
  const rolesActivos = computed(() => roles.value.filter((r) => r.activo !== false));
  const conteoDeRol = (id) => usuariosPorRol.value.get(id) || 0;

  return {
    roles, rolesActivos, modulos, rolesPermisos,
    cargando, guardando, error,
    cargarTodo, guardarRol, eliminarRol,
    tienePermiso, fijarPermiso, filaPermiso, conteoDeRol,
    ACCIONES, COLUMNAS_POR_ACCION,
  };
}
