// ============================================================
// SERVICIO: ubicación del dispositivo, pedida cuanto antes
//
// EL PROBLEMA
//
// Cada vista pedía el GPS por su cuenta, y siempre DESPUÉS de crear el mapa.
// Como el primer arreglo de GPS tarda entre 3 y 15 segundos —más bajo techo o
// con señal débil, que es lo habitual en territorio—, esos segundos se sumaban
// al tiempo de carga del mapa en vez de solaparse con él.
//
// Aquí la petición arranca al abrir la aplicación. Cuando el mapa termina de
// dibujarse, la posición suele estar lista y el marcador aparece de inmediato.
//
// ── POR QUÉ NO SE PIDE SIEMPRE AL ARRANCAR ──────────────────────────────────
//
// Porque pedir la ubicación dispara el diálogo de permiso del navegador, y
// hacerlo nada más abrir —antes de que la persona haya visto siquiera para qué
// sirve la aplicación— es la mejor forma de que pulse «Bloquear». Y un bloqueo
// es pegajoso: no se vuelve a preguntar, hay que ir a los ajustes del navegador
// a deshacerlo, y para entonces la aplicación ya parece rota.
//
// La API de permisos permite CONSULTAR el estado sin provocar el diálogo. Así:
//
//   · `granted`  → ya dijo que sí antes. Se precalienta: ni diálogo ni espera.
//   · `prompt`   → nunca se le ha preguntado. Se espera a que la vista lo pida
//                  de verdad, para que el diálogo salga con contexto.
//   · `denied`   → dijo que no. No se insiste.
//
// O sea: el atajo se aplica exactamente a quien ya lo autorizó, que en una PWA
// instalada es la práctica totalidad de los usos a partir del segundo.
// ============================================================
import { ref, computed } from '../core/vue.js';

/** Última posición conocida. `null` mientras no haya ninguna. */
const posicion = ref(null);       // { lat, lng, precision, momento }
const buscando = ref(false);
const errorUbicacion = ref('');

/** 'desconocido' | 'granted' | 'prompt' | 'denied' */
const permiso = ref('desconocido');

const hayUbicacion = computed(() => posicion.value !== null);

/** Edad de la posición guardada, en milisegundos. Infinito si no hay ninguna. */
function edadPosicion() {
  if (!posicion.value) return Infinity;
  return Date.now() - posicion.value.momento;
}

const soportado = () =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator;

function guardar(pos) {
  posicion.value = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    precision: pos.coords.accuracy,
    momento: Date.now(),
  };
  errorUbicacion.value = '';
  return posicion.value;
}

/** Traduce el error del navegador a algo que se le pueda decir a una persona. */
function traducirError(err) {
  if (err?.code === 1) return 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.';
  if (err?.code === 3) return 'El GPS tardó demasiado. Inténtalo en un punto despejado.';
  return 'No se pudo obtener la ubicación.';
}

/**
 * Consulta el estado del permiso SIN provocar el diálogo.
 *
 * Si la API de permisos no existe —Safari antiguo, algún navegador embebido—
 * se devuelve 'desconocido' y no se precalienta: mejor perder el atajo que
 * arriesgarse a lanzar un diálogo sin contexto.
 */
async function consultarPermiso() {
  if (!soportado()) { permiso.value = 'denied'; return permiso.value; }
  try {
    if (!navigator.permissions?.query) { permiso.value = 'desconocido'; return permiso.value; }
    const estado = await navigator.permissions.query({ name: 'geolocation' });
    permiso.value = estado.state;
    // Si la persona lo cambia desde los ajustes del navegador con la
    // aplicación abierta, el atajo se activa o se apaga sin recargar.
    estado.onchange = () => {
      permiso.value = estado.state;
      if (estado.state === 'granted' && !posicion.value) precalentar();
      if (estado.state === 'denied') posicion.value = null;
    };
    return permiso.value;
  } catch {
    permiso.value = 'desconocido';
    return permiso.value;
  }
}

let _precalentando = null;

