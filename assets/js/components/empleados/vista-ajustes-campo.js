// ============================================================================
// VISTA: Ajustes (PWA de empleado)
//
// Preferencias de cómo se VE la aplicación, guardadas en el propio teléfono.
// Nada de esto viaja a la base: son decisiones personales de interfaz, y
// además tienen que funcionar sin cobertura, que es cuando el empleado está en
// territorio. Ver el encabezado de `stores/preferencias-campo.js`.
//
// La vista previa del mapa es en vivo y no una imagen: cada capa se ve distinta
// según la hora y la zona, y un empleado que trabaja en Panchimalco necesita
// saber cómo se verá SU territorio, no un ejemplo genérico.
// ============================================================================
import { ref, computed, onMounted, onUnmounted, watch } from '../../core/vue.js';
import { L } from '../../core/libs.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { usePreferenciasCampo } from '../../stores/preferencias-campo.js';
import { CATALOGO_TESELAS, crearTesela } from '../../services/mapa/teselas.js';
import { CAPAS } from '../../services/mapa/capas-territoriales.js';

// Centro aproximado del municipio, para la vista previa.
const CENTRO_SSSUR = [13.6100, -89.1750];

export default {
  name: 'vista-ajustes-campo',
  setup() {
    const { irA } = useNavegacion();
    const {
      preferencias, tema, tesela, capas, pantallaActiva, temaEfectivo,
      fijarTema, fijarTesela, alternarCapa, fijarPantallaActiva, restablecer,
    } = usePreferenciasCampo();

    const aviso = ref('');
    const mostrarAviso = (texto) => {
      aviso.value = texto;
      setTimeout(() => { aviso.value = ''; }, 2500);
    };

    /* ─── Opciones ─────────────────────────────────────────────────────── */

    const OPCIONES_TEMA = [
      { id: 'claro',  nombre: 'Claro',  icono: 'fa-sun',            detalle: 'Máxima legibilidad a pleno sol' },
      { id: 'oscuro', nombre: 'Oscuro', icono: 'fa-moon',           detalle: 'Menos brillo en turnos nocturnos' },
      { id: 'auto',   nombre: 'Automático', icono: 'fa-circle-half-stroke', detalle: 'Sigue la configuración del teléfono' },
    ];

    const catalogoTeselas = CATALOGO_TESELAS;

    /* Capas territoriales. Se describen por lo que aportan en campo, no por su
       nombre técnico: al empleado le importa si puede ubicar su colonia, no
       cómo se llama la tabla. */
    const OPCIONES_CAPAS = [
      { id: 'municipio',  nombre: 'Límite del municipio', detalle: 'Hasta dónde llega San Salvador Sur' },
      { id: 'distritos',  nombre: 'Distritos',            detalle: 'Los cinco territorios' },
      { id: 'colonias',   nombre: 'Colonias',             detalle: 'Solo disponibles en San Marcos' },
    ];

    /* ─── Vista previa en vivo ─────────────────────────────────────────── */
    // `let` plano y NUNCA un `ref`: un objeto de Leaflet dentro de un proxy
    // reactivo de Vue rompe sus métodos internos. Es el error que ya produjo
    // `TypeError: ... '_latLngToNewLayerPoint'` en el mapa de la consola.
    let mapaPrevio = null;
    let capaBase = null;
    let capasTerritorio = {};

    const pintarCapasTerritorio = async () => {
      if (!mapaPrevio) return;

      for (const id of Object.keys(capasTerritorio)) {
        mapaPrevio.removeLayer(capasTerritorio[id]);
      }
      capasTerritorio = {};

      const oscura = !!CATALOGO_TESELAS.find((t) => t.id === tesela.value)?.esOscura;
      const modo = oscura ? 'satelite' : 'claro';

      for (const id of ['municipio', 'distritos']) {
        if (!capas.value[id]) continue;
        const definicion = CAPAS[id];
        if (!definicion) continue;
        try {
          const datos = await definicion.cargar();
          if (!datos) continue;
          capasTerritorio[id] = L.geoJSON(datos, { style: definicion.estilo(modo) }).addTo(mapaPrevio);
        } catch {
          // La vista previa es informativa: si una capa no carga, se sigue
          // mostrando el resto en vez de dejar el recuadro en blanco.
        }
      }
    };

    const aplicarTeselaPrevia = () => {
      if (!mapaPrevio) return;
      if (capaBase) mapaPrevio.removeLayer(capaBase);
      capaBase = crearTesela(tesela.value).addTo(mapaPrevio);
      pintarCapasTerritorio();
    };

    const iniciarPrevia = () => {
      const contenedor = document.getElementById('mapa-previo-ajustes');
      if (!contenedor || mapaPrevio) return;

      mapaPrevio = L.map(contenedor, {
        center: CENTRO_SSSUR,
        zoom: 12,
        // Sin controles ni gestos: es una muestra, no un mapa de trabajo. Que
        // se pueda arrastrar invitaría a usarlo para navegar y no es su papel.
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        touchZoom: false, keyboard: false, boxZoom: false, tap: false,
      });
      aplicarTeselaPrevia();
      // Leaflet mide mal el contenedor si se crea mientras la vista aún está
      // entrando; un reajuste tras el primer pintado lo resuelve.
      setTimeout(() => mapaPrevio && mapaPrevio.invalidateSize(), 120);
    };

    watch(tesela, aplicarTeselaPrevia);
    watch(capas, pintarCapasTerritorio, { deep: true });

    /* ─── Acciones ─────────────────────────────────────────────────────── */

    const elegirTema = (id) => {
      fijarTema(id);
      mostrarAviso(id === 'auto' ? 'Tema automático activado' : `Tema ${id} activado`);
    };

    const elegirTesela = (id) => { fijarTesela(id); };

    const alternar = (id) => {
      // El municipio y los distritos se pueden apagar; las colonias también.
      // No se impide dejarlo todo apagado: hay quien prefiere el mapa limpio.
      alternarCapa(id);
    };

    const confirmarRestablecer = ref(false);
    const restablecerTodo = () => {
      restablecer();
      confirmarRestablecer.value = false;
      aplicarTeselaPrevia();
      mostrarAviso('Preferencias restablecidas');
    };

    /* ─── Ciclo de vida ────────────────────────────────────────────────── */

    onMounted(() => { setTimeout(iniciarPrevia, 60); });

    onUnmounted(() => {
      // Sin esto queda un mapa vivo escuchando eventos de un DOM que ya no
      // existe, y cada entrada a Ajustes deja otro más.
      if (mapaPrevio) { mapaPrevio.remove(); mapaPrevio = null; }
      capaBase = null;
      capasTerritorio = {};
    });

    return {
      preferencias, tema, tesela, capas, pantallaActiva, temaEfectivo,
      OPCIONES_TEMA, catalogoTeselas, OPCIONES_CAPAS,
      aviso, confirmarRestablecer,
      elegirTema, elegirTesela, alternar, fijarPantallaActiva, restablecerTodo,
      irA,
    };
  },
};
