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

  const enUrl = new URLSearchParams(window.location.search).get(PARAMETRO_URL);

  // Sin parámetro, la URL base SIGNIFICA Centro de Monitoreo. Un valor
  // inventado (`?contexto=admin`) tampoco abre nada: degrada al mismo sitio,
  // donde los permisos deciden qué puede ver quien entre.
  if (!enUrl) return CONTEXTOS.MONITOREO;
  return CONTEXTOS_VALIDOS.has(enUrl) ? enUrl : CONTEXTOS.MONITOREO;
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
