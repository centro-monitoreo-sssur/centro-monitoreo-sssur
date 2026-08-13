// ============================================================
// STORE: el ciudadano autenticado — su alta y su ficha
//
// El portal de Población funcionaba sobre `localStorage`: el «registro»
// escribía un objeto y `ciudadano_autenticado` era un booleano que cualquiera
// ponía a `true` desde la consola del navegador. Esto lo sustituye por cuentas
// reales de Supabase Auth.
//
// ── QUÉ HACE Y QUÉ NO ───────────────────────────────────────────────────────
// Se ocupa de lo que es PROPIO del ciudadano: darse de alta y mantener su
// ficha. El inicio y el cierre de sesión NO están aquí: los resuelve
// `stores/navegacion.js` con `signInWithPassword`, que es el mismo mecanismo
// para todo el mundo. Duplicarlo daría dos sitios donde arreglar el mismo fallo.
//
// (El plan lo llamaba `sesion-ciudadano.js`; el nombre se cambió al ver que la
// sesión ya estaba resuelta y aquí solo queda el alta y el perfil.)
//
// ── POR QUÉ EL ALTA VA POR METADATOS Y NO POR UN INSERT ─────────────────────
// La ficha en `ciudadanos` la crea el trigger `trg_crear_ciudadano_al_registrarse`
// de la v32, dentro de la MISMA transacción que `auth.users`. Aquí solo se
// mandan los datos en `options.data`, que es lo que el trigger lee de
// `raw_user_meta_data`.
//
// Insertar la fila desde el navegador después del `signUp` dejaría una ventana
// con cuenta creada y perfil no; y esa cuenta huérfana ocupa el correo, así que
// reintentar el registro fallaría con «ya existe» sin salida posible.
//
// El contrato de metadatos lo fija la v32. Si se toca aquí, hay que tocarlo allí.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

// ── Estado ──────────────────────────────────────────────────────────────────

const perfil = ref(null);
const cargandoPerfil = ref(false);
const errorPerfil = ref('');

/** Correo de la cuenta. Vive en `auth.users`, no en `ciudadanos`: ver v32. */
const correoCuenta = ref('');

const nombreCompleto = computed(() => {
  if (!perfil.value) return '';
  return [perfil.value.nombres, perfil.value.apellidos].filter(Boolean).join(' ').trim();
});

// Columnas que se leen de la ficha. Se enumeran en lugar de `select('*')` para
// que añadir una columna a la tabla no cambie en silencio lo que viaja al
// navegador de un vecino.
const COLUMNAS_FICHA = `
  id, dui, nombres, apellidos, telefono, direccion,
  distrito_id, fecha_nacimiento, genero, foto_url, activo, created_at
`;

// ── Alta ────────────────────────────────────────────────────────────────────

/**
 * ¿Hay ya una ficha con este DUI?
 *
 * Se pregunta a la base porque el navegador NO puede saberlo: la RLS oculta
 * las fichas ajenas. Sin esta comprobación previa, un DUI repetido solo se
 * detecta cuando el trigger aborta, y GoTrue traduce cualquier excepción a un
 * genérico «Database error saving new user» que no le dice nada al vecino.
 *
 * Ante un fallo de red devuelve `true` (disponible) a propósito: bloquear un
 * registro legítimo por no poder comprobarlo es peor que dejar que siga y que
 * decida el UNIQUE de la columna, que es la garantía real.
 */
async function duiDisponible(dui) {
  if (!db) return true;
  try {
    const { data, error } = await db.rpc('dui_ciudadano_disponible', { p_dui: dui });
    if (error) throw error;
    return data !== false;
  } catch (e) {
    console.warn('[ciudadano] No se pudo comprobar el DUI:', e.message);
    return true;
  }
}

