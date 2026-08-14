// ============================================================
// SERVICIO: catálogo de categorías abiertas al público
//
// Sustituye a `utils/categorias-denuncias.js`, que tenía 27 categorías escritas
// a mano con ids del 1 al 27 SIN NINGUNA relación con `categorias_caso`. Daba
// igual mientras nada se guardaba; desde la v34 la denuncia va a la base y el
// id que se envíe tiene que ser el de verdad.
//
// ── QUÉ SE OFRECE Y QUÉ NO ──────────────────────────────────────────────────
// Solo lo que cumple las dos condiciones: `activo` y `visible_ciudadano`. Este
// último lo añadió la v34 con valor por defecto FALSE, así que el catálogo
// arranca vacío y la Alcaldía abre lo que decida. Abrir una categoría es
// comprometer a un departamento a atenderla, y esa es una decisión suya.
//
// ── POR QUÉ NO SE AGRUPA POR DEPARTAMENTO ───────────────────────────────────
// Se probó y estaba mal. Un vecino no sabe —ni tiene por qué— si un bache lo
// atiende la «Unidad Operativa de Obras Municipales» o el «Departamento
// Distrital»: piensa en el PROBLEMA, no en el organigrama. Además salían tantas
// pestañas como unidades con categorías abiertas, con nombres de cuatro
// palabras que desbordan la fila en un teléfono.
//
// Se usan los mismos tres macro-grupos que la PWA de campo —Ciudad, Seguridad,
// Trámites— reutilizando `utils/grupos-categorias.js`. Ese archivo ya
// documentaba exactamente este razonamiento para los empleados, y al ciudadano
// le aplica con más motivo.
//
// El departamento sigue viajando en cada categoría: sirve como dato de
// confirmación una vez elegida, no como criterio de navegación. Y el ruteo real
// lo hace la base con `departamento_responsable_id`, no esta pantalla.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { agruparCategorias } from '../utils/grupos-categorias.js';

const categorias = ref([]);
const cargando = ref(false);
const errorCatalogo = ref('');
/** Cierto cuando la consulta salió bien pero no hay ninguna abierta. */
const sinCategoriasAbiertas = ref(false);

// Color de respaldo cuando la categoría no lo declara. Gris neutro a propósito:
// inventar un color sugiere una gravedad que nadie ha definido.
const COLOR_POR_DEFECTO = '#64748b';
const ICONO_POR_DEFECTO = 'fa-circle-exclamation';

/**
 * Trae las categorías que el portal puede ofrecer.
 *
 * El nombre del departamento viaja anidado en la misma petición: son dos
 * catálogos pequeños y pedirlos por separado serían dos viajes de red para
 * dibujar una sola pantalla.
 */
async function cargarCategoriasPublicas() {
  if (!db) return { ok: false, error: 'Sin conexión con el servidor.' };

  cargando.value = true;
  errorCatalogo.value = '';
  sinCategoriasAbiertas.value = false;
  try {
    const { data, error } = await db
      .from('categorias_caso')
      .select(`id, codigo, nombre, descripcion, icono, color_hex,
               requiere_ubicacion, departamento_responsable_id,
               departamentos ( id, nombre )`)
      .eq('activo', true)
      .eq('visible_ciudadano', true)
      .order('nombre');

    if (error) throw error;

    categorias.value = (data || []).map((c) => ({
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      descripcion: c.descripcion || '',
      icono: c.icono || ICONO_POR_DEFECTO,
      // Hexadecimal, no un nombre de color de Tailwind: así lo guarda
      // `categorias_caso.color_hex` y así se pinta, con estilo en línea. La
      // versión anterior traducía nombres ('yellow') a clases, y eso obligaba a
      // mantener una tabla de equivalencias que la base no conoce.
      color: c.color_hex || COLOR_POR_DEFECTO,
      requiereUbicacion: c.requiere_ubicacion !== false,
      departamentoId: c.departamento_responsable_id,
      departamento: c.departamentos?.nombre || 'Otros',
    }));

    sinCategoriasAbiertas.value = categorias.value.length === 0;
    return { ok: true };
  } catch (e) {
    categorias.value = [];

    // `visible_ciudadano` no existe hasta la v34. Sin este aviso, el síntoma
    // sería una pantalla vacía y una consulta fallando por una columna
    // inexistente, que no se parece en nada a la causa.
    const faltaColumna = /visible_ciudadano/i.test(e.message || '');
    errorCatalogo.value = faltaColumna
      ? 'El catálogo público no está habilitado en la base de datos.'
      : 'No se pudo cargar el catálogo de reportes.';

    console.error(
      faltaColumna
        ? '[catalogo-publico] Falta la columna `visible_ciudadano`. ' +
          'Ejecuta database/migration_v34_denuncias_ciudadanas.sql.'
        : '[catalogo-publico] Falló la carga: ' + e.message
    );
    return { ok: false, error: errorCatalogo.value };
  } finally {
    cargando.value = false;
  }
}

/**
 * Las categorías repartidas en Ciudad / Seguridad / Trámites.
 *
 * `agruparCategorias` decide el grupo por el prefijo del `codigo` —VIA, ALU,
 * RIE, COM…— y **descarta los grupos que quedan vacíos**, que es justo lo que
 * hace falta aquí: si la Alcaldía solo abrió categorías de Ciudad, no se pinta
 * una pestaña «Trámites» que no lleva a ninguna parte.
 *
 * Devuelve `[{ id, nombre, descripcion, icono, color, categorias }]`.
 */
const grupos = computed(() => agruparCategorias(categorias.value));

/** Busca una categoría por id. Devuelve null si no está entre las públicas. */
function categoriaPorId(id) {
  const numero = Number(id);
  return categorias.value.find((c) => c.id === numero) || null;
}

export function useCatalogoPublico() {
  return {
    categorias, cargando, errorCatalogo, sinCategoriasAbiertas,
    grupos,
    cargarCategoriasPublicas, categoriaPorId,
  };
}
