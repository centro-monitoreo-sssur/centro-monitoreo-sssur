// ============================================================
// CONTEXTO DE APLICACIÓN
//
// Un solo `index.html` sirve tres aplicaciones distintas —Centro de Monitoreo,
// PWA de empleados de campo y portal de población— que se distinguen por el
// parámetro `?contexto=`. Al compartir origen comparten también almacenamiento,
// y ahí está el problema que este módulo resuelve: sin separar el espacio de
// claves, abrir la PWA en una pestaña CIERRA la sesión del Centro de Monitoreo
// en la otra, y la cola de operaciones offline que levantó un empleado acaba
// sincronizándola el administrador con su propio token.
//
// El contexto se resuelve UNA sola vez, al cargar el módulo, y desde entonces
// es inmutable. Este archivo NO importa nada a propósito: tiene que evaluarse
// antes que `supabase.js`, porque de él depende la clave bajo la que se guarda
// la sesión, y los módulos ES se evalúan en orden de dependencias.
//
// Patrón: Singleton de módulo. No hay forma de tener dos contextos vivos en la
// misma pestaña, que es exactamente la garantía que se busca.
// ============================================================

export const CONTEXTOS = Object.freeze({
  MONITOREO: 'monitoreo',
  EMPLEADOS: 'empleados',
  POBLACION: 'poblacion',
});

// `Set` en lugar de `Array.includes`: la validación es O(1) y no O(n). Con tres
// elementos da igual en tiempo real, pero deja el criterio correcto escrito por
// si el día de mañana se añaden contextos (contratistas, ANDA, CAM…).
const CONTEXTOS_VALIDOS = new Set(Object.values(CONTEXTOS));

const PARAMETRO_URL = 'contexto';

// Una RUTA por aplicación. Es lo que permite instalar las tres a la vez: el
// `scope` de un manifiesto se compara solo por ruta —la cadena de consulta se
// ignora—, así que mientras las tres colgaban de `/` el navegador las trataba
// como una sola aplicación ya instalada.
//
// El .htaccess reescribe las tres al mismo index.html sin cambiar la URL.
export const RUTAS_CONTEXTO = Object.freeze({
  [CONTEXTOS.MONITOREO]: '/panel/',
  [CONTEXTOS.EMPLEADOS]: '/campo/',
  [CONTEXTOS.POBLACION]: '/ciudadano/',
});

// Índice inverso: primer tramo de la ruta → contexto.
const CONTEXTO_POR_TRAMO = Object.freeze({
  panel:     CONTEXTOS.MONITOREO,
  campo:     CONTEXTOS.EMPLEADOS,
  ciudadano: CONTEXTOS.POBLACION,
});

/* Las rutas de arriba las inventa el .htaccess, que en desarrollo no existe:
   Live Server, `python -m http.server` y compañía sirven archivos y nada más,
   así que /campo/ devuelve 404. Ahí se sigue usando `?contexto=`, que no
   necesita reescritura.

   La misma lista que usa sw.js para no cachear en desarrollo. */
const HOSTS_DESARROLLO = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

export const enDesarrollo =
  typeof window !== 'undefined' && HOSTS_DESARROLLO.has(window.location.hostname);

/**
 * URL para entrar a un contexto, en el entorno donde se esté ejecutando.
 *
 * En producción es la ruta —que es lo que permite instalar las tres PWA por
 * separado—. En desarrollo, el parámetro sobre el documento actual.
 *
 * Existe para que ningún componente vuelva a escribir la URL a mano: cada sitio
 * que lo hiciera sería un sitio más que romper la próxima vez que esto cambie.
 */
export function urlDeContexto(contexto) {
  const destino = CONTEXTOS_VALIDOS.has(contexto) ? contexto : CONTEXTOS.MONITOREO;
  if (!enDesarrollo) return RUTAS_CONTEXTO[destino];

  const base = window.location.pathname || '/';
  return destino === CONTEXTOS.MONITOREO ? base : `${base}?contexto=${destino}`;
}

