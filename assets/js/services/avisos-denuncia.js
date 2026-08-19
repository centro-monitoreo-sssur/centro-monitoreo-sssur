// ============================================================
// SERVICIO: avisar al vecino cuando su denuncia cambia de estado
//
// El botón «Recibir Notificaciones» del portal tampoco tenía `@click`. Esto es
// lo que hace ahora, y conviene ser exacto sobre su alcance:
//
// ── LO QUE HACE ─────────────────────────────────────────────────────────────
// Pide permiso de notificaciones, recuerda qué denuncias sigue esta persona, y
// cada vez que la aplicación relee sus denuncias —al abrirla, al volver a ella,
// al entrar en «Mis Denuncias»— compara el estado con el que vio la última vez.
// Si cambió, lanza una notificación del sistema.
//
// En la práctica: el vecino abre la aplicación y el teléfono le avisa de que su
// bache pasó a «En obra», aunque haya ocurrido tres días antes. No tiene que
// buscar el cambio.
//
// ── LO QUE NO HACE, Y HAY QUE DECIRLO ───────────────────────────────────────
// NO avisa con la aplicación cerrada. Eso es Web Push, y necesita tres cosas
// que hoy no existen: un par de claves VAPID, una tabla de suscripciones, y un
// proceso en el servidor que empuje el mensaje cuando el caso cambia en la
// base. Ninguna es imposible —el service worker ya está—, pero es otro
// entregable.
//
// Prometer aquí un aviso que no va a llegar sería peor que no ofrecerlo: el
// vecino dejaría de mirar. Por eso la vista dice literalmente cuándo avisa.
//
// ── DÓNDE VIVE LA SUSCRIPCIÓN ───────────────────────────────────────────────
// En el almacén local, no en la base. Es una preferencia de ESTE dispositivo:
// las notificaciones las lanza este navegador y nada más, así que guardarla en
// el servidor daría a entender que sigue valiendo desde otro teléfono. Cuando
// exista Web Push, la suscripción pasará a la base junto con su endpoint, que
// es cuando tendrá sentido.
// ============================================================
import { ref } from '../core/vue.js';
import { almacen } from '../core/almacen.js';

const CLAVE_SEGUIDAS = 'denuncias_seguidas';
const CLAVE_ESTADOS = 'denuncias_ultimo_estado';
const ICONO_AVISO = '/assets/img/marca/icono-192.png';

// Se publica en un `ref` para que la vista pinte el botón según corresponda sin
// consultar el almacén en cada repintado.
export const seguidas = ref(new Set(almacen.leerJson(CLAVE_SEGUIDAS, []) || []));

/** ¿Puede este navegador mostrar notificaciones del sistema? */
export function avisosSoportados() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 'default' | 'granted' | 'denied' | 'no-soportado' */
export function permisoAvisos() {
  return avisosSoportados() ? Notification.permission : 'no-soportado';
}

export function sigueDenuncia(casoId) {
  return seguidas.value.has(Number(casoId));
}

function guardarSeguidas() {
  almacen.escribirJson(CLAVE_SEGUIDAS, [...seguidas.value]);
}

/**
 * Activa o desactiva el aviso de una denuncia.
 *
 * Pide el permiso solo al ACTIVAR, y solo si no se ha decidido antes: pedirlo
 * al abrir la aplicación, sin que nadie lo haya solicitado, es la vía más
 * rápida a que lo denieguen para siempre.
 *
 * @returns {Promise<{ok: boolean, sigue: boolean, motivo: string}>}
 */
export async function alternarAviso(casoId) {
  const id = Number(casoId);
  if (!Number.isFinite(id)) return { ok: false, sigue: false, motivo: 'Denuncia no válida.' };

  if (seguidas.value.has(id)) {
    seguidas.value = new Set([...seguidas.value].filter((x) => x !== id));
    guardarSeguidas();
    return { ok: true, sigue: false, motivo: '' };
  }

  if (!avisosSoportados()) {
    return { ok: false, sigue: false, motivo: 'Este navegador no puede mostrar notificaciones.' };
  }

  let permiso = Notification.permission;
  if (permiso === 'default') {
    try { permiso = await Notification.requestPermission(); }
    catch (e) { permiso = 'denied'; }
  }
  if (permiso !== 'granted') {
    return {
      ok: false, sigue: false,
      motivo: 'Las notificaciones están bloqueadas para este sitio. '
            + 'Actívalas desde los ajustes del navegador y vuelve a intentarlo.',
    };
  }

  seguidas.value = new Set([...seguidas.value, id]);
  guardarSeguidas();
  return { ok: true, sigue: true, motivo: '' };
}