/**
 * Crea la cuenta y, con ella, la ficha.
 *
 * @returns {{ok: boolean, error?: string, requiereConfirmacion?: boolean}}
 *   `requiereConfirmacion` es true cuando Supabase creó la cuenta pero no
 *   devolvió sesión, que es lo que ocurre con la confirmación por correo
 *   activada. La pantalla debe decirlo en vez de intentar entrar.
 */
async function registrar(datos) {
  if (!db) return { ok: false, error: 'Sin conexión con el servidor.' };

  const correo = String(datos.correo || '').trim().toLowerCase();
  const clave  = String(datos.clave || '');
  const dui    = String(datos.dui || '').trim();

  if (!correo) return { ok: false, error: 'El correo es obligatorio.' };
  if (clave.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  }

  if (!(await duiDisponible(dui))) {
    return {
      ok: false,
      error: 'Ya existe un registro con ese DUI. Si es el tuyo y no recuerdas '
           + 'el correo, acude a la Alcaldía para recuperarlo.',
    };
  }

  // `perfil: 'ciudadano'` es lo que distingue esta alta de la de un empleado:
  // el alta de personal también usa `signUp` y pasa por el mismo trigger. Sin
  // esta marca, el trigger la ignora y la cuenta queda sin ficha.
  const metadatos = {
    perfil: 'ciudadano',
    nombres:          String(datos.nombres || '').trim(),
    apellidos:        String(datos.apellidos || '').trim(),
    dui,
    telefono:         String(datos.telefono || '').trim(),
    direccion:        String(datos.direccion || '').trim(),
    genero:           String(datos.genero || '').trim(),
    distrito_id:      datos.distritoId != null ? String(datos.distritoId) : '',
    fecha_nacimiento: String(datos.fechaNacimiento || '').trim(),
  };

  try {
    const { data, error } = await db.auth.signUp({
      email: correo,
      password: clave,
      options: { data: metadatos },
    });
    if (error) throw error;

    // Sin sesión, la cuenta existe pero está pendiente de confirmar el correo.
    return { ok: true, requiereConfirmacion: !data?.session };
  } catch (e) {
    return { ok: false, error: traducirErrorAlta(e) };
  }
}

/**
 * Traduce los errores de GoTrue a algo que un vecino pueda entender y corregir.
 *
 * GoTrue envuelve CUALQUIER excepción del trigger en «Database error saving new
 * user», así que los mensajes concretos que levanta la v32 no llegan hasta
 * aquí. Se cubre lo que el vecino sí puede arreglar y, para el resto, se dice
 * que faltan datos en vez de mostrar el texto crudo.
 */
function traducirErrorAlta(e) {
  const texto = String(e?.message || '');

  if (/already registered|already been registered|User already/i.test(texto)) {
    return 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.';
  }
  if (/rate limit|too many/i.test(texto)) {
    return 'Se han hecho demasiados intentos. Espera unos minutos.';
  }
  if (/password/i.test(texto)) {
    return 'La contraseña no cumple los requisitos mínimos.';
  }
  if (/Database error/i.test(texto)) {
    return 'No se pudo completar el registro: revisa que el DUI, la fecha de '
         + 'nacimiento y el distrito sean correctos.';
  }
  return `No se pudo completar el registro: ${texto}`;
}

// ── Ficha ───────────────────────────────────────────────────────────────────

/**
 * Lee la ficha del ciudadano con sesión abierta.
 *
 * `maybeSingle` y no `single`: sobre cero filas, `single` responde HTTP 406 y
 * la pantalla mostraría un error donde lo correcto es «no hay ficha». Pasa de
 * verdad —una cuenta de empleado abriendo el portal—, y ahí `perfil` debe
 * quedar en null, no reventar.
 */
