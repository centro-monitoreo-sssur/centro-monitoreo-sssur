// ============================================================================
// VISTA: detalle de una intervención (PWA de empleado)
//
// El caso llega por el store, no serializado en localStorage. Aquello guardaba
// una COPIA que envejecía: si alguien cambiaba el caso desde el Centro de
// Monitoreo, el empleado seguía viendo —y podía cerrar— la versión que tenía
// cuando pulsó la fila.
//
// El mapa tampoco es ya decorativo: pintaba SIEMPRE el centro del municipio
// con un comentario que lo admitía ("Simulamos que todas las incidencias están
// por San Salvador Sur"). Ahora usa la coordenada real del caso, y si no la
// tiene no dibuja nada en lugar de señalar un punto falso.
// ============================================================================
import { ref, computed, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useMisCasos } from '../../stores/mis-casos.js';
import { L } from '../../core/libs.js';
import { colorEstado, etiquetaEstado } from '../../utils/badge.js';
import { colorPrioridad, formatearFechaHora } from '../../utils/presentacion-campo.js';
import { crearTesela } from '../../services/mapa/teselas.js';
import { usePreferenciasCampo } from '../../stores/preferencias-campo.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { casoSeleccionado, refrescarCaso } = useMisCasos();

    const cargando = ref(true);

    // `let` plano y NUNCA un `ref`: un objeto de Leaflet dentro de un proxy
    // reactivo de Vue es el patrón que ya produjo el
    // `TypeError: ... '_latLngToNewLayerPoint'` en la consola del Mapa en Vivo.
    let mapa = null;

    const { tesela: teselaPreferida } = usePreferenciasCampo();

    const intervencion = casoSeleccionado;

    // Solo se ofrece cerrar lo que sigue abierto. La plantilla comparaba
    // `estado !== 'completada'`, un valor que no existe entre los códigos
    // reales, así que el botón salía incluso en casos ya resueltos.
    const puedeCerrarse = computed(() => Boolean(intervencion.value) && !intervencion.value.esFinal);

    const tieneUbicacion = computed(() =>
      Number.isFinite(intervencion.value?.lat) && Number.isFinite(intervencion.value?.lng)
    );

    /**
     * Abre la navegación hacia el caso en la aplicación de mapas del teléfono.
     *
     * El botón «Obtener ruta» existía en la plantilla SIN ningún manejador: es
     * la función que más usa una cuadrilla y no hacía nada.
     *
     * Se abre una URL en vez de trazar la ruta dentro de la aplicación, y es
     * deliberado: el empleado va conduciendo. Google Maps o Waze le dan voz,
     * tráfico y recálculo si se desvía; una polilínea en un mapa Leaflet, no.
     * Además evita depender de un servicio de ruteo externo y de que haya
     * cobertura para consultarlo.
     *
     * `google.com/maps/dir/?api=1` es el enlace universal: Android lo captura
     * la app de Maps, iPhone lo abre en Maps si está instalada y en el
     * navegador si no. El esquema `geo:` sería más nativo pero en iPhone no
     * está soportado, y ahí no abriría nada.
     */
    const abrirRuta = () => {
      if (!tieneUbicacion.value) return;
      const { lat, lng } = intervencion.value;
      const destino = `${lat},${lng}`;
      // `noopener` es obligatorio al abrir con `_blank`: sin él, la página
      // destino recibe una referencia a esta y puede manipularla.
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`,
        '_blank',
        'noopener'
      );
    };

    /** Copia las coordenadas, por si hay que dictarlas por radio. */
    const copiarCoordenadas = async () => {
      if (!tieneUbicacion.value) return false;
      const texto = `${intervencion.value.lat}, ${intervencion.value.lng}`;
      try {
        await navigator.clipboard.writeText(texto);
        return true;
      } catch {
        // El portapapeles exige contexto seguro y permiso. Si falla, no se
        // rompe nada: el empleado ve las coordenadas en pantalla igualmente.
        return false;
      }
    };

    const iniciarMapa = () => {
      if (!tieneUbicacion.value) return;
      const contenedor = document.getElementById('map-detalle-intervencion');
      if (!contenedor || mapa) return;

      const punto = [intervencion.value.lat, intervencion.value.lng];

      // Mapa de solo lectura: es una miniatura de referencia, no un control.
      mapa = L.map(contenedor, {
        zoomControl: false, dragging: false, touchZoom: false,
        scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
      }).setView(punto, 17);

      // La capa que el empleado eligió en Ajustes. Antes estaba fija en
      // satélite híbrido: quien prefiriera el callejero veía una vista distinta
      // aquí que en el resto de la aplicación.
      crearTesela(teselaPreferida.value).addTo(mapa);

      const color = intervencion.value.color || '#ef4444';
      L.marker(punto, {
        icon: L.divIcon({
          className: 'custom-marker',
          html: `<div style="background:${color};width:38px;height:38px;border-radius:50%;
                 display:flex;align-items:center;justify-content:center;border:3px solid #fff;
                 box-shadow:0 4px 12px rgba(0,0,0,.35);">
                 <i class="fa-solid fa-map-pin" style="color:#fff;font-size:15px;"></i></div>`,
          iconSize: [38, 38], iconAnchor: [19, 38],
        }),
      }).addTo(mapa);

      // El contenedor suele medir 0 px cuando Leaflet se monta dentro de una
      // vista que acaba de aparecer; sin esto el mapa sale en gris.
      setTimeout(() => mapa && mapa.invalidateSize(), 150);
    };

    onMounted(async () => {
      if (!intervencion.value) {
        // Entrada directa a la vista sin pasar por la lista (recarga con la
        // vista abierta). No hay nada que mostrar: se vuelve al listado.
        irA('mis-intervenciones');
        return;
      }
      // Releer del servidor: puede haber cambiado desde que se pulsó la fila.
      await refrescarCaso(intervencion.value.id);
      cargando.value = false;
      nextTick(iniciarMapa);
    });

    onUnmounted(() => {
      if (mapa) { mapa.remove(); mapa = null; }
    });

    return {
      intervencion,
      cargando,
      puedeCerrarse,
      tieneUbicacion,
      getPrioridadColor: colorPrioridad,
      getEstadoColor: colorEstado,
      getEstadoLabel: etiquetaEstado,
      formatDate: formatearFechaHora,
      abrirRuta,
      copiarCoordenadas,
      volver: () => irA('mis-intervenciones'),
      irACierre: () => irA('cierre-incidente'),
    };
  },
};
