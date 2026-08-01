import { ref } from '../core/vue.js';
import { db, crearClienteAislado } from '../core/supabase.js';

const usuarios = ref([]);
const cargandoUsuarios = ref(false);

async function cargarUsuarios() {
  cargandoUsuarios.value = true;
  try {
    if (db) {
      const { data, error } = await db
        .from('usuarios')
        // Todas las columnas de public.usuarios: el formulario de alta y
        // edición las necesita completas para que el administrador no tenga
        // que entrar a Supabase a rellenar lo que falta.
        .select(`
          id,
          username,
          email_institucional,
          nombres,
          apellidos,
          dui,
          telefono,
          foto_perfil_url,
          puesto_cargo,
          departamento_id,
          distrito_id,
          rol_id,
          cuadrilla_id,
          activo,
          created_at,
          updated_at,
          roles ( codigo, nombre ),
          departamentos!usuarios_departamento_id_fkey ( nombre ),
          distritos ( nombre )
        `)
        .order('nombres');
      if (error) throw error;
      if (data) {
        usuarios.value = data.map(u => ({
          id: u.id,
          // `nombre` es el compuesto que consume la tabla; `nombres`/`apellidos`
          // se conservan aparte porque el formulario los edita por separado y
          // partir la cadena por el último espacio destroza apellidos dobles.
          nombre: `${u.nombres} ${u.apellidos}`.trim(),
          nombres: u.nombres || '',
          apellidos: u.apellidos || '',
          username: u.username || '',
          email: u.email_institucional || '',
          dui: u.dui || '',
          telefono: u.telefono || '',
          fotoPerfilUrl: u.foto_perfil_url || '',
          cargo: u.puesto_cargo || '',
          departamento_id: u.departamento_id,
          distrito_id: u.distrito_id,
          rol_id: u.rol_id,
          cuadrilla_id: u.cuadrilla_id,
          rol: u.roles?.codigo || '',
          rolNombre: u.roles?.nombre || '',
          estado: u.activo ? 'activo' : 'inactivo',
          ultimoAcceso: u.updated_at || u.created_at,
          creadoEn: u.created_at,
          departamento: u.departamentos?.nombre || '',
          distrito: u.distritos?.nombre || ''
        }));
      }
    }
  } catch (error) {
    console.error('Error cargando usuarios:', error.message);
  } finally {
    cargandoUsuarios.value = false;
  }
}

// Traduce errores de Postgres a algo accionable por un administrador municipal.
function mensajeDeError(error, contexto) {
  const codigo = error?.code;
  if (codigo === '23505') return 'Ese correo, usuario o DUI ya está registrado.';
  if (codigo === '23503') return 'El rol o departamento seleccionado no existe.';
  if (codigo === '42501' || /row-level security/i.test(error?.message || '')) {
    return 'Tu rol no tiene permiso para modificar usuarios.';
  }
  console.error(`[usuarios] ${contexto}:`, error);
  return error?.message || 'Error desconocido al guardar.';
}

// Campos del perfil. `id` y `email_institucional` quedan fuera a propósito:
// el primero lo fija auth.users y el segundo debe seguirlo, porque cambiarlo
// solo aquí dejaría al usuario sin poder iniciar sesión.
function perfilDesdeFormulario(datos) {
  const vacioANull = (v) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
  };
  return {
    nombres:         String(datos.nombres || '').trim(),
    apellidos:       String(datos.apellidos || '').trim(),
    // `username` y `dui` son UNIQUE: '' colisionaría entre varios usuarios.
    username:        vacioANull(datos.username),
    dui:             vacioANull(datos.dui),
    telefono:        vacioANull(datos.telefono),
    foto_perfil_url: vacioANull(datos.fotoPerfilUrl),
    puesto_cargo:    vacioANull(datos.cargo),
    departamento_id: datos.departamento_id ? Number(datos.departamento_id) : null,
    distrito_id:     datos.distrito_id     ? Number(datos.distrito_id)     : null,
    rol_id:          datos.rol_id          ? Number(datos.rol_id)          : null,
    activo:          datos.estado !== 'inactivo',
  };
}

function validarPerfil(p) {
  if (!p.nombres)   return 'El nombre es obligatorio.';
  if (!p.apellidos) return 'Los apellidos son obligatorios.';
  if (!p.rol_id)    return 'Selecciona el rol del usuario.';
  return null;
}

