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
import { comprimirImagen } from '../../utils/image-compressor.js';
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
    const estiloTile = ref('satellite');
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
    const construirTile = (estilo) => {
      if (estilo === 'cartomap') {
        return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd', maxZoom: 21, attribution: '&copy; CARTO'
        });
      }
      if (estilo === 'google') {
        return L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          subdomains: '0123', maxZoom: 20, attribution: '&copy; Google',
        });
      }
      if (estilo === 'satellite') {
        return L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          subdomains: '0123', maxZoom: 20, attribution: '&copy; Google',
        });
      }
      return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      });
    };

    const cambiarTile = (estilo) => {
      if (!mapa.value || estiloTile.value === estilo) return;
      estiloTile.value = estilo;
      if (capaBase.value) mapa.value.removeLayer(capaBase.value);
      capaBase.value = construirTile(estilo).addTo(mapa.value);
      cargarLimitesMunicipio();
    };

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


    const obtenerColorLimites = () => estiloTile.value === 'satellite' ? '#ffffff' : '#1d4ed8';

        // Cartografía oficial (`limites-sssur.geojson`), la misma que el Centro de
    // Monitoreo. Antes se leían los globales de limites-municipio.js y
    // limites-poligonos.js, con el trazado anterior: campo y central dibujaban
    // fronteras distintas. Los 5 distritos SON el municipio, así que una sola
    // capa sustituye a las dos que había.
    const cargarLimitesMunicipio = async () => {
      if (!mapa.value) return;
      const color = obtenerColorLimites();
      try {
        const distritos = await cargarLimitesSSSur();
        limitesCache = distritos;
        // El usuario pudo salir de la vista mientras se descargaba.
        if (!mapa.value) return;

        if (distritos && distritos.features) {
          if (capaDistritosRef) mapa.value.removeLayer(capaDistritosRef);
          capaDistritosRef = L.geoJSON(distritos, {
            style: {
              color,
              weight: 2.5,
              opacity: 0.9,
              fillOpacity: 0
            },
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
        const colonias = await cargarColoniasSanMarcos();
        if (!mapa.value) return;

        if (colonias && colonias.features) {
          if (capaColoniasRef) mapa.value.removeLayer(capaColoniasRef);
          capaColoniasRef = L.geoJSON(colonias, {
            style: { color: '#7c3aed', weight: 1, opacity: 0.65, fillColor: '#7c3aed', fillOpacity: 0.06 },
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
    const resultadoEnvio = ref(null);   // { tipo: 'ok'|'error'|'encolado', texto }

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
        // Las fotografías se suben a cPanel y viajan como URL. Mientras el
        // endpoint de evidencias no esté conectado, se envía lista vacía: es
        // preferible un caso sin fotos a un caso que no se registra.
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
          const resultado = await registrarCasoEnCampo(datosReporte);

          if (resultado.ok) {
            almacen.borrar(CLAVE_CATEGORIA);
            resultadoEnvio.value = { tipo: 'ok', texto: resultado.mensaje };
            setTimeout(() => irA('pwa-empleado'), 1500);
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
        resultadoEnvio.value = {
          tipo: 'encolado',
          texto: 'Sin señal. El reporte quedó en el buzón y se enviará solo al recuperar cobertura.',
        };
        setTimeout(() => irA('pwa-empleado'), 2200);
      } finally {
        guardando.value = false;
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
          // Comprimir a max 1080px y jpeg quality 0.75 (aprox max 5MB, usualmente < 1MB)
          const dataUrl = await comprimirImagen(file, 1080, 1080, 0.75);
          formulario.value.fotos.push(dataUrl);
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
