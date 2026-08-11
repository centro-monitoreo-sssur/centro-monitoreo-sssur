// ============================================================
// STORE: catálogo de categorías y atenciones por departamento
//
// La migración v26 delegó en las jefaturas la gestión del catálogo de su
// unidad: creó el módulo de permisos `categorias`, las policies
// `categorias_insert_jefatura` / `categorias_update_jefatura`, la policy de
// `departamento_categorias` y el trigger `trg_categoria_enrutamiento`. Nunca
// hubo pantalla. Este store la alimenta.
//
// ── DOS TABLAS, DOS PREGUNTAS DISTINTAS ─────────────────────────────────────
//   `categorias_caso`          → QUÉ tipos de incidencia existen y a qué unidad
//                                se enrutan por defecto.
//   `departamento_categorias`  → QUÉ puede atender cada unidad, aunque no sea
//                                la responsable principal.
//
// ── LO QUE EL SERVIDOR DECIDE, NO ESTE CÓDIGO ───────────────────────────────
//   · El departamento responsable al CREAR: lo fuerza el trigger al
//     departamento de quien crea. No se envía desde aquí; enviarlo daría a
//     entender que se puede elegir.
//   · El prefijo del código: lo pone el trigger a partir del código del
//     departamento, para que dos unidades no colisionen.
//   · El flujo de estados y el estado inicial: los garantiza el trigger de la
//     v29 si no se declaran.
//   · `es_responsable_principal`: reservado a la gerencia por
//     `fn_protege_responsable_principal`. Aquí siempre se escribe false.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const categorias = ref([]);
const atenciones = ref([]);        // filas de departamento_categorias
const cargando = ref(false);
const guardando = ref(false);
const error = ref('');

/** Traduce errores de Postgres a algo accionable por una jefatura. */
function mensajeDeError(e, contexto) {
  const codigo = e?.code;
  const texto = e?.message || '';

  if (codigo === '23505') {
    return 'Ya existe una categoría con ese código. Prueba con otro nombre.';
  }
  if (codigo === '23503') return 'Falta un dato de catálogo o la referencia no existe.';
  if (codigo === '23514') return 'Algún campo no cumple las validaciones de la base.';
  // Los triggers de v26 lanzan 42501 con el mensaje ya redactado para quien
  // opera —explican qué es competencia de la gerencia y por qué—, así que se
  // muestran tal cual en lugar de sustituirlos por un genérico.
  if (codigo === '42501') return texto || 'Tu rol no permite esta operación.';
  if (/row-level security/i.test(texto)) {
    return 'Solo puedes gestionar las categorías de tu propio departamento.';
  }
  console.error(`[catalogo] ${contexto}:`, e);
  return texto || 'Error desconocido al guardar.';
}

/** Una escritura bloqueada por RLS responde 200 con cero filas, no un error. */
function verificarAfectadas(data, accion) {
  if (Array.isArray(data) && data.length === 0) {
    return {
      ok: false,
      error: `La base aceptó la petición pero no ${accion} ninguna fila. ` +
             'Suele significar que la categoría pertenece a otro departamento, ' +
             'o que falta aplicar migration_v26_catalogo_por_departamento.sql.',
    };
  }
  return { ok: true };
}

// ── Carga ────────────────────────────────────────────────────────────────────

async function cargarCatalogo() {
  if (!db) { error.value = 'Sin conexión a la base de datos.'; return; }
  cargando.value = true;
  error.value = '';
  try {
    const [resCategorias, resAtenciones] = await Promise.all([
      db.from('categorias_caso')
        .select('id, codigo, nombre, descripcion, icono, color_hex, ' +
                'departamento_responsable_id, prioridad_default_id, requiere_ubicacion, ' +
                'estados_flujo, estado_inicial, activo, created_at')
        .order('codigo'),
      db.from('departamento_categorias')
        .select('id, departamento_id, categoria_id, es_responsable_principal, puede_intervenir, activo'),
    ]);

    if (resCategorias.error) throw resCategorias.error;
    if (resAtenciones.error) throw resAtenciones.error;

    categorias.value = (resCategorias.data || []).map((c) => ({
      ...c,
      // El flujo puede venir vacío en categorías anteriores a la v29.
      flujo: Array.isArray(c.estados_flujo) ? c.estados_flujo : [],
    }));
    atenciones.value = resAtenciones.data || [];
  } catch (e) {
    error.value = mensajeDeError(e, 'cargarCatalogo');
    categorias.value = [];
    atenciones.value = [];
  } finally {
    cargando.value = false;
  }
}