async function actualizarUsuario(datos) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  if (!datos?.id) return { ok: false, error: 'Falta el identificador del usuario.' };

  const payload = perfilDesdeFormulario(datos);
  const fallo = validarPerfil(payload);
  if (fallo) return { ok: false, error: fallo };
  payload.updated_at = new Date().toISOString();

  try {
    const { error } = await db.from('usuarios').update(payload).eq('id', datos.id);
    if (error) throw error;
    await cargarUsuarios();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'actualizarUsuario') };
  }
}

// ── Alta de usuario ──────────────────────────────────────────
// Dos pasos que NO son una transacción: primero nace la cuenta en auth.users,
// después su perfil en public.usuarios. Si el segundo falla queda una cuenta
// de autenticación sin perfil — se avisa explícitamente para que el
// administrador sepa que debe reintentar con el mismo correo, no crear otro.
//
// Se usa `signUp` sobre un cliente aislado porque `auth.admin.createUser`
// exige la service_role key, que no puede estar en el navegador. La
// contrapartida está documentada en el mensaje de retorno.
async function crearUsuario(datos) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };

  const correo = String(datos.email || '').trim().toLowerCase();
  const clave  = String(datos.password || '');

  if (!correo) return { ok: false, error: 'El correo institucional es obligatorio.' };
  if (clave.length < 8) return { ok: false, error: 'La contraseña inicial debe tener al menos 8 caracteres.' };

  const payload = perfilDesdeFormulario(datos);
  const fallo = validarPerfil(payload);
  if (fallo) return { ok: false, error: fallo };

  const clienteAlta = crearClienteAislado();
  if (!clienteAlta) return { ok: false, error: 'No se pudo inicializar el cliente de alta.' };

  let idNuevo = null;
  try {
    const { data, error } = await clienteAlta.auth.signUp({ email: correo, password: clave });
    if (error) throw error;
    idNuevo = data?.user?.id;
    if (!idNuevo) throw new Error('Supabase Auth no devolvió el identificador del usuario.');
  } catch (e) {
    const yaExiste = /already registered|already been registered|User already/i.test(e.message || '');
    return {
      ok: false,
      error: yaExiste
        ? 'Ya existe una cuenta con ese correo en Supabase Auth.'
        : `No se pudo crear la cuenta de acceso: ${e.message}`,
    };
  } finally {
    // La sesión no se persiste, pero cerrarla libera el token en memoria.
    clienteAlta.auth.signOut().catch(() => {});
  }

  try {
    const { error } = await db.from('usuarios').insert({
      ...payload,
      id: idNuevo,
      email_institucional: correo,
    });
    if (error) throw error;
    await cargarUsuarios();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: mensajeDeError(e, 'crearUsuario') +
        ` — ATENCIÓN: la cuenta de acceso (${correo}) sí se creó. Vuelve a intentarlo ` +
        'con el MISMO correo para completar el perfil; no crees otro usuario.',
    };
  }
}

// ── Ámbitos granulares por usuario (public.usuario_ambitos) ──
// Excepciones individuales al alcance que da el rol. Solo el superadmin puede
// escribirlas (policy `usuario_ambitos_write` de migration_v16).
const ambitosUsuario = ref([]);

async function cargarAmbitos(usuarioId) {
  ambitosUsuario.value = [];
  if (!db || !usuarioId) return;
  try {
    const { data, error } = await db
      .from('usuario_ambitos')
      .select(`
        id, tipo, modo, distrito_id, departamento_id, direccion_id,
        vigente_desde, vigente_hasta, motivo, created_at,
        distritos ( nombre ),
        departamentos ( nombre ),
        direcciones_administrativas ( nombre )
      `)
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    ambitosUsuario.value = data || [];
  } catch (e) {
    console.error('[usuarios] No se pudieron leer los ámbitos:', e.message);
  }
}

// Columna de `usuario_ambitos` que corresponde a cada tipo. `ck_ambito_coherente`
// exige que solo venga poblada esa y las otras dos vayan a NULL.
const COLUMNA_POR_TIPO = {
  distrito: 'distrito_id',
  departamento: 'departamento_id',
  direccion: 'direccion_id',
};

