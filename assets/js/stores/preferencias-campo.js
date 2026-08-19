// ============================================================
// STORE: preferencias del empleado en su dispositivo
//
// Cómo quiere VER la aplicación cada persona: tema, capa base del mapa y qué
// límites territoriales dibujar.
//
// ── POR QUÉ EN EL DISPOSITIVO Y NO EN LA BASE ───────────────────────────────
// Son preferencias de interfaz, no datos de la municipalidad. Guardarlas en
// Postgres tendría tres costes sin ninguna ventaja: una consulta más en cada
// arranque, una escritura por cada vez que alguien toca un interruptor, y
// espacio en los 500 MB del plan gratuito. Además dejarían de funcionar sin
// cobertura, que es justo cuando el empleado está en territorio.
//
// El criterio ya lo sigue `stores/configuracion.js` para lo suyo.
//
// Se usa `almacen` y no `localStorage` directo: el almacén prefija por contexto
// —así el Centro de Monitoreo y la PWA no se pisan las claves en el mismo
// navegador— y absorbe el JSON corrupto, la cuota excedida y el modo privado de
// Safari, donde escribir lanza una excepción.
// ============================================================
import { ref, computed, watch } from '../core/vue.js';
import { almacen, almacenDispositivo } from '../core/almacen.js';
import { normalizarTesela, TESELA_POR_DEFECTO } from '../services/mapa/teselas.js';

const CLAVE_PREFERENCIAS = 'preferencias_campo';
// El tema comparte clave con el resto del sistema y va SIN prefijo de contexto:
// lo lee el script anti-parpadeo del index.html, que se ejecuta antes de que
// exista ningún módulo y no sabe nada de contextos.
const CLAVE_TEMA = 'color-theme';

const DEFECTOS = Object.freeze({
  tema: 'auto',                 // 'claro' | 'oscuro' | 'auto'
  tesela: TESELA_POR_DEFECTO,
  capas: { municipio: true, distritos: true, colonias: true },
  // Mantener la pantalla encendida mientras se levanta un reporte. Se guarda la
  // intención aunque el navegador pueda denegarla.
  pantallaActiva: false,
});

function leerGuardadas() {
  const crudo = almacen.leerJson(CLAVE_PREFERENCIAS, null);
  if (!crudo || typeof crudo !== 'object') return { ...DEFECTOS };
  return {
    tema: ['claro', 'oscuro', 'auto'].includes(crudo.tema) ? crudo.tema : DEFECTOS.tema,
    // Se normaliza al leer: puede venir un identificador de los antiguos,
    // guardado antes de unificar el catálogo de teselas.
    tesela: normalizarTesela(crudo.tesela),
    capas: { ...DEFECTOS.capas, ...(crudo.capas || {}) },
    pantallaActiva: crudo.pantallaActiva === true,
  };
}

const preferencias = ref(leerGuardadas());

/* Persistencia automática. `deep` porque `capas` es un objeto anidado y sin él
   marcar un interruptor no dispararía el guardado. */
watch(preferencias, (valor) => {
  const res = almacen.escribirJson(CLAVE_PREFERENCIAS, valor);
  if (res && res.ok === false) {
    console.warn('[preferencias-campo] No se pudieron guardar:', res.error);
  }
}, { deep: true });

// ── Tema ────────────────────────────────────────────────────────────────────

/**
 * ¿Toca pintar oscuro ahora mismo?
 *
 * Con 'auto' se sigue la preferencia del sistema operativo, que es lo que
 * espera alguien que tiene el teléfono en modo nocturno programado.
 */
const prefiereOscuroElSistema = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const temaEfectivo = computed(() => {
  const t = preferencias.value.tema;
  if (t === 'oscuro') return 'oscuro';
  if (t === 'claro') return 'claro';
  return prefiereOscuroElSistema() ? 'oscuro' : 'claro';
});

/**
 * Aplica el tema al documento.
 *
 * La clase `dark` en el `<html>` es la misma que usa el Centro de Monitoreo;
 * lo que cambia es que en la PWA la interpreta `assets/css/pwa-oscuro.css`,
 * acotado por `[data-contexto="empleados"]`.
 */
function aplicarTema() {
  if (typeof document === 'undefined') return;
  const oscuro = temaEfectivo.value === 'oscuro';
  document.documentElement.classList.toggle('dark', oscuro);
  // Se escribe el valor RESUELTO, no 'auto': el script anti-parpadeo del
  // index.html corre antes que cualquier módulo y solo entiende claro/oscuro.
  almacenDispositivo.escribirTexto(CLAVE_TEMA, oscuro ? 'dark' : 'light');

  // La barra de estado del teléfono acompaña al tema cuando la PWA está
  // instalada. Sin esto queda una franja blanca sobre una aplicación oscura.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', oscuro ? '#0b1220' : '#047857');
}

let escuchaSistema = null;

/** Arranca el tema y se suscribe a los cambios del sistema si procede. */
function iniciarTema() {
  aplicarTema();
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

  // Solo importa en 'auto': si el usuario eligió explícitamente, su decisión
  // manda por encima de lo que haga el sistema operativo.
  if (!escuchaSistema) {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    escuchaSistema = () => { if (preferencias.value.tema === 'auto') aplicarTema(); };
    // `addEventListener` no existe en Safari antiguo, donde el método es
    // `addListener`. Se prueban los dos.
    if (consulta.addEventListener) consulta.addEventListener('change', escuchaSistema);
    else if (consulta.addListener) consulta.addListener(escuchaSistema);
  }
}

watch(temaEfectivo, aplicarTema);

/**
 * Logo institucional que corresponde al tema vigente.
 *
 * El azul horizontal sobre fondo oscuro es prácticamente invisible: en la
 * cabecera de la PWA se veía un hueco donde debía estar la marca. La versión
 * blanca existe y es la que la Alcaldía usa sobre fondos oscuros.
 *
 * Vive aquí y no en cada plantilla porque el logo aparece en varias vistas y
 * duplicar la condición garantiza que alguna se quede sin cambiar.
 */
const LOGO_CLARO  = '/assets/img/marca/logo-azul-horizontal.png';
const LOGO_OSCURO = '/assets/img/marca/logo-blanco-horizontal.png';

const logoHorizontal = computed(() =>
  temaEfectivo.value === 'oscuro' ? LOGO_OSCURO : LOGO_CLARO
);

// ── API ─────────────────────────────────────────────────────────────────────

export function usePreferenciasCampo() {
  const fijarTema = (valor) => {
    if (['claro', 'oscuro', 'auto'].includes(valor)) preferencias.value.tema = valor;
  };

  const fijarTesela = (id) => {
    preferencias.value.tesela = normalizarTesela(id);
  };

  const alternarCapa = (id) => {
    if (id in preferencias.value.capas) {
      preferencias.value.capas[id] = !preferencias.value.capas[id];
    }
  };

  const fijarPantallaActiva = (valor) => {
    preferencias.value.pantallaActiva = valor === true;
  };

  /** Vuelve a los valores de fábrica. */
  const restablecer = () => {
    preferencias.value = { ...DEFECTOS, capas: { ...DEFECTOS.capas } };
  };

  return {
    preferencias,
    temaEfectivo,
    logoHorizontal,
    tema: computed(() => preferencias.value.tema),
    tesela: computed(() => preferencias.value.tesela),
    capas: computed(() => preferencias.value.capas),
    pantallaActiva: computed(() => preferencias.value.pantallaActiva),
    fijarTema, fijarTesela, alternarCapa, fijarPantallaActiva,
    restablecer, iniciarTema,
  };
}
