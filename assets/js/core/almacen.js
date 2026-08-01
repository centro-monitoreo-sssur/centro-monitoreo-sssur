// ============================================================
// ALMACÉN LOCAL
//
// Fachada sobre `localStorage` que antepone el contexto de la aplicación a
// cada clave (ver `app-contexto.js`). Resuelve tres fallos que el acceso
// directo a localStorage no cubre y que en una PWA de campo sí se dan:
//
//   1. COLISIÓN ENTRE APLICACIONES. Las tres apps comparten origen, así que
//      compartían `rol_usuario`, `usuario_id` y —lo más grave— `offline_queue`.
//
//   2. JSON.parse SOBRE TEXTO PLANO. Buena parte de las claves guardan cadenas
//      sueltas (un correo, 'true'). Un `JSON.parse` sobre ellas lanza una
//      excepción que hoy nadie captura y deja la vista en blanco. Por eso hay
//      operaciones separadas para texto y para objetos: el tipo se declara al
//      leer, no se adivina.
//
//   3. CUOTA AGOTADA. localStorage da ~5 MB por origen y la cola offline guarda
//      fotografías en base64. Agotarla no es hipotético: es el modo de fallo
//      esperable de un empleado sin señal durante una jornada. Escribir
//      devuelve `{ ok, error }` en vez de lanzar, para que quien llama pueda
//      avisar en pantalla en lugar de dar por buena una pérdida silenciosa.
//
// Patrón: Adaptador. El resto del código no vuelve a tocar `localStorage`
// directamente, así que cambiar el motor de persistencia —a IndexedDB cuando
// las fotos no quepan— es sustituir este archivo y nada más.
// ============================================================
import { PREFIJO_ALMACEN } from './app-contexto.js';

// Safari en navegación privada y algunos navegadores con almacenamiento
// bloqueado lanzan al TOCAR localStorage, no solo al escribir. Se comprueba una
// vez y se degrada a un mapa en memoria: la app funciona durante la sesión
// aunque no sobreviva a una recarga, que es mejor que no arrancar.
const memoria = new Map();
const hayLocalStorage = (() => {
  try {
    const sonda = '__sssur_sonda__';
    localStorage.setItem(sonda, '1');
    localStorage.removeItem(sonda);
    return true;
  } catch {
    console.warn(
      '[almacen] localStorage no está disponible (¿navegación privada?). ' +
      'Se usa memoria volátil: los datos no sobrevivirán a una recarga.'
    );
    return false;
  }
})();

const esErrorDeCuota = (e) =>
  e instanceof DOMException &&
  (e.name === 'QuotaExceededError' ||
   e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
   e.code === 22);

/**
 * Construye una fachada de almacenamiento sobre un prefijo de claves.
 * Todas las operaciones son O(1): son accesos directos por clave, sin recorrer
 * el almacén. La única excepción documentada es `limpiarTodo()`.
 */