/**
 * Arranca la búsqueda si ya hay permiso concedido.
 *
 * Se llama al abrir la aplicación. No devuelve nada útil a propósito: quien la
 * llama no espera el resultado, solo pone el GPS en marcha para que esté listo
 * cuando alguna vista lo necesite.
 */
async function precalentar() {
  if (!soportado() || _precalentando) return;

  const estado = await consultarPermiso();
  if (estado !== 'granted') return;   // ver el encabezado

  _precalentando = new Promise((resolver) => {
    buscando.value = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => { guardar(pos); buscando.value = false; _precalentando = null; resolver(posicion.value); },
      (err) => {
        buscando.value = false;
        _precalentando = null;
        // No se escribe en `errorUbicacion`: esto ocurre de fondo y nadie lo
        // ha pedido. Avisar de un fallo que la persona no provocó, en una
        // pantalla donde ni siquiera hay mapa, solo confunde.
        console.warn('[ubicacion] Precalentamiento fallido:', err.message);
        resolver(null);
      },
      // `enableHighAccuracy` desde el principio: encender el GPS es justo lo
      // que tarda, y hacerlo aquí es el motivo de existir de esta función.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  });
}

/**
 * Devuelve una posición, usando la guardada si sigue siendo válida.
 *
 * @param {object}  opciones
 * @param {number}  opciones.maxEdadMs  Cuán vieja se acepta la guardada.
 *                                      0 obliga a una medición nueva.
 * @returns {Promise<{lat,lng,precision,momento}|null>}
 */
function obtenerPosicion({ maxEdadMs = 30000 } = {}) {
  if (!soportado()) {
    errorUbicacion.value = 'Este dispositivo no permite geolocalización.';
    return Promise.resolve(null);
  }

  // El atajo que hace que todo esto valga la pena: si el precalentamiento ya
  // trajo una posición reciente, se responde sin esperar al GPS.
  if (maxEdadMs > 0 && edadPosicion() <= maxEdadMs) {
    return Promise.resolve(posicion.value);
  }

  // Petición en vuelo: se comparte en vez de lanzar otra. Dos vistas pidiendo
  // a la vez encenderían el GPS dos veces.
  if (_precalentando) return _precalentando;

  buscando.value = true;
  errorUbicacion.value = '';

  return new Promise((resolver) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { guardar(pos); buscando.value = false; resolver(posicion.value); },
      (err) => {
        buscando.value = false;
        errorUbicacion.value = traducirError(err);
        if (err?.code === 1) permiso.value = 'denied';
        console.warn('[ubicacion]', err.message);
        resolver(null);
      },
      // 15 s y no 5: en campo, con señal débil, el primer arreglo rara vez
      // llega en cinco segundos y un timeout corto falla justo cuando más
      // falta hace.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: Math.max(maxEdadMs, 0) }
    );
  });
}

// ── Seguimiento continuo ────────────────────────────────────────────────────

let _watchId = null;
const siguiendo = ref(false);

/**
 * Sigue la posición hasta que se detenga.
 *
 * @param {(p) => void} alMoverse  Se llama con cada posición nueva.
 */
function iniciarSeguimiento(alMoverse) {
  if (!soportado() || _watchId !== null) return;

  siguiendo.value = true;
  _watchId = navigator.geolocation.watchPosition(
    (pos) => { const p = guardar(pos); if (alMoverse) alMoverse(p); },
    (err) => {
      // Un error puntual no apaga el seguimiento: en campo es normal perder el
      // arreglo un momento al pasar bajo techo. Solo el permiso denegado lo
      // detiene, porque de ese no se vuelve solo.
      if (err.code === 1) {
        detenerSeguimiento();
        permiso.value = 'denied';
        errorUbicacion.value = traducirError(err);
      } else {
        console.warn('[ubicacion] seguimiento:', err.message);
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

function detenerSeguimiento() {
  if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  siguiendo.value = false;
}

export function useUbicacion() {
  return {
    posicion, hayUbicacion, buscando, errorUbicacion, permiso, siguiendo,
    precalentar, obtenerPosicion, consultarPermiso,
    iniciarSeguimiento, detenerSeguimiento,
    edadPosicion,
  };
}
