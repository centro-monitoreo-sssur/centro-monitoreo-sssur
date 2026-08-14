// ============================================================
// STORE: publicación de comunicados (Centro de Monitoreo)
//
// El lado editor de `public.noticias`. El lado lector es
// `stores/comunicados.js`, que usan las dos PWA.
//
// ── POR QUÉ NO SE REUSA `stores/comunicados.js` ─────────────────────────────
// Porque leen cosas distintas. El store de las PWA solo ve lo que la RLS le
// deja —lo vigente y de su audiencia— y eso es justo lo que un editor NO puede
// usar: necesita ver también lo caducado, lo programado y lo desactivado, o no
// podría corregirlo. Compartir el store obligaría a un parámetro «tráemelo todo»
// que en la PWA no debería existir.
//
// ── QUIÉN PUEDE ESCRIBIR ────────────────────────────────────────────────────
// Gerencia, por la policy `noticias_write_admin` de la v36. Aquí no se
// comprueba: se intenta la escritura y se informa si el servidor la rechaza.
// Duplicar la regla en el navegador daría dos sitios donde se puede desalinear.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const comunicados = ref([]);
const cargando = ref(false);
const guardando = ref(false);
const error = ref('');

export const AUDIENCIAS = Object.freeze([
  { id: 'publico',   label: 'Ciudadanía',        icono: 'fa-users',
    ayuda: 'Se ve en el portal ciudadano.' },
  { id: 'empleados', label: 'Personal de campo', icono: 'fa-hard-hat',
    ayuda: 'Se ve en la PWA de empleados.' },
  { id: 'interno',   label: 'Centro de Monitoreo', icono: 'fa-building-columns',
    ayuda: 'Solo para quien opera el panel.' },
]);

const COLUMNAS = `
  id, titulo, categoria, categoria_color, categoria_icono, descripcion,
  autor, autor_icono, imagen_url, audiencias,
  fecha_publicacion, fecha_expiracion, activa, created_at,
  noticias_distritos ( distrito_id )
`;

/** Una escritura bloqueada por RLS responde 200 con cero filas, no un error. */
function verificarAfectadas(data, accion) {
  if (Array.isArray(data) && data.length === 0) {
    return {
      ok: false,
      error: `La base aceptó la petición pero no ${accion} ninguna fila. `
           + 'Publicar comunicados es competencia de la gerencia.',
    };
  }
  return { ok: true };
}

function mensajeDeError(e) {
  const texto = e?.message || '';
  if (/audiencias/i.test(texto)) {
    return 'Falta aplicar migration_v36_comunicados.sql en la base de datos.';
  }
  if (e?.code === '23514') return 'Elige al menos una audiencia.';
  if (/row-level security/i.test(texto)) {
    return 'Tu rol no permite publicar comunicados.';
  }
  return texto || 'Error desconocido al guardar.';
}

/**
 * Trae TODOS los comunicados, incluidos los desactivados y los caducados.
 *
 * Un editor tiene que poder ver y corregir lo que ya no se publica; filtrarlo
 * aquí lo dejaría sin forma de recuperarlo.
 */
async function cargarComunicados() {
  if (!db) { error.value = 'Sin conexión con la base de datos.'; return; }
  cargando.value = true;
  error.value = '';
  try {
    const { data, error: err } = await db
      .from('noticias')
      .select(COLUMNAS)
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) throw err;

    comunicados.value = (data || []).map((n) => ({
      ...n,
      distritos: (n.noticias_distritos || []).map((d) => d.distrito_id),
    }));
  } catch (e) {
    comunicados.value = [];
    error.value = mensajeDeError(e);
    console.error('[comunicados-admin]', e.message);
  } finally {
    cargando.value = false;
  }
}

/**
 * Alta o edición.
 *
 * Los distritos van en tabla aparte, así que son dos escrituras. Se borran los
 * anteriores y se insertan los nuevos en vez de calcular el diferencial: son
 * cinco filas como mucho y el diferencial solo añadiría formas de equivocarse.
 *
 * ⚠ No es atómico: si la segunda escritura falla, el comunicado queda guardado
 * con los distritos anteriores. Se avisa en vez de fingir que se guardó todo.
 * Hacerlo atómico exigiría un RPC, y no compensa para una pantalla que usa la
 * gerencia unas pocas veces al mes.
 */
