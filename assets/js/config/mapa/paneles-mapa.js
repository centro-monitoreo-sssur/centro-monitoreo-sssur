// ============================================================
// CONFIGURACIÓN: paneles laterales del Mapa en Vivo
//
// Describe la ESTRUCTURA de los dos paneles laterales (feed a la izquierda,
// capas a la derecha), sus secciones plegables y el estado con el que
// arrancan. No contiene lógica de Leaflet ni de datos: es la declaración que
// consume `admin/vista-mapa.js`.
//
// Existe para que cambiar qué paneles hay, cómo se llaman o cuáles arrancan
// abiertos no obligue a bucear en las 1200 líneas de la vista. El estado
// inicial sale de `configuracion.mapa`, así que el superadmin lo define desde
// Configuración → Mapa en vez de que esté escrito a fuego.
// ============================================================

/** Los dos paneles laterales de la consola. */
export const PANELES = [
  {
    id: 'feed',
    lado: 'izquierda',
    titulo: 'Feed de incidencias',
    icono: 'fa-list-ul',
    // Clave de `config.mapa` que decide si arranca abierto.
    claveConfig: 'panelFeedAbierto',
    // Pestaña equivalente en el bottom sheet móvil.
    tabMovil: 'feed',
  },
  {
    id: 'capas',
    lado: 'derecha',
    titulo: 'Capas del mapa',
    icono: 'fa-layer-group',
    claveConfig: 'panelCapasAbierto',
    tabMovil: 'capas',
  },
];

/**
 * Secciones plegables del panel de capas. El orden es el de aparición.
 * `clave` apunta a `config.mapa` para el estado inicial de cada acordeón.
 */
export const SECCIONES_CAPAS = [
  { id: 'tipos',          titulo: 'Tipos de denuncia', icono: 'fa-shapes',           clave: 'acordeonTipos' },
  { id: 'tramos',         titulo: 'Tramos en obra',    icono: 'fa-road',             clave: 'acordeonTramos' },
  { id: 'intervenciones', titulo: 'Intervenciones',    icono: 'fa-screwdriver-wrench', clave: 'acordeonIntervenciones' },
];

/** Bloques del menú de capas (tipo de mapa y herramientas). */
export const SECCIONES_MENU_CAPAS = [
  { id: 'tipoMapa',     titulo: 'Tipo de mapa',  icono: 'fa-map' },
  { id: 'herramientas', titulo: 'Herramientas',  icono: 'fa-toolbox' },
];

/** Pestañas del bottom sheet en móvil. A menos de 1024 px no caben los dos
 *  paneles a la vez, así que se alternan. */
export const TABS_MOVIL = PANELES.map((p) => ({
  id: p.tabMovil, titulo: p.titulo, icono: p.icono,
}));

/**
 * Estado inicial de los paneles, resuelto contra la configuración guardada.
 * Devuelve valores planos; la vista los envuelve en refs.
 *
 * `??` y no `||`: con `||` un `false` guardado a propósito se sustituiría por
 * el valor por defecto y el panel arrancaría abierto pese a la configuración.
 */
export function estadoInicialPaneles(configMapa = {}) {
  return {
    feedOpen: configMapa.panelFeedAbierto ?? true,
    rpanelOpen: configMapa.panelCapasAbierto ?? true,
    // Auto-repliegue. `> 0` como guarda: un 0 o un valor no numérico guardado
    // por error cerraría los paneles en el mismo frame en que se pintan, y
    // parecería que nunca existieron.
    autoOcultar: (configMapa.autoOcultarPaneles ?? true) && Number(configMapa.segundosAutoOcultar) !== 0,
    msAutoOcultar: Math.max(500, (Number(configMapa.segundosAutoOcultar) || 2.5) * 1000),
    kpisOpen: configMapa.kpisVisiblesMovil ?? false,
    mobileTab: configMapa.tabMovilInicial || 'feed',
    acordeonTipos: configMapa.acordeonTipos ?? true,
    acordeonTramos: configMapa.acordeonTramos ?? true,
    acordeonIntervenciones: configMapa.acordeonIntervenciones ?? true,
    seccionesCapas: {
      tipoMapa: configMapa.seccionTipoMapa ?? true,
      herramientas: configMapa.seccionHerramientas ?? true,
    },
  };
}