// Aplica un LOTE de ámbitos del mismo tipo y modo.
//
// Semántica de "fijar", no de "añadir": antes de insertar borra lo que hubiera
// para ese usuario, tipo y referencias. Sin esto, marcar Panchimalco como
// concedido y después como denegado dejaría las DOS filas en la tabla, y quién
// gana lo decidiría el orden de evaluación — un permiso indeterminado es peor
// que un permiso equivocado.
async function aplicarAmbitos(usuarioId, lote) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  if (!usuarioId) return { ok: false, error: 'Guarda el usuario antes de asignarle ámbitos.' };

  const columna = COLUMNA_POR_TIPO[lote.tipo];
  if (!columna) return { ok: false, error: 'Tipo de ámbito no reconocido.' };

  const referencias = [...new Set((lote.referencias || []).map(Number).filter(Boolean))];
  if (!referencias.length) return { ok: false, error: 'Selecciona al menos un elemento.' };

  const motivo = String(lote.motivo || '').trim();
  // `motivo` es NOT NULL en la tabla justamente porque esto se audita: una
  // delegación territorial sin justificación es imposible de revisar después.
  if (!motivo) return { ok: false, error: 'El motivo es obligatorio: estas concesiones quedan auditadas.' };

  const modo = lote.modo === 'denegar' ? 'denegar' : 'conceder';
  const vigenteHasta = lote.vigenteHasta ? new Date(lote.vigenteHasta).toISOString() : null;

  try {
    const { data: { session } } = await db.auth.getSession();
    const creadoPor = session?.user?.id || null;

    // 1. Limpiar lo previo para esas mismas referencias.
    const { error: errorBorrado } = await db
      .from('usuario_ambitos')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('tipo', lote.tipo)
      .in(columna, referencias);
    if (errorBorrado) throw errorBorrado;

    // 2. Insertar todas las filas en una sola petición.
    const filas = referencias.map((ref) => ({
      usuario_id: usuarioId,
      tipo: lote.tipo,
      modo,
      distrito_id: null,
      departamento_id: null,
      direccion_id: null,
      [columna]: ref,
      vigente_hasta: vigenteHasta,
      motivo,
      creado_por: creadoPor,
    }));

    const { error } = await db.from('usuario_ambitos').insert(filas);
    if (error) throw error;
    await cargarAmbitos(usuarioId);
    return { ok: true, total: filas.length };
  } catch (e) {
    if (e?.code === '42501' || /row-level security/i.test(e?.message || '')) {
      return { ok: false, error: 'Solo un superadministrador puede asignar ámbitos.' };
    }
    if (e?.code === '23514') {
      return { ok: false, error: 'La vigencia final debe ser posterior a hoy.' };
    }
    return { ok: false, error: mensajeDeError(e, 'aplicarAmbitos') };
  }
}

// Devuelve al alcance heredado del rol: quita la excepción sin sustituirla.
async function restablecerAmbitos(usuarioId, tipo, referencias) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  const columna = COLUMNA_POR_TIPO[tipo];
  const refs = [...new Set((referencias || []).map(Number).filter(Boolean))];
  if (!columna || !refs.length) return { ok: false, error: 'Selecciona al menos un elemento.' };
  try {
    const { error } = await db
      .from('usuario_ambitos')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('tipo', tipo)
      .in(columna, refs);
    if (error) throw error;
    await cargarAmbitos(usuarioId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'restablecerAmbitos') };
  }
}

async function eliminarAmbito(id, usuarioId) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  try {
    const { error } = await db.from('usuario_ambitos').delete().eq('id', id);
    if (error) throw error;
    await cargarAmbitos(usuarioId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'eliminarAmbito') };
  }
}

// Baja lógica. Borrar la fila haría cascade sobre `auth.users` y dejaría casos
// históricos con `usuario_responsable_id` colgando.
async function desactivarUsuario(id) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  try {
    const { error } = await db.from('usuarios')
      .update({ activo: false, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await cargarUsuarios();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'desactivarUsuario') };
  }
}

export function useUsuarios() {
  return {
    usuarios,
    cargandoUsuarios,
    cargarUsuarios,
    crearUsuario,
    actualizarUsuario,
    desactivarUsuario,
    ambitosUsuario, cargarAmbitos, aplicarAmbitos, restablecerAmbitos, eliminarAmbito,
  };
}