async function cargarPerfil() {
  if (!db) return { ok: false, error: 'Sin conexión con el servidor.' };

  cargandoPerfil.value = true;
  errorPerfil.value = '';
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
      perfil.value = null;
      correoCuenta.value = '';
      return { ok: false, error: 'No hay sesión abierta.' };
    }

    // El correo sale de la cuenta, que es su fuente de verdad. No se duplica
    // en `ciudadanos` justamente para que no puedan discrepar (ver v32).
    correoCuenta.value = user.email || '';

    const { data, error } = await db
      .from('ciudadanos')
      .select(COLUMNAS_FICHA)
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;

    perfil.value = data || null;
    return { ok: true, hayFicha: Boolean(data) };
  } catch (e) {
    errorPerfil.value = e.message;
    perfil.value = null;
    console.error('[ciudadano] Falló la carga de la ficha:', e.message);
    return { ok: false, error: e.message };
  } finally {
    cargandoPerfil.value = false;
  }
}

/**
 * Actualiza lo que el ciudadano sí puede cambiar de su ficha.
 *
 * La lista blanca está aquí Y en el trigger `fn_protege_ficha_ciudadano` de la
 * v32. Duplicada a propósito: esta evita mandar campos que se van a ignorar; la
 * del servidor es la que manda, porque el navegador es del vecino.
 *
 * Nombres, DUI y fecha de nacimiento no están: los corrige TI desde el panel,
 * que es la política acordada.
 */
const CAMPOS_EDITABLES = ['telefono', 'direccion', 'distrito_id', 'genero', 'foto_url'];

async function actualizarPerfil(cambios) {
  if (!db) return { ok: false, error: 'Sin conexión con el servidor.' };
  if (!perfil.value?.id) return { ok: false, error: 'No hay ficha cargada.' };

  const payload = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in cambios) payload[campo] = cambios[campo];
  }
  if (!Object.keys(payload).length) return { ok: true, sinCambios: true };

  try {
    // `select()` de vuelta para comprobar que la fila se tocó de verdad: una
    // escritura denegada por RLS responde 200 con CERO filas, sin error. Sin
    // esta comprobación, la interfaz diría «guardado» sin haber guardado nada.
    const { data, error } = await db
      .from('ciudadanos')
      .update(payload)
      .eq('id', perfil.value.id)
      .select(COLUMNAS_FICHA);
    if (error) throw error;

    if (!data || !data.length) {
      return {
        ok: false,
        error: 'No se guardaron los cambios. Puede que tu cuenta esté '
             + 'desactivada; consulta con la Alcaldía.',
      };
    }

    perfil.value = data[0];
    return { ok: true };
  } catch (e) {
    console.error('[ciudadano] Falló la actualización de la ficha:', e.message);
    return { ok: false, error: e.message };
  }
}

/** Envía el correo de recuperación de contraseña. */
async function recuperarContrasena(correo) {
  if (!db) return { ok: false, error: 'Sin conexión con el servidor.' };
  const destino = String(correo || '').trim().toLowerCase();
  if (!destino) return { ok: false, error: 'Escribe tu correo.' };

  try {
    const { error } = await db.auth.resetPasswordForEmail(destino, {
      // Vuelve al portal ciudadano y no a la raíz, que es el Centro de
      // Monitoreo: aterrizar ahí confundiría a cualquiera.
      redirectTo: `${window.location.origin}/ciudadano/`,
    });
    if (error) throw error;
    // Se responde igual exista o no la cuenta: decir «ese correo no está
    // registrado» permitiría averiguar quién tiene cuenta y quién no.
    return { ok: true };
  } catch (e) {
    console.error('[ciudadano] Falló el envío de recuperación:', e.message);
    return { ok: true };
  }
}

function limpiarFicha() {
  perfil.value = null;
  correoCuenta.value = '';
  errorPerfil.value = '';
}

export function useCiudadano() {
  return {
    perfil, cargandoPerfil, errorPerfil, correoCuenta, nombreCompleto,
    registrar, duiDisponible,
    cargarPerfil, actualizarPerfil, limpiarFicha,
    recuperarContrasena,
    CAMPOS_EDITABLES,
  };
}