/**
 * Muestra una notificación.
 *
 * A través del service worker cuando lo hay: en Android, `new Notification()`
 * lanza `TypeError: Illegal constructor` en cuanto la página está controlada
 * por un SW, que es siempre en esta aplicación. El constructor queda de
 * respaldo para escritorio.
 */
async function mostrarAviso(titulo, cuerpo, datos) {
  const opciones = {
    body: cuerpo,
    // El mismo icono que declaran los manifiestos. Local desde que se
    // vendorizó todo: un aviso con el icono roto es lo que pasaba cuando el
    // teléfono no tenía cobertura, que es justo cuando más se nota.
    icon: ICONO_AVISO,
    badge: ICONO_AVISO,
    // Una denuncia, un aviso: si el estado cambia dos veces antes de que la
    // persona mire, ve el último y no dos avisos apilados.
    tag: `denuncia-${datos.casoId}`,
    renotify: true,
    data: datos,
  };
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro?.showNotification) { await registro.showNotification(titulo, opciones); return; }
  } catch (e) { /* se intenta con el constructor */ }
  try { new Notification(titulo, opciones); }
  catch (e) { console.warn('[avisos] No se pudo mostrar la notificación:', e.message); }
}

/**
 * Compara los estados con los de la última vez y avisa de lo que cambió.
 *
 * Se llama desde el store en cuanto se releen las denuncias, y no desde una
 * vista: así funciona igual se haya entrado por «Mis Denuncias», por el detalle
 * o por volver a la aplicación, sin repetir la lógica en tres sitios.
 *
 * La instantánea se guarda para TODAS las denuncias, no solo las seguidas: si
 * alguien activa el aviso hoy, no debe recibir de golpe el historial de
 * cambios que ya conocía.
 *
 * @param {Array} denuncias  filas de `v_mis_denuncias_ciudadano`
 */
export function revisarCambiosDeEstado(denuncias) {
  const filas = Array.isArray(denuncias) ? denuncias : [];
  if (!filas.length) return;

  const previos = almacen.leerJson(CLAVE_ESTADOS, {}) || {};
  const actuales = {};
  const cambios = [];

  for (const d of filas) {
    const id = Number(d.id);
    const estado = d.estado_codigo || '';
    actuales[id] = estado;

    const anterior = previos[id];
    // `undefined` es una denuncia que este dispositivo no había visto nunca:
    // no es un cambio, es la primera lectura.
    if (anterior !== undefined && anterior !== estado && seguidas.value.has(id)) {
      cambios.push({ id, correlativo: d.correlativo, estado, cerrada: Boolean(d.fecha_cierre) });
    }
  }

  almacen.escribirJson(CLAVE_ESTADOS, actuales);

  if (!cambios.length || permisoAvisos() !== 'granted') return;

  for (const c of cambios) {
    mostrarAviso(
      c.cerrada ? 'Tu denuncia fue resuelta' : 'Tu denuncia avanzó',
      `${c.correlativo || 'Denuncia #' + c.id} · ahora está en «${c.estado}».`,
      { casoId: c.id }
    );
  }
}

/** Deja de seguir todo. Para el cierre de sesión: el siguiente puede ser otra persona. */
export function olvidarAvisos() {
  seguidas.value = new Set();
  almacen.borrarVarias([CLAVE_SEGUIDAS, CLAVE_ESTADOS]);
}

export function useAvisosDenuncia() {
  return {
    seguidas,
    avisosSoportados, permisoAvisos, sigueDenuncia,
    alternarAviso, revisarCambiosDeEstado, olvidarAvisos,
  };
}