async function guardarComunicado(datos) {
  if (!db) return { ok: false, error: 'Sin conexión con la base de datos.' };

  const titulo = (datos.titulo || '').trim();
  if (!titulo) return { ok: false, error: 'El título es obligatorio.' };
  const descripcion = (datos.descripcion || '').trim();
  if (!descripcion) return { ok: false, error: 'El cuerpo del comunicado es obligatorio.' };
  if (!Array.isArray(datos.audiencias) || !datos.audiencias.length) {
    return { ok: false, error: 'Elige al menos una audiencia.' };
  }

  guardando.value = true;
  try {
    const payload = {
      titulo,
      descripcion,
      categoria: (datos.categoria || '').trim() || 'Municipalidad',
      categoria_color: (datos.categoria_color || '').trim() || 'blue',
      categoria_icono: (datos.categoria_icono || '').trim() || 'fa-bullhorn',
      audiencias: datos.audiencias,
      autor: (datos.autor || '').trim() || 'Alcaldía de San Salvador Sur',
      autor_icono: 'fa-building-columns',
      imagen_url: (datos.imagen_url || '').trim() || null,
      // Los `datetime-local` vacíos llegan como '' y la columna es timestamptz:
      // un '' la haría fallar con un error de tipo, no de validación.
      fecha_publicacion: datos.fecha_publicacion || null,
      fecha_expiracion: datos.fecha_expiracion || null,
      activa: datos.activa !== false,
    };

    let respuesta;
    if (datos.id) {
      respuesta = await db.from('noticias').update(payload).eq('id', datos.id).select(COLUMNAS);
    } else {
      respuesta = await db.from('noticias').insert(payload).select(COLUMNAS);
    }
    if (respuesta.error) throw respuesta.error;

    const verificado = verificarAfectadas(respuesta.data, datos.id ? 'actualizó' : 'insertó');
    if (!verificado.ok) return verificado;

    const id = respuesta.data[0].id;
    const distritos = Array.isArray(datos.distritos) ? datos.distritos : [];

    const { error: errBorrado } = await db
      .from('noticias_distritos').delete().eq('noticia_id', id);
    if (errBorrado) throw errBorrado;

    if (distritos.length) {
      const { error: errAlta } = await db
        .from('noticias_distritos')
        .insert(distritos.map((d) => ({ noticia_id: id, distrito_id: d })));
      if (errAlta) {
        await cargarComunicados();
        return {
          ok: false,
          error: 'El comunicado se guardó, pero no se pudieron asignar los '
               + 'distritos. Ábrelo y vuelve a elegirlos.',
        };
      }
    }

    await cargarComunicados();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  } finally {
    guardando.value = false;
  }
}

/**
 * Retirar o volver a publicar.
 *
 * No hay borrado: `noticias_lecturas` referencia el comunicado, y borrarlo se
 * llevaría por delante el registro de quién lo leyó. Desactivar lo saca de
 * circulación, que es lo que se quiere en la práctica.
 */
async function fijarActiva(id, activa) {
  if (!db) return { ok: false, error: 'Sin conexión con la base de datos.' };
  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('noticias').update({ activa }).eq('id', id).select('id, activa');
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'actualizó');
    if (!verificado.ok) return verificado;

    const fila = comunicados.value.find((c) => c.id === id);
    if (fila) fila.activa = activa;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  } finally {
    guardando.value = false;
  }
}

// ── Indicadores ─────────────────────────────────────────────────────────────

const ahora = () => Date.now();

/** Lo que un lector vería AHORA: activo, ya publicado y sin caducar. */
function estaVigente(c) {
  if (!c.activa) return false;
  if (c.fecha_publicacion && new Date(c.fecha_publicacion).getTime() > ahora()) return false;
  if (c.fecha_expiracion && new Date(c.fecha_expiracion).getTime() <= ahora()) return false;
  return true;
}

/** Programado para el futuro: existe pero todavía no lo ve nadie. */
function estaProgramado(c) {
  return c.activa && c.fecha_publicacion && new Date(c.fecha_publicacion).getTime() > ahora();
}

function estaCaducado(c) {
  return c.activa && c.fecha_expiracion && new Date(c.fecha_expiracion).getTime() <= ahora();
}

const totalComunicados = computed(() => comunicados.value.length);
const vigentes    = computed(() => comunicados.value.filter(estaVigente).length);
const programados = computed(() => comunicados.value.filter(estaProgramado).length);
const paraPublico = computed(
  () => comunicados.value.filter((c) => estaVigente(c) && c.audiencias?.includes('publico')).length
);

export function useComunicadosAdmin() {
  return {
    comunicados, cargando, guardando, error,
    totalComunicados, vigentes, programados, paraPublico,
    cargarComunicados, guardarComunicado, fijarActiva,
    estaVigente, estaProgramado, estaCaducado,
    AUDIENCIAS,
  };
}
