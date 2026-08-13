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

// ─────────────────────────────────────────────────────────────
// Permisos de módulo (public.roles_permisos)
//
// Responde "¿qué pantallas tiene sentido ofrecerle a este usuario?", que es
// una pregunta distinta de "¿qué filas puede leer?" (eso es `alcance`).
//
// Mismo aviso que arriba: NO es seguridad. Sirve para que el menú deje de
// listar módulos donde el usuario solo se va a encontrar una tabla vacía —
// hoy un jefe_area ve "Roles y Permisos", entra, la RLS le devuelve nada y
// concluye que el sistema perdió datos.
// ─────────────────────────────────────────────────────────────

// codigo_modulo → { ver, crear, editar, borrar, exportar }
const permisosModulo = ref({});
const permisosResueltos = ref(false);

async function cargarPermisosModulo() {
  if (!db) {
    permisosResueltos.value = true;
    return;
  }
  try {
    // getSession() lee de memoria/localStorage; getUser() haría un round-trip
    // extra al servidor para un dato que ya tenemos.
    const { data: { session } } = await db.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('sin sesión activa');

    // `maybeSingle` y no `single`: desde la v32 hay cuentas legítimas SIN fila
    // en `usuarios` —las de los ciudadanos del portal— y `single` responde 406
    // sobre cero filas. Eso saltaba al `catch`, que además concluía «el menú se
    // mostrará completo», exactamente lo contrario de lo que toca con un vecino.
    const { data: perfil, error: errPerfil } = await db
      .from('usuarios').select('rol_id').eq('id', uid).maybeSingle();
    if (errPerfil) throw errPerfil;

    // Sin ficha de personal no hay permisos de módulo que resolver, y tampoco
    // es un error: el portal ciudadano no tiene menú administrativo. Se deja el
    // mapa vacío y se sale en silencio, sin ensuciar la consola.
    if (!perfil) {
      permisosModulo.value = {};
      return;
    }

    if (!perfil.rol_id) throw new Error('el usuario no tiene rol_id asignado');

    const { data, error } = await db
      .from('roles_permisos')
      .select('ver, crear, editar, borrar, exportar, permisos_modulos ( codigo_modulo )')
      .eq('rol_id', perfil.rol_id);
    if (error) throw error;

    const mapa = {};
    for (const fila of data || []) {
      const codigo = fila.permisos_modulos?.codigo_modulo;
      if (!codigo) continue;
      mapa[codigo] = {
        ver: !!fila.ver, crear: !!fila.crear, editar: !!fila.editar,
        borrar: !!fila.borrar, exportar: !!fila.exportar,
      };
    }
    permisosModulo.value = mapa;
  } catch (e) {
    // Se deja el mapa vacío a propósito. Ver `puedeVer`: sin datos resueltos
    // el menú se muestra completo. Cerrar el menú ante un fallo de red dejaría
    // al usuario sin poder trabajar, y la RLS sigue protegiendo los datos.
    console.error(
      '[permisos] No se pudieron leer los permisos de módulo: ' + e.message +
      ' — el menú se mostrará completo y la RLS seguirá filtrando los datos.'
    );
    permisosModulo.value = {};
  } finally {
    permisosResueltos.value = true;
  }
}

function limpiarAlcance() {
  alcance.value = { ...ALCANCE_VACIO };
  alcanceResuelto.value = false;
  permisosModulo.value = {};
  permisosResueltos.value = false;
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

  // Falla en abierto: mientras no haya un mapa de permisos resuelto y no vacío,
  // se concede. Un menú de más es una molestia; un menú de menos por un error
  // de red es un usuario bloqueado sin explicación. La RLS es la que protege.
  const hayMapaDePermisos = computed(() => Object.keys(permisosModulo.value).length > 0);

  const puedeAccion = (modulo, accion) => {
    if (!modulo) return true;                 // ítem sin módulo asociado
    if (!hayMapaDePermisos.value) return true;
    return permisosModulo.value[modulo]?.[accion] === true;
  };

  const puedeVer      = (modulo) => puedeAccion(modulo, 'ver');
  const puedeCrear    = (modulo) => puedeAccion(modulo, 'crear');
  const puedeEditar   = (modulo) => puedeAccion(modulo, 'editar');
  const puedeBorrar   = (modulo) => puedeAccion(modulo, 'borrar');
  const puedeExportar = (modulo) => puedeAccion(modulo, 'exportar');

  return {
    alcance,
    cargandoAlcance,
    alcanceResuelto,
    cargarAlcance,
    limpiarAlcance,
    permisosModulo,
    permisosResueltos,
    cargarPermisosModulo,
    hayMapaDePermisos,
    puedeVer, puedeCrear, puedeEditar, puedeBorrar, puedeExportar,
    veTodoElMunicipio,
    distritosVisibles,
    distritoUnico,
    distritoPorDefecto,
    puedeCompararDistritos,
    puedeVerDistrito,
  };
}
