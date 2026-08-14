// ============================================================
// STORE: comunicados de la municipalidad
//
// Sustituye a `utils/noticias-demo.js`, que eran cuatro avisos escritos a mano
// con fechas de julio. La sección «Noticias» del portal pasa a mostrar lo que
// publica la Alcaldía de verdad.
//
// ── QUIÉN VE QUÉ NO SE DECIDE AQUÍ ──────────────────────────────────────────
// Lo decide la RLS. La policy `noticias_select_por_audiencia` de la v36 filtra
// por el arreglo `audiencias` —publico / empleados / interno— y por la vigencia.
// Este store NO añade `.eq('audiencias', ...)`: un filtro en el navegador es una
// sugerencia, no una garantía, y duplicarlo daría dos sitios donde equivocarse.
//
// Consecuencia práctica: el mismo store sirve al portal ciudadano y a la PWA de
// campo. Cada uno recibe lo suyo sin pedirlo.
//
// ── EL DISTRITO SÍ SE FILTRA AQUÍ ───────────────────────────────────────────
// Y es distinto: un comunicado de otro distrito no es información restringida,
// solo es información que no te toca. Se filtra en el cliente para poder
// ofrecer «ver todos» sin una segunda consulta.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const comunicados = ref([]);
const cargando = ref(false);
const errorComunicados = ref('');
/** Ids que este usuario ya leyó. `Set` para que la comprobación sea O(1). */
const leidos = ref(new Set());

// Se enumeran las columnas en vez de `select('*')` para que añadir una a la
// tabla no cambie en silencio lo que viaja al navegador de un vecino.
const COLUMNAS = `
  id, titulo, categoria, categoria_color, categoria_icono, descripcion,
  trazado_geojson, autor, autor_icono, imagen_url, audiencias,
  fecha_publicacion, fecha_expiracion, created_at,
  noticias_distritos ( distrito_id )
`;

/**
 * Trae los comunicados visibles y las marcas de leído, en paralelo.
 *
 * Son dos consultas independientes y encadenarlas duplicaría la espera para
 * dibujar una sola pantalla.
 */
async function cargarComunicados() {
  if (!db) { errorComunicados.value = 'Sin conexión con el servidor.'; return { ok: false }; }

  cargando.value = true;
  errorComunicados.value = '';
  try {
    const [resNoticias, resLecturas] = await Promise.all([
      db.from('noticias')
        .select(COLUMNAS)
        .eq('activa', true)
        // Lo programado primero y, si no hay fecha, por antigüedad de alta.
        .order('fecha_publicacion', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100),
      db.from('noticias_lecturas').select('noticia_id'),
    ]);

    if (resNoticias.error) throw resNoticias.error;
    // Un fallo leyendo las marcas NO debe impedir ver los comunicados: en el
    // peor caso salen todos como no leídos, que es una degradación inofensiva.
    if (resLecturas.error) {
      console.warn('[comunicados] No se pudieron leer las marcas:', resLecturas.error.message);
    }

    comunicados.value = (resNoticias.data || []).map((n) => ({
      ...n,
      // Se aplana la tabla puente: la vista solo necesita los ids.
      distritos: (n.noticias_distritos || []).map((d) => d.distrito_id),
      // Sin fecha de publicación, la de alta hace las veces.
      fecha: n.fecha_publicacion || n.created_at,
    }));

    leidos.value = new Set((resLecturas.data || []).map((l) => l.noticia_id));
    return { ok: true };
  } catch (e) {
    comunicados.value = [];
    // `audiencias` no existe hasta la v36. Sin este aviso el síntoma sería una
    // pantalla vacía por una columna inexistente, que no se parece a la causa.
    const faltaColumna = /audiencias|noticias_lecturas/i.test(e.message || '');
    errorComunicados.value = faltaColumna
      ? 'Los comunicados no están habilitados en la base de datos.'
      : 'No se pudieron cargar los comunicados.';
    console.error(
      faltaColumna
        ? '[comunicados] Falta la v36. Ejecuta database/migration_v36_comunicados.sql.'
        : '[comunicados] ' + e.message
    );
    return { ok: false };
  } finally {
    cargando.value = false;
  }
}

const estaLeido = (id) => leidos.value.has(id);

const sinLeer = computed(() => comunicados.value.filter((c) => !leidos.value.has(c.id)).length);

/**
 * Marca uno como leído.
 *
 * Se actualiza el `Set` ANTES de la ida al servidor: el distintivo debe bajar
 * en cuanto se abre el comunicado, no medio segundo después. Si la escritura
 * falla se deshace, porque un contador que miente es peor que uno lento.
 */
async function marcarLeido(id) {
  if (!db || leidos.value.has(id)) return;

  // `new Set` y no `.add()`: mutar el Set en su sitio no dispara la
  // reactividad de Vue, así que el distintivo no se enteraría.
  leidos.value = new Set([...leidos.value, id]);

  try {
    const { error } = await db.rpc('marcar_noticia_leida', { p_noticia_id: id });
    if (error) throw error;
  } catch (e) {
    const copia = new Set(leidos.value);
    copia.delete(id);
    leidos.value = copia;
    console.warn('[comunicados] No se pudo marcar como leído:', e.message);
  }
}

/**
 * Los comunicados que tocan a un distrito.
 *
 * Sin distritos asociados, el comunicado es MUNICIPAL y lo ve todo el mundo:
 * es el caso de un aviso general de la Alcaldía, y excluirlo por no tener
 * territorio sería justo al revés de lo que se quiere.
 */
function paraDistrito(distritoId) {
  return comunicados.value.filter(
    (c) => !c.distritos.length || (distritoId != null && c.distritos.includes(distritoId))
  );
}

export function useComunicados() {
  return {
    comunicados, cargando, errorComunicados,
    leidos, estaLeido, sinLeer,
    cargarComunicados, marcarLeido, paraDistrito,
  };
}
