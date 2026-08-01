// ============================================================
// STORE: alcance de datos del usuario autenticado
//
// ⚠ ESTE STORE NO ES UN CONTROL DE SEGURIDAD.
// Quien decide qué filas puede ver un usuario es la RLS de Postgres
// (migration_v16_alcance_territorial.sql). Este store solo replica esa
// información en el cliente para NO OFRECER controles inútiles: ocultar el
// selector de distrito a quien solo tiene uno, no pintar un comparativo de 5
// distritos a quien únicamente ve el suyo.
//
// Regla: la UI nunca debe filtrar por seguridad. Si un dato llegó al cliente,
// es porque la RLS lo permitió. Si no debía llegar, el arreglo va en la
// política, jamás aquí.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

// Estructura que devuelve el RPC `public.mi_alcance()`
const ALCANCE_VACIO = {
  rol: '',
  distrito_id: null,
  departamento_id: null,
  alcance_territorial: 'ninguno',
  alcance_organizacional: 'ninguno',
  combinador: 'and',
  ve_todo_el_municipio: false,
  distritos_visibles: [],
  departamentos_visibles: [],
};

const alcance = ref({ ...ALCANCE_VACIO });
const cargandoAlcance = ref(false);
// Distingue "todavía no se ha consultado" de "se consultó y no hay alcance".
// Sin esta bandera la UI no puede diferenciar un usuario sin permisos de uno
// cuyo perfil aún está en vuelo, y parpadearía mostrando el estado equivocado.
const alcanceResuelto = ref(false);

async function cargarAlcance() {
  if (!db) {
    alcanceResuelto.value = true;
    return;
  }
  cargandoAlcance.value = true;
  try {
    const { data, error } = await db.rpc('mi_alcance');
    if (error) throw error;
    if (data) {
      alcance.value = { ...ALCANCE_VACIO, ...data };
    } else {
      console.error(
        '[permisos] `mi_alcance()` no devolvió datos. El usuario operará con ' +
        'alcance vacío y la consola territorial no ofrecerá filtros por distrito.'
      );
    }
  } catch (e) {
    // El caso más probable es que migration_v16 no se haya aplicado todavía:
    // PostgREST responde 404 al no encontrar la función.
    const faltaLaFuncion = /function|does not exist|not find/i.test(e.message || '');
    console.error(
      '[permisos] No se pudo resolver el alcance del usuario: ' + e.message +
      (faltaLaFuncion
        ? ' — ¿Está aplicada `migration_v16_alcance_territorial.sql` en Supabase?'
        : '')
    );
    alcance.value = { ...ALCANCE_VACIO };
  } finally {
    cargandoAlcance.value = false;
    alcanceResuelto.value = true;
  }
}

function limpiarAlcance() {
  alcance.value = { ...ALCANCE_VACIO };
  alcanceResuelto.value = false;
}

export function usePermisos() {
  const veTodoElMunicipio = computed(() => alcance.value.ve_todo_el_municipio === true);

  const distritosVisibles = computed(() => alcance.value.distritos_visibles || []);

  // Un solo distrito visible = jefatura distrital sin delegaciones. La barra
  // territorial muestra su distrito como etiqueta fija en lugar de un selector
  // de una sola opción, que no aporta nada.
  const distritoUnico = computed(() =>
    distritosVisibles.value.length === 1 ? distritosVisibles.value[0] : null
  );

  // Solo tiene sentido comparar distritos si se ve más de uno.
  const puedeCompararDistritos = computed(() => distritosVisibles.value.length > 1);

  const puedeVerDistrito = (id) =>
    veTodoElMunicipio.value || distritosVisibles.value.includes(Number(id));

  // Distrito con el que arranca la vista: el propio si solo hay uno,
  // "todos" (cadena vacía) si hay varios.
  const distritoPorDefecto = computed(() =>
    distritoUnico.value !== null ? String(distritoUnico.value) : ''
  );

  return {
    alcance,
    cargandoAlcance,
    alcanceResuelto,
    cargarAlcance,
    limpiarAlcance,
    veTodoElMunicipio,
    distritosVisibles,
    distritoUnico,
    distritoPorDefecto,
    puedeCompararDistritos,
    puedeVerDistrito,
  };
}
