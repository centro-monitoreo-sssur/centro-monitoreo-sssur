// Vista: Mapa en Vivo (Mobile PWA - Empleados)
import { ref, watch, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { marcadorDenuncia } from '../../services/marcadores.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { cargarLimitesSSSur, cargarColoniasSanMarcos } from '../../services/geo-json/cargador.js';
import { leerVistaMapa, restaurarVistaMapa, vigilarVistaMapa } from '../../utils/vista-mapa-persistida.js';
// Catálogo único de capas base y estilos territoriales compartidos con la
// consola. Antes esta vista tenía su propia lista de teselas y sus propios
// colores: por eso las colonias salían violeta sobre satélite y se perdían.
import { crearTesela, normalizarTesela } from '../../services/mapa/teselas.js';
import { CAPAS } from '../../services/mapa/capas-territoriales.js';
import { usePreferenciasCampo } from '../../stores/preferencias-campo.js';
import { useUbicacion } from '../../services/ubicacion.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { denuncias } = useDenuncias();
    
    const mapa = ref(null);
    const mostrarMenuCapas = ref(false);
    // Arranca en satélite: sobre la foto aérea se ven caminos, veredas y
    // construcciones que el callejero de OSM no tiene mapeadas, que es
    // justo lo que hace falta para ubicar una incidencia en zona rural.
    const CLAVE_VISTA_MAPA = 'empleado-mapa-vivo';
    let _dejarDeVigilarVista = null;
    // Prioridad: lo último que se usó en ESTE mapa → la preferencia elegida en
    // Ajustes → el valor por defecto del catálogo. Se normaliza porque puede
    // haber guardado un identificador de los antiguos ('satellite', 'google').
    /* UNA SOLA FUENTE DE VERDAD PARA LA CAPA BASE: la preferencia de Ajustes.
       Antes la vista guardaba su propia tesela con `vigilarVistaMapa` en cada
       movimiento del mapa, y al montar esa copia ganaba sobre la preferencia:
           leerVistaMapa(...)?.estilo || teselaPreferida.value
       Bastaba con haber abierto el mapa una vez para que Ajustes dejara de
       tener efecto, porque la copia ya existía y nunca era nula.
       El recuerdo por vista sigue existiendo, pero solo para el CENTRO y el
       ZOOM —dónde estaba trabajando la cuadrilla—, que sí son de esa vista. */
    const { tesela: teselaPreferida, capas: capasPreferidas, fijarTesela } = usePreferenciasCampo();
    const estiloTile = ref(normalizarTesela(teselaPreferida.value));
    const capaBase = ref(null);
    let marcadorGPS = null;
    let radioGPS = null;
    let marcadoresLayer = null;
    let capaLimitesRef = null;
    let capaDistritosRef = null;
    // Capa exclusiva de la app de campo: las 153 colonias de San Marcos.
    let capaColoniasRef = null;

    // Estado de la petición de GPS, para que el botón informe en vez de
    // parecer que no hace nada mientras el dispositivo resuelve la posición.
    const cargandoUbicacion = ref(false);
    const ubicacionActiva = ref(false);
    const precisionUbicacion = ref(null);
    const errorUbicacion = ref('');

    /* El GPS lo lleva `services/ubicacion.js`, que ya empezó a buscar al abrir
       la aplicación. Antes esta vista lo pedía por su cuenta DESPUÉS de crear
       el mapa, así que la espera del primer arreglo —hasta 15 s bajo techo— se
       sumaba a la carga en vez de solaparse con ella.

       `siguiendo` viene del servicio y ya no es un ref local: el seguimiento
       es del dispositivo, no de esta pantalla, y tenerlo duplicado permitía
       que la vista creyera estar siguiendo cuando el watch ya se había caído. */
    const {
      posicion: posicionActual,
      errorUbicacion: errorGps,
      siguiendo,
      obtenerPosicion, iniciarSeguimiento, detenerSeguimiento,
    } = useUbicacion();

    const { tiposDenuncia } = useCatalogos();

    // Mapa plano de id -> color_hex
    const colorMap = {};
    (tiposDenuncia.value || []).forEach(c => {
      colorMap[c.id] = c.color_hex;
    });

    function initMap() {
      if (mapa.value) return;
      
      const mapEl = document.getElementById('map-vivo-mobile');
      if (!mapEl) return;
      
      mapa.value = L.map(mapEl, {
        zoomControl: true,
        zoomAnimation: false,
        markerZoomAnimation: false
      });
      // Vuelve a la zona donde estaba trabajando la cuadrilla. Solo si no hay
      // nada recordado se encuadra el municipio.
      if (!restaurarVistaMapa(CLAVE_VISTA_MAPA, mapa.value)) {
        mapa.value.setView([13.61229, -89.17036], 13);
      }
      _dejarDeVigilarVista = vigilarVistaMapa(CLAVE_VISTA_MAPA, mapa.value);

      // Tile base
      capaBase.value = construirTile(estiloTile.value).addTo(mapa.value);

      /* Las colonias aparecen y desaparecen al cruzar el umbral de zoom.
         Se compara contra el estado anterior para no rehacer la capa en cada
         gesto: solo cuando el umbral se cruza de verdad. */
      let coloniasVisiblesAntes = mapa.value.getZoom() >= ZOOM_MINIMO_COLONIAS;
      mapa.value.on('zoomend', () => {
        const ahora = mapa.value.getZoom() >= ZOOM_MINIMO_COLONIAS;
        if (ahora === coloniasVisiblesAntes) return;
        coloniasVisiblesAntes = ahora;
        cargarLimitesMunicipio();
      });
      
      // Dibujar distritos/limites
      dibujarLimites();
      
      // Pintar incidentes
      pintarIncidentes();
      
      // Forzar re-cálculo del tamaño para el padding del tab bar
      setTimeout(() => mapa.value && mapa.value.invalidateSize(), 150);

      // NO se pide la ubicación al abrir la vista. Pedir el GPS sin que nadie
      // lo haya solicitado dispara el permiso del navegador nada más entrar
      // —y en móvil, si se deniega una vez, el navegador lo recuerda y deja de
      // preguntar—, consume batería y mueve el mapa por su cuenta. Se pide solo
      // cuando el empleado pulsa "Mi ubicación".
      //
      // El mapa arranca encuadrado en el municipio, que es una referencia útil
      // de por sí.
    }
    
    // El color lo decide el servicio compartido según si la capa base es
    // oscura. Antes se comparaba contra la cadena 'satellite', que dejó de ser
    // el identificador al unificar el catálogo.
    const estiloDistritos = () => CAPAS.distritos.estilo(estiloTile.value);
    const estiloColonias  = () => CAPAS.colonias.estilo(estiloTile.value);

    function dibujarLimites() {
      cargarLimitesMunicipio();
    }

    // Cartografía oficial (`limites-sssur.geojson`), la misma que usan el Mapa
    // en Vivo del Centro de Monitoreo y el Cartograma. Antes se leían los dos
    // globales de limites-municipio.js / limites-poligonos.js, con el trazado
    // anterior: campo y central dibujaban fronteras distintas del municipio.
    //
    // Ya no hacen falta dos capas. Los 5 distritos SON el municipio: su unión
    // es la frontera exterior, así que una sola capa da ambas cosas.
    /* Zoom por debajo del cual las colonias no se dibujan.
       Es el mismo umbral que aplica el servicio compartido, y aquí faltaba: la
       PWA las pintaba SIEMPRE, incluido el encuadre inicial del municipio
       entero, donde 153 polígonos son una mancha ilegible que además cuesta
       dibujar. Son 14 952 vértices. */
    const ZOOM_MINIMO_COLONIAS = 13;

    /* Un solo lienzo compartido en vez de un nodo del DOM por polígono.
       Entre colonias y distritos hay ~26 000 vértices; como SVG son otros
       tantos elementos que el navegador tiene que crear, medir y repintar en
       cada desplazamiento del mapa. En un teléfono se nota y era la causa de
       que el mapa fuera lento. El servicio compartido ya lo hacía así. */
    const lienzo = L.canvas({ padding: 0.3 });

    async function cargarLimitesMunicipio() {
      if (!mapa.value) return;

      try {
        const distritos = await cargarLimitesSSSur();
        // El usuario pudo salir de la vista mientras descargaba.
        if (!mapa.value) return;

        if (capaDistritosRef) { mapa.value.removeLayer(capaDistritosRef); capaDistritosRef = null; }

        if (distritos && distritos.features && capasPreferidas.value.distritos) {
          capaDistritosRef = L.geoJSON(distritos, {
            renderer: lienzo,
            style: estiloDistritos(),
            onEachFeature: (feature, layer) => {
              const nombre = feature.properties?.nombre;
              if (nombre) layer.bindPopup(`<b style="font-family:'Inter',sans-serif;font-size:12px;">${nombre}</b>`);
            }
          }).addTo(mapa.value);
        }

        // Colonias de San Marcos: solo en la app de campo. Es el detalle que
        // necesita quien está en la calle para nombrar dónde está; en la
        // consola de dirección serían 153 polígonos de ruido sobre los pines.
        // Ni se descargan ni se dibujan si no toca: la descarga son 709 KB.
        const tocaColonias = capasPreferidas.value.colonias
          && mapa.value.getZoom() >= ZOOM_MINIMO_COLONIAS;
        const colonias = tocaColonias ? await cargarColoniasSanMarcos() : null;
        if (!mapa.value) return;

        if (capaColoniasRef) { mapa.value.removeLayer(capaColoniasRef); capaColoniasRef = null; }

        if (colonias && colonias.features) {
          const base = estiloColonias();
          capaColoniasRef = L.geoJSON(colonias, {
            renderer: lienzo,
            style: base,
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              const viviendas = p.viviendas
                ? `<div style="font-size:11px;opacity:.7;">${p.viviendas} viviendas</div>`
                : '';
              layer.bindPopup(
                `<b style="font-family:'Inter',sans-serif;font-size:12px;">${p.nombre}</b>${viviendas}`
              );
              // Realce al tocar: con 153 polígonos pequeños, sin esto no se
              // distingue cuál se ha seleccionado en una pantalla de móvil.
              // El realce parte del estilo vigente en vez de números fijos: si
              // la capa base cambia, el resaltado sigue siendo del mismo color.
              layer.on('click', () => layer.setStyle({
                fillOpacity: base.fillOpacity + 0.16, weight: base.weight + 1,
              }));
              layer.on('popupclose', () => layer.setStyle(base));
            }
          }).addTo(mapa.value);
        }
      } catch (error) {
        console.error('Error al cargar límites:', error);
      }
    }
    
    function pintarIncidentes() {
      if (!mapa.value) return;
      if (marcadoresLayer) {
        mapa.value.removeLayer(marcadoresLayer);
      }
      
      marcadoresLayer = L.layerGroup().addTo(mapa.value);
      
      (denuncias.value || []).forEach(d => {
        if (d.lat && d.lng && d.estado !== 'resuelto') {
          const color = colorMap[d.tipo_id] || '#ffcc00';
          const mk = L.marker([d.lat, d.lng], {
            icon: marcadorDenuncia(color, false)
          });
          mk.bindPopup(`<b>${d.descripcion || 'Incidente'}</b><br>${d.direccion}`);
          marcadoresLayer.addLayer(mk);
        }
      });
    }

    /**
     * Dibuja la posición y su círculo de precisión.
     * @param {boolean} recentrar mover el mapa al punto. En modo seguir se hace
     *        con `panTo` para no cambiar el zoom que el usuario haya elegido.
     */
    function pintarPosicion(lat, lng, precision, recentrar) {
      if (!mapa.value) return;

      if (marcadorGPS) mapa.value.removeLayer(marcadorGPS);
      if (radioGPS) mapa.value.removeLayer(radioGPS);

      radioGPS = L.circle([lat, lng], {
        radius: precision,
        color: '#10b981', fillColor: '#10b981', fillOpacity: 0.15, weight: 1,
      }).addTo(mapa.value);

      marcadorGPS = L.circleMarker([lat, lng], {
        radius: 8, color: '#fff', weight: 2, fillColor: '#10b981', fillOpacity: 1,
      }).addTo(mapa.value);

      if (recentrar) {
        if (siguiendo.value) mapa.value.panTo([lat, lng], { animate: true, duration: 0.5 });
        else mapa.value.setView([lat, lng], 16);
      }

      precisionUbicacion.value = Math.round(precision);
      ubicacionActiva.value = true;
      errorUbicacion.value = '';
    }

    /**
     * Alterna el seguimiento continuo. Tres estados con el mismo botón:
     * sin ubicación → ubicación puntual → seguimiento → apagado.
     */
    function alternarSeguimiento() {
      if (siguiendo.value) { detenerSeguimiento(); return; }
      if (!mapa.value) return;

      // Si ya hay una posición reciente del precalentamiento, se pinta de
      // inmediato en vez de esperar al primer aviso de `watchPosition`, que
      // puede tardar varios segundos.
      const previa = posicionActual.value;
      if (previa) pintarPosicion(previa.lat, previa.lng, previa.precision, true);

      iniciarSeguimiento((p) => {
        if (!mapa.value) return;
        pintarPosicion(p.lat, p.lng, p.precision, true);
        cargandoUbicacion.value = false;
      });

      // Si la persona arrastra el mapa a mano, quiere mirar otra cosa: seguir
      // recentrando encima sería pelearse con ella.
      mapa.value.once('dragstart', detenerSeguimiento);
    }

    /**
     * Centra el mapa en la posición del empleado.
     *
     * Pasa por `services/ubicacion.js`, que ya empezó a buscar al abrir la
     * aplicación: si el arreglo llegó mientras se dibujaba el mapa, esto
     * responde al instante en vez de encender el GPS otra vez.
     *
     * El error, si lo hay, NO devuelve el mapa a las coordenadas por defecto:
     * quien estaba mirando una zona la perdía por un fallo de GPS que no había
     * provocado. El mapa se queda donde está y solo se avisa.
     */
    async function obtenerUbicacion() {
      if (!mapa.value) return;

      cargandoUbicacion.value = true;
      errorUbicacion.value = '';

      const p = await obtenerPosicion({ maxEdadMs: 30000 });

      cargandoUbicacion.value = false;
      // El mapa puede haberse destruido mientras se esperaba —el empleado
      // cambió de pantalla—, y pintar sobre él reventaría.
      if (!mapa.value) return;

      if (!p) { errorUbicacion.value = errorGps.value || 'No se pudo obtener la ubicación.'; return; }
      pintarPosicion(p.lat, p.lng, p.precision, true);
    }

    function limpiarErrorUbicacion() { errorUbicacion.value = ''; }

    // Una sola línea donde antes había cuatro ramas duplicadas del catálogo.
    const construirTile = (estilo) => crearTesela(estilo);

    /** Repinta la capa base. No decide cuál: solo refleja `estiloTile`. */
    const aplicarTile = () => {
      if (!mapa.value) return;
      if (capaBase.value) mapa.value.removeLayer(capaBase.value);
      capaBase.value = construirTile(estiloTile.value).addTo(mapa.value);
      // Los límites cambian de color según si la base es oscura.
      cargarLimitesMunicipio();
    };

    /* Elegir capa desde el botón del mapa GUARDA LA PREFERENCIA.
       Es la otra mitad de tener una sola fuente de verdad: si el cambio hecho
       aquí no se guardara, la pantalla de Ajustes seguiría mostrando otra cosa
       y las dos se contradirían. Cambiarla en cualquiera de los dos sitios
       cambia la de los dos. */
    const cambiarTile = (estilo) => {
      if (estiloTile.value === estilo) return;
      fijarTesela(estilo);
    };

    // El repintado lo dispara la preferencia, venga del mapa o de Ajustes.
    watch(teselaPreferida, (valor) => {
      const nuevo = normalizarTesela(valor);
      if (nuevo === estiloTile.value) return;
      estiloTile.value = nuevo;
      aplicarTile();
    });

    // Apagar o encender una capa territorial desde Ajustes también se ve aquí.
    watch(capasPreferidas, () => { cargarLimitesMunicipio(); }, { deep: true });

    onMounted(() => {
      nextTick(() => {
        initMap();
        setTimeout(() => {
          if (mapa.value) mapa.value.invalidateSize();
        }, 200);
      });
    });

    onUnmounted(() => {
      // Sin esto, el vigilante sigue escuchando `moveend` sobre un mapa ya
      // destruido y escribiendo en localStorage desde una vista que no existe.
      if (_dejarDeVigilarVista) { _dejarDeVigilarVista(); _dejarDeVigilarVista = null; }
      // El watch de GPS sobrevive al componente si no se cancela: seguiría
      // consumiendo batería con la vista cerrada.
      detenerSeguimiento();
      if (mapa.value) {
        if (capaLimitesRef) { mapa.value.removeLayer(capaLimitesRef); capaLimitesRef = null; }
        if (capaDistritosRef) { mapa.value.removeLayer(capaDistritosRef); capaDistritosRef = null; }
        if (capaColoniasRef) { mapa.value.removeLayer(capaColoniasRef); capaColoniasRef = null; }
        if (marcadorGPS) { mapa.value.removeLayer(marcadorGPS); marcadorGPS = null; }
        if (radioGPS) { mapa.value.removeLayer(radioGPS); radioGPS = null; }
        if (marcadoresLayer) { mapa.value.removeLayer(marcadoresLayer); marcadoresLayer = null; }
        mapa.value.remove();
        mapa.value = null;
      }
    });

    return {
      irA,
      obtenerUbicacion, cargandoUbicacion, ubicacionActiva, precisionUbicacion,
      errorUbicacion, limpiarErrorUbicacion, siguiendo, alternarSeguimiento,
      mostrarMenuCapas,
      estiloTile,
      cambiarTile
    };
  }
};