function crearAlmacen(prefijo) {
  const completa = (nombre) => prefijo + nombre;

  const leerCrudo = (nombre) => {
    if (!hayLocalStorage) return memoria.has(completa(nombre)) ? memoria.get(completa(nombre)) : null;
    try {
      return localStorage.getItem(completa(nombre));
    } catch {
      return null;
    }
  };

  const escribirCrudo = (nombre, valor) => {
    if (!hayLocalStorage) {
      memoria.set(completa(nombre), valor);
      return { ok: true };
    }
    try {
      localStorage.setItem(completa(nombre), valor);
      return { ok: true };
    } catch (e) {
      if (esErrorDeCuota(e)) {
        console.error(
          `[almacen] Cuota de almacenamiento agotada al guardar "${nombre}". ` +
          'Lo más probable es que la cola offline acumule fotografías sin sincronizar.'
        );
        return { ok: false, error: 'cuota', mensaje: 'No queda espacio en el dispositivo.' };
      }
      console.error(`[almacen] No se pudo guardar "${nombre}":`, e);
      return { ok: false, error: 'desconocido', mensaje: e.message };
    }
  };

  return {
    /** Lee una cadena. Devuelve `porDefecto` si la clave no existe. */
    leerTexto(nombre, porDefecto = '') {
      const valor = leerCrudo(nombre);
      return valor === null ? porDefecto : valor;
    },

    /** Guarda una cadena. Devuelve `{ ok, error, mensaje }`. */
    escribirTexto(nombre, valor) {
      return escribirCrudo(nombre, String(valor));
    },

    /**
     * Lee un valor serializado como JSON. Si el contenido está corrupto —una
     * escritura a medias, o una clave que antes guardaba texto plano— devuelve
     * `porDefecto` en lugar de propagar la excepción.
     */
    leerJson(nombre, porDefecto = null) {
      const crudo = leerCrudo(nombre);
      if (crudo === null) return porDefecto;
      try {
        return JSON.parse(crudo);
      } catch {
        console.warn(`[almacen] "${nombre}" no contiene JSON válido; se descarta.`);
        return porDefecto;
      }
    },

    /** Serializa y guarda. Devuelve `{ ok, error, mensaje }`. */
    escribirJson(nombre, valor) {
      try {
        return escribirCrudo(nombre, JSON.stringify(valor));
      } catch (e) {
        // Referencias circulares: fallo del que llama, no del almacén.
        console.error(`[almacen] "${nombre}" no es serializable:`, e);
        return { ok: false, error: 'serializacion', mensaje: e.message };
      }
    },

    borrar(nombre) {
      if (!hayLocalStorage) { memoria.delete(completa(nombre)); return; }
      try {
        localStorage.removeItem(completa(nombre));
      } catch { /* nada que hacer */ }
    },

    /** Borra varias claves de una vez. O(k) sobre las claves indicadas. */
    borrarVarias(nombres) {
      for (const nombre of nombres) this.borrar(nombre);
    },

    /**
     * Borra TODAS las claves de este contexto.
     *
     * O(n) sobre el total de claves del origen, porque hay que recorrerlas para
     * saber cuáles llevan el prefijo. Se usa solo al cerrar sesión, así que el
     * coste es irrelevante; queda anotado para que nadie lo meta en un bucle.
     *
     * Se recogen las claves ANTES de borrar: `localStorage.key(i)` se apoya en
     * un índice que se reordena con cada eliminación, y borrar mientras se
     * recorre se salta la mitad de las entradas.
     */
    limpiarTodo() {
      if (!hayLocalStorage) {
        for (const clave of [...memoria.keys()]) {
          if (clave.startsWith(prefijo)) memoria.delete(clave);
        }
        return;
      }
      try {
        const aBorrar = [];
        for (let i = 0; i < localStorage.length; i++) {
          const clave = localStorage.key(i);
          if (clave && clave.startsWith(prefijo)) aBorrar.push(clave);
        }
        for (const clave of aBorrar) localStorage.removeItem(clave);
      } catch { /* nada que hacer */ }
    },
  };
}

/**
 * Almacén de la aplicación activa. Todo lo que sea estado de una app concreta
 * —sesión, cola offline, filtros, borradores— va aquí.
 */
export const almacen = crearAlmacen(PREFIJO_ALMACEN);

/**
 * Almacén compartido por las tres apps, para PREFERENCIAS DEL DISPOSITIVO.
 *
 * Es deliberadamente global: el tema oscuro es una preferencia de quien mira la
 * pantalla, no de la aplicación que tiene abierta, y obligarle a activarlo tres
 * veces sería un fallo de producto. `color-theme` además lo lee un script
 * en línea de `index.html` antes de que cargue ningún módulo (anti-FOUC), así
 * que su clave tiene que quedarse sin prefijo.
 */
export const almacenDispositivo = crearAlmacen('');
