// Vista: Crear Denuncia (Población)
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { cargarLimitesSSSur } from '../../services/geo-json/cargador.js';
// El catálogo sale de la base y ya no de `utils/categorias-denuncias.js`, que
// tenía 27 categorías escritas a mano con ids sin ninguna relación con
// `categorias_caso`. Daba igual mientras nada se guardaba; desde la v34 el id
// que se envíe tiene que ser el de verdad.
import { useCatalogoPublico } from '../../services/catalogo-publico.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useConfiguracion } from '../../stores/configuracion.js';
import { useCiudadano } from '../../stores/ciudadano.js';
import { useUbicacion } from '../../services/ubicacion.js';
import { useDenunciasCiudadano } from '../../stores/denuncias-ciudadano.js';
// Mismo endpoint de cPanel que usan las evidencias de campo: comprime allí y
// en la base solo queda la URL, así que no toca el disco de Supabase.
import { subirEvidencias, evidenciasConfiguradas } from '../../services/evidencias.js';
import { comprimirImagen } from '../../utils/image-compressor.js';
import { validarDenunciaDuplicada, generarResumenSimilares } from '../../utils/validacion-duplicados.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    // Los topes de fotografías son configurables desde el panel.
    const { config } = useConfiguracion();

    const formulario = ref({
      categoriaId: localStorage.getItem('tipo_denuncia_seleccionado') || '',
      descripcion: '',
      anonima: false,
      fotos: [],
      fotoProcesando: false
    });

    // Estado del wizard (pasos)
    const pasoActual = ref(1);
    const totalPasos = 3;

    /* Categorías reales, en los tres macro-grupos de siempre: Ciudad,
       Seguridad y Trámites. Los mismos que usa la PWA de campo, con el mismo
       `utils/grupos-categorias.js`.

       Se probó agrupar por departamento responsable y estaba mal: un vecino no
       sabe si un bache lo atiende Obras Municipales o el Distrital, y salían
       tantas pestañas como unidades con categorías abiertas, con nombres de
       cuatro palabras. El departamento se muestra al confirmar la categoría
       elegida, no como forma de encontrarla. */
    const {
      grupos: gruposCatalogo,
      cargando: cargandoCatalogo, errorCatalogo, sinCategoriasAbiertas,
      cargarCategoriasPublicas, categoriaPorId,
    } = useCatalogoPublico();

    // Para centrar el mapa en el distrito de quien reporta.
    const { distritos: distritosCatalogo, cargarDistritos } = useCatalogos();
    const { perfil: perfilCiudadano, cargarPerfil } = useCiudadano();
    // Posición ya buscada al abrir la aplicación; sirve para encuadrar el mapa
    // de entrada, no para fijar el punto de la denuncia.
    const { posicion: posicionGps } = useUbicacion();
    const {
      denuncias: misDenuncias,
      crearDenuncia, cargarMisDenuncias, nuevaReferencia, enviando: enviandoDenuncia,
    } = useDenunciasCiudadano();

    // Estado del envío. Antes no existía: el guardado era síncrono contra
    // `localStorage` y no podía fallar.
    const errorEnvio = ref('');
    const avisoEnvio = ref('');
    const subiendoEvidencias = ref(false);
    /* Se genera una sola vez por intento de envío y se conserva entre
       reintentos: es lo que permite al RPC reconocer un reenvío y devolver la
       misma denuncia en vez de crear otra. */
    const referenciaEnvio = ref('');

    /* La referencia de dirección que exige el RPC —mínimo 5 caracteres—.
       El formulario del portal no la pide como campo aparte para no alargarlo,
       así que se compone del distrito y el punto marcado. La cuadrilla necesita
       algo más que una coordenada para llegar, y esto es lo mejor disponible
       sin añadir un paso al vecino. */
    const referenciaDireccion = computed(() => {
      const distrito = perfilCiudadano.value?.distrito_id;
      const nombre = distrito != null
        ? (distritosCatalogo.value || []).find((d) => d.id === distrito)?.nombre
        : null;
      const punto = coordenadasSeleccionadas.value || '';
      return nombre
        ? `${nombre} · punto marcado en el mapa (${punto})`
        : `Punto marcado en el mapa (${punto})`;
    });

    /* Se guarda el ID del grupo, no su nombre. Antes la plantilla recorría un
       objeto `{ nombre: categorias }`, y aplanarlo así perdía el icono, el
       color y la descripción que cada grupo trae: las pestañas salían como
       texto suelto, sin el icono que sí tiene la PWA de campo. */
    const grupoActivo = ref('');

    const grupoActivoInfo = computed(
      () => gruposCatalogo.value.find((g) => g.id === grupoActivo.value) || null
    );

    /** Categorías de la pestaña abierta. */
    const categoriasVisibles = computed(() => grupoActivoInfo.value?.categorias || []);

    // Estado del mapa
    const mapa = ref(null);
    const marcador = ref(null);
    const coordenadasSeleccionadas = ref('');
    const mostrarMenuCapas = ref(false);
    const estiloTile = ref('satellite');
    const capaBase = ref(null);
    const ubicacionActiva = ref(false);
    const marcadorUbicacion = ref(null);
    const circuloPrecision = ref(null);
    const cargandoUbicacion = ref(false);
    const precisionUbicacion = ref(null);

    // Estado de validación de jurisdicción
    const validacionJurisdiccion = ref({ dentro: true, mensaje: '' });
    const mostrarAdvertenciaJurisdiccion = ref(false);
    const mostrarModalFueraJurisdiccion = ref(false);

    // Estado para confirmación de cancelación
    const mostrarConfirmacionCancelar = ref(false);

    // Estado para alerta de denuncia duplicada
    const mostrarAlertaDuplicado = ref(false);
    const denunciasSimilares = ref([]);
    const mensajeDuplicado = ref('');
    const denunciaPendiente = ref(null);
    const marcadoresSimilares = ref([]); // Referencias a marcadores de denuncias similares

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

    // Cambiar tipo de mapa
    const cambiarTile = (estilo) => {
      if (!mapa.value || estiloTile.value === estilo) return;
      estiloTile.value = estilo;
      if (capaBase.value) mapa.value.removeLayer(capaBase.value);
      capaBase.value = construirTile(estilo).addTo(mapa.value);
      // Actualizar color de límites según el nuevo tile
      cargarLimitesMunicipio();
    };

    // Inicializar mapa Leaflet
    const inicializarMapa = () => {
      // Si el mapa ya existe, no reinicializar
      if (mapa.value) {
        if (coordenadasSeleccionadas.value) {
          const coords = coordenadasSeleccionadas.value.split(',').map(c => parseFloat(c.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            mapa.value.setView([coords[0], coords[1]], 16);
          }
        }
        return;
      }

      // Coordenadas del centro de San Salvador Sur o del distrito del usuario
      // El mapa abre sobre el distrito del vecino para ahorrarle el
      // desplazamiento. Antes salía de `localStorage.ciudadano_datos`, la clave
      // del registro simulado, que desde el bloque 2 no escribe nadie: siempre
      // caía al centro del municipio.
      const getCentroMapa = () => {
        const centros = {
          'Panchimalco': [13.611422, -89.178900],
          'Rosario de Mora': [13.574147, -89.206715],
          'San Marcos': [13.656136, -89.181481],
          'Santiago Texacuangos': [13.642589, -89.117934],
          'Santo Tomás': [13.643984, -89.140564]
        };
        const CENTRO_MUNICIPIO = [13.61229, -89.17036];

        /* Si el precalentamiento del GPS ya trajo una posición, se abre ahí.
           Es mucho mejor punto de partida que el centroide de un distrito de
           varios kilómetros, y hace que el mapa aparezca ya encuadrado en vez
           de saltar unos segundos después.

           No sustituye a `obtenerUbicacion`: esa sigue buscando el arreglo
           preciso —con sus reintentos si la precisión no baja de 50 m— porque
           para clavar el punto de una denuncia la exactitud sí importa. Esto
           solo evita que el vecino mire un mapa equivocado mientras tanto. */
        const p = posicionGps.value;
        if (p) return [p.lat, p.lng];

        const id = perfilCiudadano.value?.distrito_id;
        if (id == null) return CENTRO_MUNICIPIO;

        // Se resuelve el NOMBRE contra el catálogo en vez de indexar por id:
        // los ids dependen del orden en que se sembraron los distritos y una
        // resiembra los cambiaría sin avisar. El nombre es estable.
        const nombre = (distritosCatalogo.value || []).find((d) => d.id === id)?.nombre;
        return centros[nombre] || CENTRO_MUNICIPIO;
      };
      const centro = getCentroMapa();

      mapa.value = L.map('map-crear-denuncia', {
        zoomControl: true,
        zoomAnimation: false,
        markerZoomAnimation: false
      }).setView(centro, 13);

      // Capa base dinámica
      capaBase.value = construirTile(estiloTile.value).addTo(mapa.value);

      // Cargar límites del municipio
      cargarLimitesMunicipio();

      if (coordenadasSeleccionadas.value) {
        const coords = coordenadasSeleccionadas.value.split(',').map(c => parseFloat(c.trim()));
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          mapa.value.setView([coords[0], coords[1]], 16);
        }
      }

      // Evento al mover el mapa (estilo InDrive)
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
        if (typeof validarJurisdiccion === 'function' && limitesMunicipio) {
          validacion = validarJurisdiccion(lat, lng, limitesMunicipio, limitesPoligonos);
        }

        validacionJurisdiccion.value = validacion;
        mostrarAdvertenciaJurisdiccion.value = !validacion.dentro;

        if (!validacion.dentro) {
          coordenadasSeleccionadas.value = '';
          return;
        }

        coordenadasSeleccionadas.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      });
      
      // El modal bloqueante ya no se dispara al mover
      mapa.value.on('moveend', () => {
        // Puede usarse para lógica futura
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
      });
    };

    // Capas de límites (referencias para poder actualizarlas al cambiar tile)
    let capaLimitesRef = null;
    let capaDistritosRef = null;
    // Cartografía ya descargada, para uso síncrono dentro de los handlers de
    // Leaflet. La rellena `cargarLimitesMunicipio()`. La validación de
    // jurisdicción DEBE comprobar contra el mismo trazado que se dibuja: antes
    // usaba los globales antiguos y el empleado veía su punto dentro de la
    // frontera pintada mientras el sistema lo daba por fuera.
    let limitesCache = null;


    // Obtener color de límites según el tile activo
    const obtenerColorLimites = () => estiloTile.value === 'satellite' ? '#ffffff' : '#1d4ed8';

    // Cargar límites del municipio en el mapa (mismo estilo que Mapa en Vivo)
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
      } catch (error) {
        console.error('Error al cargar límites:', error);
      }
    };

    const siguientePaso = () => {
      if (pasoActual.value === 1 && !formulario.value.categoriaId) {
        alert('Por favor selecciona una categoría');
        return;
      }
      if (pasoActual.value === 2 && !coordenadasSeleccionadas.value) {
        alert('Por favor selecciona la ubicación en el mapa');
        return;
      }
      if (pasoActual.value < totalPasos) {
        pasoActual.value++;
        // Si avanzamos al paso 2, inicializar el mapa y auto-obtener ubicación
        if (pasoActual.value === 2) {
          setTimeout(() => {
            inicializarMapa();
            // invalidateSize fuerza a Leaflet a recalcular dimensiones del contenedor
            if (mapa.value) mapa.value.invalidateSize();
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
        // Al regresar al paso 2, forzar re-render del mapa
        if (pasoActual.value === 2) {
          setTimeout(() => {
            if (mapa.value) mapa.value.invalidateSize();
          }, 100);
        }
      }
    };

    const irAPaso = (paso) => {
      if (paso < pasoActual.value) {
        pasoActual.value = paso;
        // Al saltar al paso 2 desde el stepper, forzar re-render del mapa
        if (paso === 2) {
          setTimeout(() => {
            if (mapa.value) mapa.value.invalidateSize();
          }, 100);
        }
      }
    };

    // Obtener categoría seleccionada
    const categoriaSeleccionada = computed(() => {
      if (!formulario.value.categoriaId) return null;
      return categoriaPorId(formulario.value.categoriaId);
    });
    const obtenerUbicacion = () => {
      if (!mapa.value) return;

      // Activar ubicación con recálculo de precisión
      if (navigator.geolocation) {
        cargandoUbicacion.value = true;

        // Remover marcador y círculo anterior si estamos recalculando
        if (marcadorUbicacion.value) {
          mapa.value.removeLayer(marcadorUbicacion.value);
          marcadorUbicacion.value = null;
        }
        if (circuloPrecision.value) {
          mapa.value.removeLayer(circuloPrecision.value);
          circuloPrecision.value = null;
        }

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

              // Si la precisión es mayor a 50m y tenemos menos de 3 intentos, reintentar
              if (precisionMetros > 50 && intentos < 3) {
                console.log(`Precisión ${precisionMetros}m > 50m, reintentando... (${intentos + 1}/3)`);
                setTimeout(() => intentarObtenerUbicacion(intentos + 1), 1000);
                return;
              }

              // Si la precisión es mayor a 12m pero menor a 50m, aceptar pero mostrar advertencia
              if (precisionMetros > 12) {
                console.warn(`Precisión ${precisionMetros}m > 12m, pero aceptable`);
              }

              precisionUbicacion.value = precisionMetros;

              // Crear marcador personalizado
              const icono = L.divIcon({
                className: 'ubicacion-icon',
                html: '<div style="background: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
              });

              marcadorUbicacion.value = L.marker([latitude, longitude], { icon: icono })
                .addTo(mapa.value)
                .bindPopup(`Tu ubicación<br><small>Precisión: ±${precisionMetros}m</small>`)
                .openPopup();

              // Agregar círculo de precisión
              circuloPrecision.value = L.circle([latitude, longitude], {
                radius: precisionMetros,
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 1,
                interactive: false // para que no bloquee clicks
              }).addTo(mapa.value);

              // Hacer zoom más cercano (18) a las coordenadas GPS
              mapa.value.setView([latitude, longitude], 18);
              setTimeout(() => mapa.value.invalidateSize(), 100);

              // Ya no usamos marcador de Leaflet para la denuncia
              // marcador.value = L.marker([latitude, longitude]).addTo(mapa.value);
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
      } else {
        alert('Geolocalización no soportada en este navegador');
      }
    };

    // Verificar si hay datos ingresados en el formulario
    const hayDatosIngresados = () => {
      return formulario.value.categoriaId ||
        formulario.value.descripcion ||
        coordenadasSeleccionadas.value;
    };

    // Cancelar con confirmación
    const cancelarDenuncia = () => {
      if (hayDatosIngresados()) {
        mostrarConfirmacionCancelar.value = true;
      } else {
        irA('pwa-poblacion');
      }
    };

    // Confirmar cancelación
    const confirmarCancelacion = () => {
      localStorage.removeItem('tipo_denuncia_seleccionado');
      irA('pwa-poblacion');
      mostrarConfirmacionCancelar.value = false;
    };

    // Cerrar modal de fuera de jurisdicción y salir del formulario
    const cerrarModalFueraJurisdiccion = () => {
      mostrarModalFueraJurisdiccion.value = false;
      localStorage.removeItem('tipo_denuncia_seleccionado');
      irA('pwa-poblacion');
    };

    // Guardar denuncia
    const guardarDenuncia = () => {
      if (!formulario.value.categoriaId || formulario.value.descripcion.length < 10) {
        alert('Por favor completa todos los campos requeridos (descripción mínimo 10 caracteres).');
        return;
      }

      if (!coordenadasSeleccionadas.value) {
        alert('Por favor selecciona la ubicación en el mapa.');
        return;
      }

      // Obtener categoría seleccionada
      const categoria = categoriaPorId(formulario.value.categoriaId);

      // Parsear coordenadas
      const coords = coordenadasSeleccionadas.value.split(',').map(c => parseFloat(c.trim()));
      const lat = coords[0];
      const lng = coords[1];

      // Crear objeto de denuncia temporal para validación
      const denunciaTemp = {
        lat,
        lng,
        tipo_id: formulario.value.categoriaId,
        created_at: new Date().toISOString()
      };

      /* Se compara contra las denuncias del PROPIO vecino, traídas de la base.
         Antes se leía un arreglo de `localStorage` que ya no escribe nadie, así
         que la comprobación no detectaba nada.

         Alcance real, y conviene tenerlo claro: solo avisa de que TÚ ya
         reportaste algo parecido ahí. No puede ver los reportes de otros —la
         RLS se los oculta, y con razón—, así que dos vecinos reportando el
         mismo bache siguen generando dos casos. Detectar eso es trabajo del
         Centro de Monitoreo, no del portal. */
      const denunciasExistentes = (misDenuncias.value || []).map((d) => ({
        id: d.id,
        lat: d.lat,
        lng: d.lng,
        tipo_id: d.categoria_id,
        categoriaNombre: d.categoria_nombre,
        descripcion: d.descripcion,
        created_at: d.created_at,
      }));

      // Validar duplicados
      const validacionDuplicado = validarDenunciaDuplicada(denunciaTemp, denunciasExistentes);

      if (validacionDuplicado.esDuplicado) {
        // Mostrar alerta de duplicado
        denunciasSimilares.value = validacionDuplicado.denunciasSimilares;
        mensajeDuplicado.value = validacionDuplicado.mensaje;
        
        // Mostrar marcadores en el mapa
        mostrarMarcadoresSimilares(validacionDuplicado.denunciasSimilares, lat, lng);
        
        // Guardar denuncia pendiente para posible confirmación
        denunciaPendiente.value = {
          id: Date.now(),
          categoriaId: formulario.value.categoriaId,
          categoriaNombre: categoria ? categoria.nombre : 'Otro',
          departamento: categoria ? categoria.departamento : 'No especificado',
          descripcion: formulario.value.descripcion,
          coordenadas: coordenadasSeleccionadas.value,
          anonima: formulario.value.anonima,
          fotos: formulario.value.fotos,
          fecha: new Date().toISOString(),
          estado: 'pendiente'
        };
        
        mostrarAlertaDuplicado.value = true;
        return;
      }

      // Si no hay duplicado, guardar directamente
      confirmarGuardadoDenuncia();
    };

    /**
     * Envía la denuncia de verdad.
     *
     * Antes esto la metía en un arreglo de `localStorage`: no llegaba a nadie y
     * desaparecía al borrar los datos del navegador. Ahora va al RPC
     * `crear_caso_ciudadano`, que la registra en `casos` y la hace visible en
     * el Centro de Monitoreo.
     *
     * La referencia de cliente se genera UNA vez y se conserva entre
     * reintentos: si el envío se corta después de que el servidor la registrara
     * —cosa normal con mala cobertura— volver a pulsar devuelve la misma
     * denuncia en lugar de crear otra.
     */
    const confirmarGuardadoDenuncia = async () => {
      if (enviandoDenuncia.value) return;      // doble toque = doble denuncia
      errorEnvio.value = '';

      if (!referenciaEnvio.value) referenciaEnvio.value = nuevaReferencia();

      const coords = (coordenadasSeleccionadas.value || '')
        .split(',').map((c) => parseFloat(c.trim()));
      const [lat, lng] = coords.length === 2 ? coords : [null, null];

      try {
        /* Las fotos primero, y a cPanel. Si fallan, la denuncia se manda igual
           SIN ellas: perder la evidencia es malo, perder el reporte entero es
           peor. Se avisa al final para que el vecino sepa qué pasó. */
        let adjuntos = [];
        let fallaronFotos = false;
        if (formulario.value.fotos.length && evidenciasConfiguradas) {
          subiendoEvidencias.value = true;
          try {
            const subidas = await subirEvidencias(formulario.value.fotos);
            adjuntos = (subidas || []).filter((s) => s?.ok).map((s) => ({
              url: s.url, nombre: s.nombre, mime: s.mime, tamano: s.tamano, tipo: 'foto',
            }));
            fallaronFotos = adjuntos.length < formulario.value.fotos.length;
          } catch (e) {
            fallaronFotos = true;
            console.warn('[crear-denuncia] Falló la subida de evidencias:', e.message);
          } finally {
            subiendoEvidencias.value = false;
          }
        }

        const res = await crearDenuncia({
          categoriaId: formulario.value.categoriaId,
          descripcion: formulario.value.descripcion,
          // El RPC exige al menos 5 caracteres. El formulario del portal no
          // pide una referencia aparte, así que se usa el punto marcado en el
          // mapa: es lo que la cuadrilla necesita para llegar.
          direccionReferencia: referenciaDireccion.value,
          lat, lng,
          anonima: formulario.value.anonima === true,
          referenciaCliente: referenciaEnvio.value,
          adjuntos,
        });

        if (!res.ok) { errorEnvio.value = res.error; return; }

        localStorage.removeItem('tipo_denuncia_seleccionado');
        mostrarAlertaDuplicado.value = false;
        denunciaPendiente.value = null;
        limpiarMarcadoresSimilares();

        // Se recarga la lista para que «Mis Denuncias» ya la tenga al llegar,
        // en vez de mostrar un vacío durante un instante.
        await cargarMisDenuncias();

        avisoEnvio.value = res.duplicado
          ? 'Esta denuncia ya estaba registrada.'
          : `Denuncia registrada con el número ${res.correlativo}.` +
            (fallaronFotos ? ' No se pudieron adjuntar todas las fotografías.' : '');

        irA('mis-denuncias');
      } catch (e) {
        errorEnvio.value = 'No se pudo enviar la denuncia. Inténtalo de nuevo.';
        console.error('[crear-denuncia]', e);
      }
    };

    // Cancelar guardado después de alerta de duplicado
    const cancelarGuardadoDenuncia = () => {
      mostrarAlertaDuplicado.value = false;
      denunciaPendiente.value = null;
      denunciasSimilares.value = [];
      limpiarMarcadoresSimilares();
    };

    // Mostrar marcadores de denuncias similares en el mapa
    const mostrarMarcadoresSimilares = (denuncias, centroLat, centroLng) => {
      if (!mapa.value || !denuncias || denuncias.length === 0) return;

      // Limpiar marcadores anteriores
      limpiarMarcadoresSimilares();

      // Agregar círculo de radio de detección
      const circuloRadio = L.circle([centroLat, centroLng], {
        radius: 50, // 50 metros
        color: '#f97316',
        fillColor: '#f97316',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '5, 10'
      }).addTo(mapa.value);
      marcadoresSimilares.value.push(circuloRadio);

      // Agregar marcadores para cada denuncia similar
      denuncias.forEach(denuncia => {
        if (denuncia.lat && denuncia.lng) {
          const coords = denuncia.coordenadas ? 
            denuncia.coordenadas.split(',').map(c => parseFloat(c.trim())) :
            [denuncia.lat, denuncia.lng];
          
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            const marcador = L.circleMarker([coords[0], coords[1]], {
              radius: 8,
              color: '#f97316',
              fillColor: '#f97316',
              fillOpacity: 0.6,
              weight: 2
            }).addTo(mapa.value);
            
            // Popup con información básica
            marcador.bindPopup(`
              <div style="font-family: 'Inter', sans-serif; font-size: 12px;">
                <strong>${denuncia.categoriaNombre || denuncia.tipo || 'General'}</strong><br>
                <span style="color: #666;">${denuncia.descripcion ? denuncia.descripcion.substring(0, 50) + '...' : 'Sin descripción'}</span>
              </div>
            `);
            
            marcadoresSimilares.value.push(marcador);
          }
        }
      });

      // Ajustar vista para incluir todos los marcadores
      if (marcadoresSimilares.value.length > 1) {
        const group = L.featureGroup(marcadoresSimilares.value);
        mapa.value.fitBounds(group.getBounds().pad(0.2));
      }
    };

    // Limpiar marcadores de denuncias similares
    const limpiarMarcadoresSimilares = () => {
      if (!mapa.value) return;
      marcadoresSimilares.value.forEach(marcador => {
        if (mapa.value.hasLayer(marcador)) {
          mapa.value.removeLayer(marcador);
        }
      });
      marcadoresSimilares.value = [];
    };

    // Procesar y optimizar fotografías (Reducir tamaño antes de enviar)
    const procesarFotografia = async (event) => {
      const files = Array.from(event.target.files);
      if (!files.length) return;

      // Tope configurable desde el panel: ver `limitesFotos` en
      // stores/configuracion.js. Antes eran 2 escritos a mano.
      const tope = config.value.limitesFotos?.denunciaCiudadano ?? 1;
      const fotosRestantes = tope - formulario.value.fotos.length;
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

    onMounted(async () => {
      // El catálogo primero: sin él no hay nada que elegir en el paso 1, y la
      // categoría preseleccionada tampoco se podría validar.
      await cargarCategoriasPublicas();

      // Ficha y distritos alimentan el centrado del mapa. Van sin `await`: si
      // llegan tarde, el mapa abre en el centro del municipio, que es una
      // degradación aceptable y no merece retrasar la pantalla.
      if (!perfilCiudadano.value) cargarPerfil();
      if (!distritosCatalogo.value.length) cargarDistritos();
      // Las denuncias propias alimentan la comprobación de duplicados. Sin
      // `await`: si llegan tarde, lo único que se pierde es ese aviso.
      cargarMisDenuncias();

      // Primera pestaña por defecto. No se puede fijar al declararla porque
      // depende de qué grupos tengan categorías abiertas —los vacíos ni se
      // pintan— y eso solo se sabe tras consultar.
      if (!grupoActivo.value && gruposCatalogo.value.length) {
        grupoActivo.value = gruposCatalogo.value[0].id;
      }

      // Una categoría guardada de una sesión anterior puede haber dejado de
      // ofrecerse al público. Se descarta en vez de arrastrar un id que el
      // servidor va a rechazar.
      if (formulario.value.categoriaId && !categoriaPorId(formulario.value.categoriaId)) {
        formulario.value.categoriaId = '';
        localStorage.removeItem('tipo_denuncia_seleccionado');
      }

      // Si viene con una categoría pre-seleccionada, saltar al paso 2
      if (formulario.value.categoriaId) {
        pasoActual.value = 2;
        // Inicializar el mapa después de un pequeño delay para que el DOM esté listo
        setTimeout(() => {
          inicializarMapa();
          if (!coordenadasSeleccionadas.value && !ubicacionActiva.value) {
            obtenerUbicacion();
          }
        }, 100);
      }
    });

    onUnmounted(() => {
      // Limpiar capas de límites primero para evitar errores de Tooltip al destruir el mapa
      if (mapa.value) {
        if (capaLimitesRef) { mapa.value.removeLayer(capaLimitesRef); capaLimitesRef = null; }
        if (capaDistritosRef) { mapa.value.removeLayer(capaDistritosRef); capaDistritosRef = null; }
        if (circuloPrecision.value) { mapa.value.removeLayer(circuloPrecision.value); circuloPrecision.value = null; }
        if (marcadorUbicacion.value) { mapa.value.removeLayer(marcadorUbicacion.value); marcadorUbicacion.value = null; }
        if (marcador.value) { mapa.value.removeLayer(marcador.value); marcador.value = null; }
        limpiarMarcadoresSimilares();
        mapa.value.remove();
        mapa.value = null;
      }
    });

    return {
      formulario,
      gruposCatalogo, grupoActivo, grupoActivoInfo, categoriasVisibles,
      // Estado del catálogo. La pantalla tiene que poder distinguir «cargando»
      // de «no hay ninguna abierta» de «falló la consulta»: las tres se veían
      // igual —una cuadrícula vacía— y ninguna se explicaba.
      cargandoCatalogo,
      errorCatalogo,
      sinCategoriasAbiertas,
      // Envío real
      enviandoDenuncia, subiendoEvidencias, errorEnvio, avisoEnvio,
      coordenadasSeleccionadas,
      mostrarMenuCapas,
      estiloTile,
      pasoActual,
      totalPasos,
      categoriaSeleccionada,
      cambiarTile,
      obtenerUbicacion,
      ubicacionActiva,
      mostrarAlertaDuplicado,
      denunciasSimilares,
      mensajeDuplicado,
      confirmarGuardadoDenuncia,
      cancelarGuardadoDenuncia,
      cargandoUbicacion,
      precisionUbicacion,
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
      // `getColorClass` ya no se expone: traducía nombres de color ('yellow') a
      // clases de Tailwind, y el catálogo real guarda hexadecimales en
      // `color_hex`. La plantilla los aplica con estilo en línea.
      procesarFotografia,
      removerFotografia
    };
  }
};
