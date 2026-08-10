// ============================================================================
// STORE: perfil de referencia de cada distrito
//
// Población, altitud, teléfono, economía y descripción. Vivían en un objeto
// literal dentro de `admin/vista-cartograma.js`, así que actualizar el dato
// censal exigía un despliegue y un desarrollador. Ahora salen de
// `public.distritos_perfil` (migration_v28) y los mantiene la Gerencia.
//
// Cada fila trae `fuente` y `actualizado_en`. No es burocracia: estas cifras se
// usan para normalizar denuncias por habitante y para repartir atención, y
// quien lea un número tiene derecho a saber de dónde salió y de cuándo es.
// ============================================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const perfiles = ref([]);
const cargando = ref(false);
const error = ref('');

async function cargarPerfiles() {
  if (!db || perfiles.value.length) return;   // catálogo estable: una vez basta
  cargando.value = true;
  error.value = '';
  try {
    const { data, error: err } = await db
      .from('distritos_perfil')
      .select('distrito_id, poblacion, altitud_msnm, telefono, icono, color_hex, economia, descripcion, destacados, fuente, actualizado_en');
    if (err) throw err;
    perfiles.value = data || [];
    if (!perfiles.value.length) {
      console.error(
        '[perfil-distritos] `distritos_perfil` está VACÍA. El Cartograma no ' +
        'podrá mostrar población ni densidad. Ejecuta ' +
        'database/migration_v28_perfil_distrito_y_analitica.sql.'
      );
    }
  } catch (e) {
    perfiles.value = [];
    error.value = /relation|does not exist/i.test(e.message || '')
      ? 'Falta ejecutar database/migration_v28_perfil_distrito_y_analitica.sql.'
      : (e.message || 'No se pudo cargar el perfil de los distritos');
    console.error('[perfil-distritos]', error.value);
  } finally {
    cargando.value = false;
  }
}

export function usePerfilDistritos() {
  // Índice por id: la vista lo consulta una vez por distrito y por repintado,
  // así que conviene que sea O(1) y no un `find` sobre el array.
  const porDistrito = computed(() => {
    const indice = new Map();
    for (const p of perfiles.value) indice.set(Number(p.distrito_id), p);
    return indice;
  });

  const perfilDe = (distritoId) => porDistrito.value.get(Number(distritoId)) || null;

  // La cifra poblacional más antigua del conjunto. Es lo que hay que enseñar
  // junto a los porcentajes por habitante: si el dato es de hace ocho años, el
  // indicador lo es también.
  const fuentePoblacion = computed(() => {
    if (!perfiles.value.length) return null;
    const conFuente = perfiles.value.filter((p) => p.fuente);
    if (!conFuente.length) return null;
    const masAntiguo = conFuente.reduce((a, b) =>
      new Date(a.actualizado_en) < new Date(b.actualizado_en) ? a : b);
    return { texto: masAntiguo.fuente, fecha: masAntiguo.actualizado_en };
  });

  return { perfiles, porDistrito, perfilDe, fuentePoblacion, cargando, error, cargarPerfiles };
}