// ── Categorías ───────────────────────────────────────────────────────────────

/**
 * Alta o edición de una categoría.
 *
 * En el ALTA no se envía `departamento_responsable_id` ni se normaliza el
 * `codigo`: los pone el trigger `trg_categoria_enrutamiento` a partir del
 * departamento de quien crea. Mandarlos desde el navegador sería decirle a la
 * jefatura que puede elegirlos, cuando el servidor los va a sobrescribir.
 *
 * En la EDICIÓN tampoco se envía el departamento: cambiarlo afecta a otra
 * unidad y el trigger lo rechaza. La gerencia lo hace desde otra pantalla.
 */
async function guardarCategoria(datos) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };

  const nombre = (datos.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'El nombre es obligatorio.' };

  guardando.value = true;
  error.value = '';
  try {
    const payload = {
      nombre,
      descripcion: (datos.descripcion || '').trim() || null,
      icono: (datos.icono || '').trim() || 'fa-circle-dot',
      color_hex: (datos.color_hex || '').trim() || '#6b7280',
      prioridad_default_id: datos.prioridad_default_id ? Number(datos.prioridad_default_id) : null,
      requiere_ubicacion: datos.requiere_ubicacion !== false,
      activo: datos.activo !== false,
    };

    let respuesta;
    if (datos.id) {
      // El estado inicial solo se toca al editar, y solo con un valor que esté
      // en el flujo: el trigger de la v29 lo corregiría igualmente, pero es
      // mejor no enviar algo que se sabe inválido.
      const flujo = Array.isArray(datos.flujo) ? datos.flujo : [];
      if (datos.estado_inicial && flujo.some((e) => e.id === datos.estado_inicial)) {
        payload.estado_inicial = datos.estado_inicial;
      }
      respuesta = await db.from('categorias_caso').update(payload).eq('id', datos.id).select();
    } else {
      // `codigo` viaja como semilla del nombre; el trigger le antepone el
      // prefijo del departamento y normaliza el resto.
      payload.codigo = (datos.codigo || nombre).trim().toUpperCase();
      respuesta = await db.from('categorias_caso').insert(payload).select();
    }

    if (respuesta.error) throw respuesta.error;
    const verificado = verificarAfectadas(respuesta.data, datos.id ? 'actualizó' : 'insertó');
    if (!verificado.ok) return verificado;

    await cargarCatalogo();
    return { ok: true, categoria: respuesta.data?.[0] || null };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'guardarCategoria') };
  } finally {
    guardando.value = false;
  }
}

/**
 * Activar o desactivar. No hay borrado, y la matriz de v26 lo deja explícito
 * con `borrar = false`: una categoría con casos históricos que se elimina deja
 * ese histórico sin clasificación.
 */
async function fijarActivoCategoria(id, activo) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('categorias_caso').update({ activo }).eq('id', id).select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'actualizó');
    if (!verificado.ok) return verificado;

    const fila = categorias.value.find((c) => c.id === id);
    if (fila) fila.activo = activo;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'fijarActivoCategoria') };
  } finally {
    guardando.value = false;
  }
}

// ── Atenciones de la unidad ──────────────────────────────────────────────────

