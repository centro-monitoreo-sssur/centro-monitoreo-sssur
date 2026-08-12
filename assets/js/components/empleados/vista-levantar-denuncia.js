// ============================================================================
// VISTA: levantar denuncia desde territorio (PWA de empleado)
//
// El alta ya NO se arma aquí. Se delega en `services/casos-campo.js`, que llama
// al RPC `crear_caso_campo` (migration_v18). El motivo es que esta vista no
// puede saber a qué distrito ni a qué departamento pertenece un punto, y la
// versión anterior lo resolvía inventándose columnas: enviaba `coordenadas`,
// `es_anonima` y `origen` —ninguna existe— y omitía cinco columnas obligatorias.
// Ningún reporte de campo llegó nunca a la base.
// ============================================================================
import { ref, computed, watch, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { cargarLimitesSSSur, cargarColoniasSanMarcos } from '../../services/geo-json/cargador.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { comprimirImagenDual } from '../../utils/image-compressor.js';
import { subirEvidencias, evidenciasConfiguradas } from '../../services/evidencias.js';
// Mismo catálogo y mismos estilos que el resto de mapas. Esta vista tenía su
// propia copia: sus colonias salían violeta y sus teselas no entendían la
// preferencia guardada en Ajustes.
import { crearTesela, normalizarTesela } from '../../services/mapa/teselas.js';
import { CAPAS } from '../../services/mapa/capas-territoriales.js';
import { usePreferenciasCampo } from '../../stores/preferencias-campo.js';
import { almacen } from '../../core/almacen.js';
import { useOfflineQueue } from '../../stores/offline-queue.js';
import { useConexion } from '../../services/conexion.js';
import {
  registrarCasoEnCampo, nuevaReferenciaCliente, buscarCiudadano,
} from '../../services/casos-campo.js';
import { agruparCategorias, normalizarTexto } from '../../utils/grupos-categorias.js';

// Categoría preseleccionada desde el menú principal de la PWA.
const CLAVE_CATEGORIA = 'tipo_denuncia_seleccionado';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { agregarOperacion, TIPOS_OPERACION } = useOfflineQueue();
    const { estaOnline } = useConexion();
    const { tiposDenuncia, areaDeTipo } = useCatalogos();

    const formulario = ref({
      categoriaId: almacen.leerTexto(CLAVE_CATEGORIA),
      descripcion: '',
      // `casos.direccion_referencia` es NOT NULL con un mínimo de 5 caracteres.
      // El formulario no la pedía, así que ni siquiera un insert bien formado
      // habría pasado. Y es el dato que usa la cuadrilla para llegar al punto:
      // una coordenada no dice "frente al portón del mercado".
      direccionReferencia: '',
      anonima: false,
      fotos: [],
      fotoProcesando: false
    });

    // Estado del wizard (pasos)
    const pasoActual = ref(1);
    const totalPasos = 3;

    // ── Clasificador de denuncias ──────────────────────────────
    // Las categorías se agrupan en 3 macro-grupos (Ciudad / Seguridad /
    // Trámites), NO por departamento responsable. Agrupar por departamento
    // generaba ~15 pestañas con nombres como "Unidad Operativa De Obras
    // Municipales", que desbordan la pantalla y obligan al empleado a conocer
    // el organigrama para reportar un bache. El departamento sigue siendo el
    // destino real del caso — lo resuelve la BD — y se muestra como dato de
    // confirmación una vez elegida la categoría, no como criterio de búsqueda.
    const grupoActivo = ref('');
    const busquedaCategoria = ref('');

    // Catálogo plano normalizado para la UI. Conserva `codigo` porque su
    // prefijo es lo que decide el macro-grupo.
    const categoriasPlanas = computed(() =>
      (tiposDenuncia.value || []).map((t) => ({
        id: t.id,
        codigo: t.codigo || '',
        nombre: t.nombre,
        descripcion: t.descripcion || '',
        icono: t.icono || 'fa-circle',
        color: t.color_hex || '#6b7280',
        // `t.area` ya no existe en el schema: el área se resuelve vía
        // categorias_caso.departamento_responsable_id.
        departamento: areaDeTipo(t.id) || 'Sin asignar',
      }))
    );

    const gruposCategorias = computed(() => agruparCategorias(categoriasPlanas.value));

    // Pestaña por defecto: la primera con contenido. Se recalcula si el
    // catálogo llega después (carga asíncrona) o si el grupo activo se vacía.
    watch(gruposCategorias, (grupos) => {
      if (!grupos.length) { grupoActivo.value = ''; return; }
      if (!grupos.some((g) => g.id === grupoActivo.value)) {
        grupoActivo.value = grupos[0].id;
      }
    }, { immediate: true });

    const grupoActivoInfo = computed(
      () => gruposCategorias.value.find((g) => g.id === grupoActivo.value) || null
    );

    // Búsqueda global: cuando el empleado escribe, se ignoran las pestañas y
    // se busca en TODO el catálogo. Es la salida para quien no sabe en qué
    // grupo cae su problema — el caso que hace que la gente se pierda.
    const buscando = computed(() => normalizarTexto(busquedaCategoria.value).length >= 2);

    const resultadosBusqueda = computed(() => {
      if (!buscando.value) return [];
      const q = normalizarTexto(busquedaCategoria.value);
      return categoriasPlanas.value.filter((c) =>
        normalizarTexto(c.nombre).includes(q) ||
        normalizarTexto(c.descripcion).includes(q) ||
        normalizarTexto(c.departamento).includes(q)
      );
    });

    // Lo que finalmente se pinta en la grilla.
    const categoriasVisibles = computed(() => {
      if (buscando.value) return resultadosBusqueda.value;
      const grupo = gruposCategorias.value.find((g) => g.id === grupoActivo.value);
      return grupo ? grupo.categorias : [];
    });

    const seleccionarCategoria = (categoria) => {
      formulario.value.categoriaId = categoria.id;
      // Al elegir desde la búsqueda, dejar la pestaña sincronizada para que al
      // limpiar el buscador el empleado siga viendo su selección en contexto.
      const grupo = gruposCategorias.value.find((g) =>
        g.categorias.some((c) => c.id === categoria.id)
      );
      if (grupo) grupoActivo.value = grupo.id;
    };

    const limpiarBusqueda = () => { busquedaCategoria.value = ''; };

    // Estado del mapa
    const mapa = ref(null);
    const marcador = ref(null);
    const coordenadasSeleccionadas = ref('');
    const mostrarMenuCapas = ref(false);
    // Arranca en satélite: sobre la foto aérea se ven caminos, veredas y
    // construcciones que el callejero de OSM no tiene mapeadas, que es
    // justo lo que hace falta para ubicar una incidencia en zona rural.
    const { tesela: teselaPreferida, capas: capasPreferidas, fijarTesela } = usePreferenciasCampo();
    const estiloTile = ref(normalizarTesela(teselaPreferida.value));
    const capaBase = ref(null);
    const ubicacionActiva = ref(false);
    const marcadorUbicacion = ref(null);
    const circuloPrecision = ref(null);
    const cargandoUbicacion = ref(false);
    const precisionUbicacion = ref(null);

    // Por encima de este radio, el punto ya no identifica un lugar concreto:
    // ±100 m es una manzana entera, y manda a la cuadrilla a buscar el bache
    // por la cuadra equivocada. No se bloquea el envío —a veces no hay mejor
    // señal disponible— pero se exige confirmación explícita.
    const PRECISION_DUDOSA_M = 100;

    // ¿El punto que se va a reportar viene del GPS o lo colocó la persona?
    //
    // El aviso de precisión solo tiene sentido en el primer caso. Si el
    // empleado arrastró el mapa hasta el bache que está viendo, su dedo es más
    // fiable que cualquier lectura del receptor, y bloquearle el envío por un
    // ±150 m que ya no describe ese punto es sencillamente incorrecto.
    const puntoDesdeGPS = ref(false);

    const precisionDudosa = computed(() =>
      puntoDesdeGPS.value &&
      precisionUbicacion.value !== null &&
      precisionUbicacion.value > PRECISION_DUDOSA_M
    );
    const confirmoPrecision = ref(false);

    // Estado de validación de jurisdicción
    const validacionJurisdiccion = ref({ dentro: true, mensaje: '' });
    const mostrarAdvertenciaJurisdiccion = ref(false);
    const mostrarModalFueraJurisdiccion = ref(false);

    // Estado para confirmación de cancelación
    const mostrarConfirmacionCancelar = ref(false);

    // Función para construir capa base
    const construirTile = (estilo) => crearTesela(estilo);

    /** Repinta la capa base. No decide cuál: solo refleja `estiloTile`. */
    const aplicarTile = () => {
      if (!mapa.value) return;
      if (capaBase.value) mapa.value.removeLayer(capaBase.value);
      capaBase.value = construirTile(estiloTile.value).addTo(mapa.value);
      cargarLimitesMunicipio();
    };

    // Elegir capa aquí guarda la preferencia, igual que en el Mapa en Vivo:
    // una sola fuente de verdad para los dos sitios donde se puede cambiar.
    const cambiarTile = (estilo) => {
      if (estiloTile.value === estilo) return;
      fijarTesela(estilo);
    };

    watch(teselaPreferida, (valor) => {
      const nuevo = normalizarTesela(valor);
      if (nuevo === estiloTile.value) return;
      estiloTile.value = nuevo;
      aplicarTile();
    });

    watch(capasPreferidas, () => { cargarLimitesMunicipio(); }, { deep: true });

    // Capas de límites
    let capaLimitesRef = null;
    let capaDistritosRef = null;
    // Capa exclusiva de la app de campo: las 153 colonias de San Marcos.
    let capaColoniasRef = null;
    // Cartografía ya descargada, para uso síncrono dentro de los handlers de
    // Leaflet. La rellena `cargarLimitesMunicipio()`. La validación de
    // jurisdicción DEBE comprobar contra el mismo trazado que se dibuja: antes
    // usaba los globales antiguos y el empleado veía su punto dentro de la
    // frontera pintada mientras el sistema lo daba por fuera.
    let limitesCache = null;


    const estiloDistritos = () => CAPAS.distritos.estilo(estiloTile.value);
    const estiloColonias  = () => CAPAS.colonias.estilo(estiloTile.value);

        // Cartografía oficial (`limites-sssur.geojson`), la misma que el Centro de
    // Monitoreo. Antes se leían los globales de limites-municipio.js y
    // limites-poligonos.js, con el trazado anterior: campo y central dibujaban
    // fronteras distintas. Los 5 distritos SON el municipio, así que una sola
    // capa sustituye a las dos que había.
    /* Umbral por debajo del cual las colonias no se dibujan, y un solo lienzo
       compartido en vez de un nodo del DOM por polígono.

       Entre colonias y distritos hay ~26 000 vértices. Como SVG son otros
       tantos elementos que el navegador crea, mide y repinta en cada
       desplazamiento; en un teléfono se nota. Y por debajo del zoom 13 las 153
       colonias son una mancha ilegible que no aporta nada.

       Es lo que ya hacía el servicio compartido y aquí faltaba. */
    const ZOOM_MINIMO_COLONIAS = 13;
    const lienzo = L.canvas({ padding: 0.3 });

    const cargarLimitesMunicipio = async () => {
      if (!mapa.value) return;
      try {
        const distritos = await cargarLimitesSSSur();
        limitesCache = distritos;
        // El usuario pudo salir de la vista mientras se descargaba.
        if (!mapa.value) return;

        if (capaDistritosRef) { mapa.value.removeLayer(capaDistritosRef); capaDistritosRef = null; }

        if (distritos && distritos.features && capasPreferidas.value.distritos) {
          capaDistritosRef = L.geoJSON(distritos, {
            renderer: lienzo,
            style: estiloDistritos(),
            onEachFeature: (feature, layer) => {
              const nombre = feature.properties?.nombre;
              // bindPopup y no tooltip sticky: el tooltip lanzaba error al
              // desmontar el mapa.
              if (nombre) layer.bindPopup(`<b style="font-family:'Inter',sans-serif;font-size:12px;">${nombre}</b>`);
            }
          }).addTo(mapa.value);
        }

        // Colonias de San Marcos: capa exclusiva de la app de campo. Es el
        // detalle que necesita quien está en la calle para nombrar dónde está.
        // Ni se descargan ni se dibujan si no toca: la descarga son 709 KB.
        const tocaColonias = capasPreferidas.value.colonias
          && mapa.value.getZoom() >= ZOOM_MINIMO_COLONIAS;
        const colonias = tocaColonias ? await cargarColoniasSanMarcos() : null;
        if (!mapa.value) return;

        if (capaColoniasRef) { mapa.value.removeLayer(capaColoniasRef); capaColoniasRef = null; }

        if (colonias && colonias.features) {
          capaColoniasRef = L.geoJSON(colonias, {
            renderer: lienzo,
            style: estiloColonias(),
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              const viviendas = p.viviendas ? `<div style="font-size:11px;opacity:.7;">${p.viviendas} viviendas</div>` : '';
              layer.bindPopup(`<b style="font-family:'Inter',sans-serif;font-size:12px;">${p.nombre}</b>${viviendas}`);
            }
          }).addTo(mapa.value);
        }
      } catch (error) {
        console.error('Error al cargar límites:', error);
      }
    };

    /**
     * Garantiza que el paso 2 tenga un mapa VIVO.
     *
     * El bloque del paso 2 se pinta con `v-if`, así que al avanzar al paso 3 su
     * nodo del DOM se destruye. Al volver, `mapa.value` seguía apuntando a un
     * contenedor que ya no está en el documento: `invalidateSize()` recalculaba
     * sobre un elemento huérfano y el mapa se veía en blanco.
     *
     * Se detecta comparando contra el documento y, si el contenedor murió, se
     * destruye el mapa y se rehace sobre el nodo nuevo.
     */
    const asegurarMapaPaso2 = () => {
      const contenedorVivo = mapa.value && document.body.contains(mapa.value.getContainer());

      if (mapa.value && !contenedorVivo) {
        mapa.value.remove();          // libera listeners del mapa anterior
        mapa.value = null;
        marcador.value = null;
        marcadorUbicacion.value = null;
        circuloPrecision.value = null;
        capaLimitesRef = null;
        capaDistritosRef = null;
        capaColoniasRef = null;
      }

      if (!mapa.value) inicializarMapa();
      else mapa.value.invalidateSize({ pan: false });
    };

    const inicializarMapa = () => {
      if (mapa.value) {
        if (coordenadasSeleccionadas.value) {
          const coords = coordenadasSeleccionadas.value.split(',').map(c => parseFloat(c.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            mapa.value.setView([coords[0], coords[1]], 16);
          }
        }
        return;
      }

      const centro = [13.61229, -89.17036];
      mapa.value = L.map('map-levantar-denuncia', {
        zoomControl: true,
        zoomAnimation: false,
        markerZoomAnimation: false
      }).setView(centro, 13);

      capaBase.value = construirTile(estiloTile.value).addTo(mapa.value);
      cargarLimitesMunicipio();

      /* Las colonias aparecen y desaparecen al cruzar el umbral de zoom.
         Se compara contra el estado anterior para no rehacer la capa en cada
         gesto: solo cuando el umbral se cruza de verdad. Aquí importa más que
         en el Mapa en Vivo, porque el empleado hace zoom para afinar el punto
         y cruzaría el umbral varias veces seguidas. */
      let coloniasVisiblesAntes = mapa.value.getZoom() >= ZOOM_MINIMO_COLONIAS;
      mapa.value.on('zoomend', () => {
        const ahora = mapa.value.getZoom() >= ZOOM_MINIMO_COLONIAS;
        if (ahora === coloniasVisiblesAntes) return;
        coloniasVisiblesAntes = ahora;
        cargarLimitesMunicipio();
      });

      if (coordenadasSeleccionadas.value) {
        const coords = coordenadasSeleccionadas.value.split(',').map(c => parseFloat(c.trim()));
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          mapa.value.setView([coords[0], coords[1]], 16);
        }
      }

      mapa.value.on('move', () => {
        const center = mapa.value.getCenter();
        const lat = center.lat;
        const lng = center.lng;

        // Validar jurisdicción
        // Se usa la copia ya resuelta, no `await`: este handler se dispara en
        // CADA píxel de arrastre del mapa. Un `await` aquí encadenaría cientos
        // de microtareas y las respuestas podrían llegar desordenadas, dejando
        // el aviso de jurisdicción de una posición anterior.
        const limitesMunicipio = limitesCache;
        const limitesPoligonos = limitesCache;

        let validacion = { dentro: true, mensaje: '' };
        if (typeof window.validarJurisdiccion === 'function' && limitesMunicipio) {
          validacion = window.validarJurisdiccion(lat, lng, limitesMunicipio, limitesPoligonos);
        }

        validacionJurisdiccion.value = validacion;
        mostrarAdvertenciaJurisdiccion.value = !validacion.dentro;

        if (!validacion.dentro) {
          coordenadasSeleccionadas.value = '';
          return;
        }

        coordenadasSeleccionadas.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      });

      mapa.value.on('moveend', () => {
        // Modal deshabilitado para no interrumpir el flujo InDrive
      });

      // Si el usuario mueve el mapa manualmente, quitar los marcadores GPS visuales
      mapa.value.on('dragstart', () => {
        if (marcadorUbicacion.value) {
          mapa.value.removeLayer(marcadorUbicacion.value);
          marcadorUbicacion.value = null;
        }
        if (circuloPrecision.value) {
          mapa.value.removeLayer(circuloPrecision.value);
          circuloPrecision.value = null;
        }
        ubicacionActiva.value = false;
        // El punto pasa a ser una decisión de la persona, no una lectura del
        // receptor: desde aquí la precisión del GPS ya no describe este lugar y
        // no debe condicionar el envío.
        puntoDesdeGPS.value = false;
        precisionUbicacion.value = null;
        confirmoPrecision.value = false;
      });
    };

    const siguientePaso = () => {
      if (pasoActual.value === 1 && !formulario.value.categoriaId) return;
      if (pasoActual.value === 2 && !coordenadasSeleccionadas.value) return;
      if (pasoActual.value < totalPasos) {
        pasoActual.value++;
        if (pasoActual.value === 2) {
          setTimeout(() => {
            asegurarMapaPaso2();
            // Sin punto elegido todavía se ofrece el GPS: aquí el gesto de
            // avanzar al paso de ubicación ya expresa la intención.
            if (!coordenadasSeleccionadas.value && !ubicacionActiva.value) {
              obtenerUbicacion();
            }
          }, 100);
        }
      }
    };

    const anteriorPaso = () => {
      if (pasoActual.value > 1) {
        pasoActual.value--;
        if (pasoActual.value === 2) {
          setTimeout(asegurarMapaPaso2, 100);
        }
      }
    };

    const irAPaso = (paso) => {
      if (paso < pasoActual.value) {
        pasoActual.value = paso;
        if (paso === 2) {
          setTimeout(asegurarMapaPaso2, 100);
        }
      }
    };

    // Se resuelve contra el catálogo real. Antes leía `categoriasDenuncias`,
    // que nunca se importó en este archivo (ReferenceError al llegar al paso 3)
    // y además comparaba con parseInt(): los ids de categorias_caso son UUID,
    // así que la comparación jamás habría acertado.
    const categoriaSeleccionada = computed(() => {
      const id = formulario.value.categoriaId;
      if (!id) return null;
      return categoriasPlanas.value.find((cat) => String(cat.id) === String(id)) || null;
    });

    const obtenerUbicacion = () => {
      if (!mapa.value) return;
      if (!navigator.geolocation) {
        alert('Geolocalización no soportada en este navegador');
        return;
      }

      cargandoUbicacion.value = true;

      if (marcadorUbicacion.value) { mapa.value.removeLayer(marcadorUbicacion.value); marcadorUbicacion.value = null; }
      if (circuloPrecision.value) { mapa.value.removeLayer(circuloPrecision.value); circuloPrecision.value = null; }

      if (mapa.value) {
        mapa.value.dragging.disable();
        mapa.value.touchZoom.disable();
        mapa.value.scrollWheelZoom.disable();
      }

      const intentarObtenerUbicacion = (intentos = 0) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            const precisionMetros = Math.round(accuracy);

            if (precisionMetros > 50 && intentos < 3) {
              console.log(`Precisión ${precisionMetros}m > 50m, reintentando... (${intentos + 1}/3)`);
              setTimeout(() => intentarObtenerUbicacion(intentos + 1), 1000);
              return;
            }

            if (precisionMetros > 12) {
              console.warn(`Precisión ${precisionMetros}m > 12m, pero aceptable`);
            }

            precisionUbicacion.value = precisionMetros;
            // Nueva lectura ⇒ la confirmación anterior ya no aplica.
            confirmoPrecision.value = false;
            puntoDesdeGPS.value = true;

            const icono = L.divIcon({
              className: 'ubicacion-icon',
              html: '<div style="background: #10b981; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            marcadorUbicacion.value = L.marker([latitude, longitude], { icon: icono })
              .addTo(mapa.value)
              .bindPopup(`Tu ubicación<br><small>Precisión: ±${precisionMetros}m</small>`)
              .openPopup();

            circuloPrecision.value = L.circle([latitude, longitude], {
              radius: precisionMetros,
              color: '#10b981',
              fillColor: '#10b981',
              fillOpacity: 0.15,
              weight: 1,
              interactive: false
            }).addTo(mapa.value);

            mapa.value.setView([latitude, longitude], 18);
            setTimeout(() => mapa.value.invalidateSize(), 100);

            // Ya no usamos el marcador Leaflet para el punto central
            coordenadasSeleccionadas.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            ubicacionActiva.value = true;
            cargandoUbicacion.value = false;

            if (mapa.value) {
              mapa.value.dragging.enable();
              mapa.value.touchZoom.enable();
              mapa.value.scrollWheelZoom.enable();
            }
          },
          (error) => {
            console.error('Error al obtener ubicación:', error);
            alert('No se pudo obtener tu ubicación. Por favor habilita el GPS.');
            cargandoUbicacion.value = false;

            if (mapa.value) {
              mapa.value.dragging.enable();
              mapa.value.touchZoom.enable();
              mapa.value.scrollWheelZoom.enable();
            }
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      };

      intentarObtenerUbicacion();
    };

    const hayDatosIngresados = () =>
      formulario.value.categoriaId || formulario.value.descripcion ||
      formulario.value.direccionReferencia || coordenadasSeleccionadas.value;

    const cancelarDenuncia = () => {
      if (hayDatosIngresados()) {
        mostrarConfirmacionCancelar.value = true;
      } else {
        irA('pwa-empleado');
      }
    };

    const confirmarCancelacion = () => {
      almacen.borrar(CLAVE_CATEGORIA);
      irA('pwa-empleado');
      mostrarConfirmacionCancelar.value = false;
    };

    const cerrarModalFueraJurisdiccion = () => {
      mostrarModalFueraJurisdiccion.value = false;
      almacen.borrar(CLAVE_CATEGORIA);
      irA('pwa-empleado');
    };

    // Mensaje de resultado, para poder mostrarlo en la vista en vez de en un
    // `alert()`. Un cuadro modal del navegador en un teléfono, a pleno sol y con
    // guantes, es la peor forma posible de confirmar que un parte se registró.
    const guardando = ref(false);
    // Subir dos fotos por una conexión móvil en territorio tarda lo suficiente
    // como para que, sin aviso, el empleado crea que la app se colgó.
    const subiendoFotos = ref(false);
    const resultadoEnvio = ref(null);   // { tipo: 'ok'|'error'|'encolado'|'advertencia', texto }

    /* ─── Denunciante ────────────────────────────────────────────────────
       Quien reporta NO es quien registra. El empleado queda siempre como
       creador del caso —lo fija el servidor con `auth.uid()`, no se puede
       falsear— y aquí se recogen, si la persona quiere darlos, los datos del
       vecino que dio el aviso.

       Anónimo por defecto, y a propósito: pedir el nombre a quien denuncia un
       promontorio de basura frente a la casa de al lado tiene un coste que no
       siempre compensa. Que dar los datos sea el paso extra, no lo contrario. */
    const denunciante = ref({
      anonimo: true,
      nombre: '',
      telefono: '',
      ciudadanoId: null,
      // Búsqueda en el padrón
      identificador: '',      // DUI o teléfono tecleado
      buscando: false,
      resultadoBusqueda: null, // { encontrado, texto }
    });

    const ciudadanoVinculado = computed(() => Boolean(denunciante.value.ciudadanoId));

    async function buscarEnPadron() {
      const d = denunciante.value;
      d.resultadoBusqueda = null;
      d.buscando = true;
      try {
        const r = await buscarCiudadano(d.identificador);

        if (r.ciudadano) {
          // Coincidencia: se rellenan los campos y se vincula. El empleado
          // sigue pudiendo editarlos si el vecino corrige algo.
          d.ciudadanoId = r.ciudadano.ciudadano_id;
          d.nombre = `${r.ciudadano.nombres} ${r.ciudadano.apellidos}`.trim();
          // El teléfono solo se rellena si lo que se buscó ERA un teléfono; si
          // se buscó por DUI, el número no viene en la respuesta.
          const digitos = d.identificador.replace(/\D/g, '');
          if (digitos.length === 8) d.telefono = digitos;
          d.anonimo = false;
          d.resultadoBusqueda = {
            encontrado: true,
            texto: `${d.nombre}${r.ciudadano.distrito ? ' · ' + r.ciudadano.distrito : ''}`,
          };
        } else {
          // No estar registrado es lo habitual, no un fallo. Se desvincula por
          // si venía de una búsqueda anterior con acierto.
          d.ciudadanoId = null;
          d.resultadoBusqueda = { encontrado: false, texto: r.mensaje };
        }
      } finally {
        d.buscando = false;
      }
    }

    // Marcar anónimo BORRA lo capturado, no solo lo oculta. Si se quedara en
    // memoria, bastaría un descuido para acabar enviándolo — y la base lo
    // descartaría igual, pero el empleado habría creído que lo mandaba.
    function alternarAnonimo(valor) {
      const d = denunciante.value;
      d.anonimo = valor;
      if (valor) {
        d.nombre = '';
        d.telefono = '';
        d.ciudadanoId = null;
        d.identificador = '';
        d.resultadoBusqueda = null;
      }
    }

    // Condición de envío en un solo sitio. Repetida en la plantilla —que ya la
    // tenía tres veces solo para la descripción— cualquier regla nueva se
    // olvida en alguna de las copias y el botón deja de coincidir con lo que
    // de verdad valida `guardarDenuncia`.
    const puedeEnviar = computed(() =>
      !guardando.value &&
      Boolean(formulario.value.categoriaId) &&
      formulario.value.descripcion.trim().length >= 10 &&
      formulario.value.direccionReferencia.trim().length >= 5 &&
      Boolean(coordenadasSeleccionadas.value)
    );

    // Qué falta, en un solo mensaje. Se muestra en el propio botón para que el
    // empleado no tenga que deducirlo pulsando.
    const faltaParaEnviar = computed(() => {
      if (!formulario.value.categoriaId) return 'Elige el tipo de incidente';
      if (formulario.value.descripcion.trim().length < 10) return 'Escribe una descripción';
      if (formulario.value.direccionReferencia.trim().length < 5) return 'Indica la referencia del lugar';
      if (!coordenadasSeleccionadas.value) return 'Marca la ubicación';
      return '';
    });

    const guardarDenuncia = async () => {
      resultadoEnvio.value = null;

      // Precisión insuficiente: se avisa una vez y se deja continuar si la
      // persona insiste. Bloquear del todo dejaría sin reportar zonas donde el
      // GPS simplemente no da más.
      if (precisionDudosa.value && !confirmoPrecision.value) {
        confirmoPrecision.value = true;
        resultadoEnvio.value = {
          tipo: 'advertencia',
          texto: `La ubicación tiene ±${precisionUbicacion.value} m de margen: puede señalar ` +
                 'la cuadra equivocada. Muévete a un lugar despejado y actualiza el GPS, o ' +
                 'arrastra el mapa hasta el punto exacto. Si aun así quieres continuar, ' +
                 'vuelve a pulsar Guardar.',
        };
        return;
      }

      // ── Validación previa ──────────────────────────────────────────────
      // La base vuelve a validar todo esto; aquí se comprueba para no gastar
      // un viaje de red ni encolar algo que se sabe inválido.
      const descripcion = formulario.value.descripcion.trim();
      const referencia = formulario.value.direccionReferencia.trim();

      if (!formulario.value.categoriaId) {
        resultadoEnvio.value = { tipo: 'error', texto: 'Elige el tipo de incidente.' };
        return;
      }
      if (descripcion.length < 10) {
        resultadoEnvio.value = { tipo: 'error', texto: 'La descripción debe tener al menos 10 caracteres.' };
        return;
      }
      if (referencia.length < 5) {
        resultadoEnvio.value = {
          tipo: 'error',
          texto: 'Escribe una referencia del lugar (mínimo 5 caracteres). Es lo que usa la cuadrilla para encontrarlo.',
        };
        return;
      }
      if (!coordenadasSeleccionadas.value) {
        resultadoEnvio.value = { tipo: 'error', texto: 'Marca la ubicación en el mapa.' };
        return;
      }

      const [lat, lng] = coordenadasSeleccionadas.value.split(',').map((c) => parseFloat(c.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        resultadoEnvio.value = { tipo: 'error', texto: 'La ubicación no es válida. Vuelve a marcarla.' };
        return;
      }

      const categoria = (tiposDenuncia.value || []).find(
        (cat) => String(cat.id) === String(formulario.value.categoriaId)
      );

      // La referencia se genera UNA vez y se conserva aunque el envío acabe en
      // el buzón. Es lo que permite que un reintento no duplique el caso si la
      // red se cortó después de que la base ya lo hubiera insertado.
      const referenciaCliente = nuevaReferenciaCliente();

      const datosReporte = {
        categoriaId: formulario.value.categoriaId,
        descripcion,
        direccionReferencia: referencia,
        lat,
        lng,
        titulo: categoria ? categoria.nombre : null,
        canal: 'pwa_empleado',
        referenciaCliente,
        // Las fotografías se suben a cPanel ANTES de crear el caso y viajan
        // como URL: la RPC recibe enlaces, no archivos. Se rellena más abajo.
        adjuntos: [],
        denunciante: {
          anonimo: denunciante.value.anonimo,
          nombre: denunciante.value.nombre.trim(),
          telefono: denunciante.value.telefono.trim(),
          ciudadanoId: denunciante.value.ciudadanoId,
        },
      };

      guardando.value = true;

      try {
        if (estaOnline.value) {
          /* ── Evidencia fotográfica ───────────────────────────────────────
             Se sube ANTES de crear el caso porque la RPC recibe URLs ya
             subidas, no archivos.

             Un fallo aquí NO cancela el reporte. El empleado está en el sitio,
             muchas veces con mala cobertura, y perder la denuncia por una foto
             que no subió sería el peor de los dos resultados. Se registra el
             caso con las que hayan subido y se le dice exactamente cuántas
             fueron: lo que no se puede es dejarle creer que subieron todas. */
          let avisoFotos = '';
          if (formulario.value.fotos.length) {
            if (!evidenciasConfiguradas) {
              avisoFotos = ' Las fotografías NO se enviaron: falta configurar el ' +
                           'servidor de imágenes.';
            } else {
              subiendoFotos.value = true;
              const envio = await subirEvidencias(
                formulario.value.fotos.map((f) => f.archivo)
              );
              subiendoFotos.value = false;
              datosReporte.adjuntos = envio.adjuntos;
              if (!envio.completo) {
                avisoFotos = ` Se enviaron ${envio.adjuntos.length} de ` +
                             `${formulario.value.fotos.length} fotografías.`;
              }
            }
          }

          const resultado = await registrarCasoEnCampo(datosReporte);

          if (resultado.ok) {
            almacen.borrar(CLAVE_CATEGORIA);
            resultadoEnvio.value = {
              tipo: avisoFotos ? 'advertencia' : 'ok',
              texto: resultado.mensaje + avisoFotos,
            };
            // Con aviso se deja más tiempo en pantalla: un mensaje que hay que
            // leer y desaparece en segundo y medio es un mensaje que no existe.
            setTimeout(() => irA('pwa-empleado'), avisoFotos ? 4000 : 1500);
            return;
          }

          // El servidor lo RECHAZÓ: encolar solo repetiría el mismo error hasta
          // agotar los reintentos, y el empleado se iría convencido de que su
          // reporte está en camino. Se le dice ahora, que es cuando puede
          // corregirlo y todavía está en el sitio.
          if (!resultado.esDeRed) {
            resultadoEnvio.value = { tipo: 'error', texto: resultado.mensaje };
            return;
          }
        }

        // Sin conexión, o el envío no llegó a salir del teléfono.
        //
        // ⚠ Las fotografías NO viajan al buzón. El buzón vive en localStorage,
        // que solo guarda texto: meterlas exigiría convertirlas a base64, y dos
        // fotos ocuparían ~1,4 MB de los ~5 MB del almacén. Bastarían tres o
        // cuatro reportes encolados para llenarlo y hacer que el siguiente se
        // perdiera. Entre perder las fotos y perder el reporte entero, se
        // pierden las fotos — y se dice, que es la parte que importa.
        const encolado = agregarOperacion({
          tipo: TIPOS_OPERACION.LEVANTAR_DENUNCIA,
          datos: datosReporte,
          prioridad: 'alta',
        });

        if (!encolado.ok) {
          // No cabe en el dispositivo. Decirlo es obligatorio: lo contrario es
          // responder "guardado" sobre algo que se acaba de perder.
          resultadoEnvio.value = { tipo: 'error', texto: encolado.mensaje };
          return;
        }

        almacen.borrar(CLAVE_CATEGORIA);
        const perdioFotos = formulario.value.fotos.length > 0;
        resultadoEnvio.value = {
          tipo: perdioFotos ? 'advertencia' : 'encolado',
          texto: 'Sin señal. El reporte quedó en el buzón y se enviará solo al recuperar cobertura.'
            + (perdioFotos
                ? ' Las fotografías NO se guardaron: vuelve a tomarlas cuando haya cobertura.'
                : ''),
        };
        setTimeout(() => irA('pwa-empleado'), perdioFotos ? 4500 : 2200);
      } finally {
        guardando.value = false;
        subiendoFotos.value = false;
      }
    };

    const procesarFotografia = async (event) => {
      const files = Array.from(event.target.files);
      if (!files.length) return;

      const fotosRestantes = 2 - formulario.value.fotos.length;
      if (fotosRestantes <= 0) {
        alert('Solo puedes adjuntar un máximo de 2 fotografías.');
        return;
      }

      const fotosAProcesar = files.slice(0, fotosRestantes);
      const validFiles = fotosAProcesar.filter(file => file.type.match(/image.*/));
      
      if (validFiles.length < fotosAProcesar.length) {
        alert('Algunos archivos fueron omitidos por no ser imágenes válidas.');
      }
      if (!validFiles.length) return;

      formulario.value.fotoProcesando = true;

      try {
        for (const file of validFiles) {
          // Se guardan las DOS formas de la imagen: el DataURL para la vista
          // previa y el Blob para subirlo. Comprimir dos veces sería dibujar el
          // canvas dos veces en un teléfono de gama media.
          //
          // 1024×1024 y calidad 0.6 son los valores que fija
          // docs/arquitectura/CONTEXTO_CRITICO.md §3 para no agotar la cuota;
          // antes se usaba 1080/0.75, que producía archivos por encima del
          // límite de 500 KB acordado.
          const foto = await comprimirImagenDual(file, 1024, 1024, 0.6);
          formulario.value.fotos.push(foto);
        }
      } catch (error) {
        console.error('Error al procesar la imagen:', error);
        alert('Ocurrió un error al optimizar la imagen.');
      } finally {
        formulario.value.fotoProcesando = false;
        event.target.value = ''; // Reset input
      }
    };

    const removerFotografia = (index) => {
      formulario.value.fotos.splice(index, 1);
    };

    onMounted(() => {
      // Las categorías ya no se copian a un ref local: `gruposCategorias` es
      // un computed sobre el store, así que se agrupa solo cuando el catálogo
      // llega (app-root lo carga tras autenticar) y se reagrupa si cambia.
      if (formulario.value.categoriaId) {
        pasoActual.value = 2;
        setTimeout(() => {
          inicializarMapa();
          if (!coordenadasSeleccionadas.value && !ubicacionActiva.value) obtenerUbicacion();
        }, 100);
      }
    });

    onUnmounted(() => {
      if (mapa.value) {
        if (capaLimitesRef) { mapa.value.removeLayer(capaLimitesRef); capaLimitesRef = null; }
        if (capaDistritosRef) { mapa.value.removeLayer(capaDistritosRef); capaDistritosRef = null; }
        if (circuloPrecision.value) { mapa.value.removeLayer(circuloPrecision.value); circuloPrecision.value = null; }
        if (marcadorUbicacion.value) { mapa.value.removeLayer(marcadorUbicacion.value); marcadorUbicacion.value = null; }
        if (marcador.value) { mapa.value.removeLayer(marcador.value); marcador.value = null; }
        mapa.value.remove();
        mapa.value = null;
      }
    });

    return {
      formulario,
      // Clasificador
      gruposCategorias,
      grupoActivo,
      grupoActivoInfo,
      busquedaCategoria,
      buscando,
      categoriasVisibles,
      seleccionarCategoria,
      limpiarBusqueda,
      coordenadasSeleccionadas,
      mostrarMenuCapas,
      estiloTile,
      pasoActual,
      totalPasos,
      categoriaSeleccionada,
      cambiarTile,
      obtenerUbicacion,
      ubicacionActiva,
      cargandoUbicacion,
      precisionUbicacion, precisionDudosa, puntoDesdeGPS,
      siguientePaso,
      anteriorPaso,
      irAPaso,
      irA,
      guardarDenuncia,
      cancelarDenuncia,
      confirmarCancelacion,
      mostrarConfirmacionCancelar,
      mostrarModalFueraJurisdiccion,
      cerrarModalFueraJurisdiccion,
      validacionJurisdiccion,
      mostrarAdvertenciaJurisdiccion,
      estaOnline,
      procesarFotografia,
      removerFotografia,
      guardando,
      subiendoFotos,
      resultadoEnvio,
      puedeEnviar,
      faltaParaEnviar,
      denunciante,
      ciudadanoVinculado,
      buscarEnPadron,
      alternarAnonimo
    };
  }
};