// La URL es la ÚNICA fuente de verdad. No hay respaldo en `sessionStorage`, y
// es deliberado: la aplicación no tiene enrutador, así que la URL nunca cambia
// sin recarga y no existe navegación interna que pueda perder el parámetro.
// Un respaldo solo añadiría un modo de fallo —ir de `?contexto=empleados` a la
// raíz en la misma pestaña dejaría la sesión guardada bajo la clave de
// empleados mientras la app se comporta como Centro de Monitoreo— sin resolver
// ningún caso real.
//
// Corolario para quien toque esto luego: cambiar de contexto exige una
// navegación completa (`window.location.href = ...`), NUNCA un `irA()`. Sin
// recarga, el módulo conserva el contexto anterior y la sesión acaba escrita
// en la partición equivocada.
function resolverContexto() {
  if (typeof window === 'undefined') return CONTEXTOS.MONITOREO;

  // Resto de la versión que guardaba el contexto en sessionStorage. Nada lo lee
  // ya; se limpia para no dejar basura en pestañas que venían de antes.
  try { sessionStorage.removeItem('contexto_acceso'); } catch { /* da igual */ }

  // 1. La RUTA manda. Es la fuente de verdad desde que cada aplicación tiene
  //    la suya, y es lo único que ve el navegador para decidir el ámbito de
  //    una PWA instalada.
  const tramo = window.location.pathname.split('/')[1];
  const porRuta = CONTEXTO_POR_TRAMO[tramo];
  if (porRuta) return porRuta;

  // 2. `?contexto=` sigue reconociéndose, por dos motivos distintos.
  //
  //    En PRODUCCIÓN, para no romper enlaces y accesos directos anteriores al
  //    cambio de rutas. Ahí no basta con resolver el contexto: se redirige a la
  //    ruta nueva, porque quedarse en `/` deja la aplicación fuera del ámbito
  //    de su manifiesto y entonces no se puede instalar. Es una navegación
  //    completa, que es justo lo que este módulo exige para cambiar de contexto.
  //
  //    En DESARROLLO es la única vía: sin el .htaccess no hay quien sirva
  //    /campo/. Redirigir allí daría un 404 y dejaría el entorno local sin
  //    forma de abrir las dos PWA.
  const enUrl = new URLSearchParams(window.location.search).get(PARAMETRO_URL);
  if (enUrl && CONTEXTOS_VALIDOS.has(enUrl)) {
    if (!enDesarrollo) window.location.replace(RUTAS_CONTEXTO[enUrl]);
    return enUrl;
  }

  // 3. Sin ruta ni parámetro reconocibles, Centro de Monitoreo. Un valor
  //    inventado (`?contexto=admin`) degrada al mismo sitio, donde los
  //    permisos deciden qué puede ver quien entre.
  return CONTEXTOS.MONITOREO;
}

/** Contexto activo de ESTA pestaña. Inmutable durante toda la vida del módulo. */
export const CONTEXTO = resolverContexto();

export const esMonitoreo = CONTEXTO === CONTEXTOS.MONITOREO;
export const esEmpleados = CONTEXTO === CONTEXTOS.EMPLEADOS;
export const esPoblacion = CONTEXTO === CONTEXTOS.POBLACION;

/**
 * Prefijo de las claves de almacenamiento de este contexto.
 * Se expone para `almacen.js` y para poder purgar un contexto completo.
 */
export const PREFIJO_ALMACEN = `sssur:${CONTEXTO}:`;

/**
 * Clave bajo la que Supabase guarda la sesión de este contexto.
 *
 * Separar la clave separa también el canal de sincronización entre pestañas:
 * el SDK lo nombra a partir de ella, así que dos contextos con claves distintas
 * dejan de notificarse `onAuthStateChange` el uno al otro.
 */
export const CLAVE_SESION = `sb-sssur-${CONTEXTO}`;

/**
 * Marca el contexto en el `<html>` para que el CSS pueda distinguirlos.
 *
 * Lo necesita `assets/css/pwa-oscuro.css`: el tema oscuro de la aplicación de
 * campo se resuelve con una capa de sustitución de colores, y esa capa NO debe
 * alcanzar al Centro de Monitoreo, que tiene sus propias variantes `dark:` en
 * cada plantilla. Sin este atributo, activar el modo oscuro en un contexto
 * repintaría el otro.
 *
 * Se hace aquí y no en un componente porque este módulo se evalúa antes que
 * nada —no importa a nadie— y el atributo tiene que existir antes del primer
 * pintado, o se vería un parpadeo de tema claro.
 */
if (typeof document !== 'undefined') {
  document.documentElement.dataset.contexto = CONTEXTO;
}