/**
 * Declara que un departamento atiende una categoría de la que NO es el
 * responsable principal.
 *
 * `es_responsable_principal` se escribe siempre false: marcarlo define a quién
 * le nacen los casos y afecta a otras unidades, así que
 * `fn_protege_responsable_principal` lo reserva a la gerencia. Enviarlo en true
 * desde aquí produciría un error con un mensaje largo en lugar de una interfaz
 * que simplemente no lo ofrece.
 */
async function declararAtencion(departamentoId, categoriaId, puedeIntervenir = true) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  if (!departamentoId || !categoriaId) return { ok: false, error: 'Falta el departamento o la categoría.' };

  guardando.value = true;
  try {
    // `upsert` sobre la clave única (departamento, categoría): volver a
    // declarar una atención existente debe reactivarla, no dar un 23505.
    const { data, error: err } = await db
      .from('departamento_categorias')
      .upsert({
        departamento_id: Number(departamentoId),
        categoria_id: Number(categoriaId),
        puede_intervenir: !!puedeIntervenir,
        activo: true,
      }, { onConflict: 'departamento_id,categoria_id' })
      .select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'insertó');
    if (!verificado.ok) return verificado;

    await cargarCatalogo();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'declararAtencion') };
  } finally {
    guardando.value = false;
  }
}

/** Cambia si la unidad ejecuta trabajo sobre la categoría o solo la observa. */
async function fijarPuedeIntervenir(filaId, puedeIntervenir) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('departamento_categorias')
      .update({ puede_intervenir: !!puedeIntervenir })
      .eq('id', filaId)
      .select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'actualizó');
    if (!verificado.ok) return verificado;

    const fila = atenciones.value.find((a) => a.id === filaId);
    if (fila) fila.puede_intervenir = !!puedeIntervenir;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'fijarPuedeIntervenir') };
  } finally {
    guardando.value = false;
  }
}

/**
 * Retira una atención declarada.
 *
 * Se DESACTIVA en lugar de borrarse. La fila es una declaración de competencia
 * con fecha, y borrarla hace imposible responder por qué una unidad intervino
 * un caso el año pasado.
 */
async function retirarAtencion(filaId) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  guardando.value = true;
  try {
    const { data, error: err } = await db
      .from('departamento_categorias')
      .update({ activo: false })
      .eq('id', filaId)
      .select();
    if (err) throw err;
    const verificado = verificarAfectadas(data, 'actualizó');
    if (!verificado.ok) return verificado;

    await cargarCatalogo();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'retirarAtencion') };
  } finally {
    guardando.value = false;
  }
}

// ── API del store ────────────────────────────────────────────────────────────

export function useCatalogoCategorias() {
  const totalCategorias = computed(() => categorias.value.length);
  const categoriasActivas = computed(() => categorias.value.filter((c) => c.activo).length);
  const categoriasSinPrioridad = computed(() =>
    categorias.value.filter((c) => c.activo && !c.prioridad_default_id).length
  );

  /** Categorías enrutadas a un departamento. */
  const categoriasDeDepartamento = (departamentoId) =>
    categorias.value.filter((c) => String(c.departamento_responsable_id) === String(departamentoId));

  /**
   * Atenciones vigentes de un departamento, ya cruzadas con la categoría.
   * `Map` por id para que el cruce sea O(n) y no O(n·m).
   */
  const atencionesDeDepartamento = (departamentoId) => {
    const porId = new Map(categorias.value.map((c) => [c.id, c]));
    return atenciones.value
      .filter((a) => a.activo && String(a.departamento_id) === String(departamentoId))
      .map((a) => ({ ...a, categoria: porId.get(a.categoria_id) || null }))
      .filter((a) => a.categoria)
      .sort((x, y) => x.categoria.nombre.localeCompare(y.categoria.nombre, 'es'));
  };

  return {
    categorias, atenciones, cargando, guardando, error,
    totalCategorias, categoriasActivas, categoriasSinPrioridad,
    categoriasDeDepartamento, atencionesDeDepartamento,
    cargarCatalogo, guardarCategoria, fijarActivoCategoria,
    declararAtencion, fijarPuedeIntervenir, retirarAtencion,
  };
}
