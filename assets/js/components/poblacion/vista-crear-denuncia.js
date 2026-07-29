// Vista: Crear Denuncia (Población)
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { categoriasDenuncias, getCategoriasPorTab, getColorClass } from '../../utils/categorias-denuncias.js';
import { comprimirImagen } from '../../utils/image-compressor.js';
import { validarDenunciaDuplicada, generarResumenSimilares } from '../../utils/validacion-duplicados.js';

export default {
  setup() {
    const { irA } = useNavegacion();

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

    // Categorías de denuncias divididas en pestañas
    const categoriasTabs = ref(getCategoriasPorTab());
    const tabActivo = ref('Seguridad y Emergencias');

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
      const getCentroMapa = () => {
        const centros = {
          'Panchimalco': [13.611422, -89.178900],
          'Rosario de Mora': [13.574147, -89.206715],
          'San Marcos': [13.656136, -89.181481],
          'Santiago Texacuangos': [13.642589, -89.117934],
          'Santo Tomás': [13.643984, -89.140564]
        };
        try {
          const datosStr = localStorage.getItem('ciudadano_datos');
          const distrito = datosStr ? JSON.parse(datosStr).distrito : null;
          return centros[distrito] || [13.61229, -89.17036];
        } catch (e) {
          return [13.61229, -89.17036];
        }
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
        const limitesMunicipio = typeof getMunicipalityGeoJSON === 'function' ? getMunicipalityGeoJSON() : null;
        const limitesPoligonos = typeof getDistritosGeoJSON === 'function' ? getDistritosGeoJSON() : null;
        
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

    // Obtener color de límites según el tile activo
    const obtenerColorLimites = () => estiloTile.value === 'satellite' ? '#ffffff' : '#1d4ed8';

    // Cargar límites del municipio en el mapa (mismo estilo que Mapa en Vivo)
    const cargarLimitesMunicipio = () => {
      if (!mapa.value) return;

      const color = obtenerColorLimites();

      try {
        const limites = getMunicipalityGeoJSON();
        if (limites && limites.features) {
          if (capaLimitesRef) mapa.value.removeLayer(capaLimitesRef);
          capaLimitesRef = L.geoJSON(limites, {
            style: {
              color,
              weight: 2.5,
              opacity: 0.9,
              fillOpacity: 0
            }
          }).addTo(mapa.value);
        }

        const distritos = getDistritosGeoJSON();
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
              const nombre = feature.properties?.name || feature.properties?.NOMBRE || feature.properties?.nombre;
              // Usamos bindPopup en lugar de sticky tooltip para evitar errores al desmontar el mapa
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
      return categoriasDenuncias.find(cat => cat.id === parseInt(formulario.value.categoriaId));
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
      const categoria = categoriasDenuncias.find(cat => cat.id === parseInt(formulario.value.categoriaId));

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

      // Obtener denuncias existentes del localStorage
      const denunciasExistentes = JSON.parse(localStorage.getItem('denuncias_poblacion') || '[]');

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

    // Confirmar guardado de denuncia (después de alerta de duplicado)
    const confirmarGuardadoDenuncia = () => {
      const denuncia = denunciaPendiente.value || {
        id: Date.now(),
        categoriaId: formulario.value.categoriaId,
        categoriaNombre: categoriasDenuncias.find(cat => cat.id === parseInt(formulario.value.categoriaId))?.nombre || 'Otro',
        departamento: categoriasDenuncias.find(cat => cat.id === parseInt(formulario.value.categoriaId))?.departamento || 'No especificado',
        descripcion: formulario.value.descripcion,
        coordenadas: coordenadasSeleccionadas.value,
        anonima: formulario.value.anonima,
        fotos: formulario.value.fotos,
        fecha: new Date().toISOString(),
        estado: 'pendiente'
      };

      // Si hay denuncias similares, agregar referencia a la más cercana (merge simple)
      if (denunciasSimilares.value.length > 0) {
        const denunciaCercana = denunciasSimilares.value[0];
        denuncia.denunciaRelacionadaId = denunciaCercana.id;
        denuncia.esDuplicadoConfirmado = true;
        denuncia.motivoDuplicado = 'Usuario confirmó reporte similar';
      }

      // Guardar en localStorage (DEMO)
      const denuncias = JSON.parse(localStorage.getItem('denuncias_poblacion') || '[]');
      denuncias.push(denuncia);
      localStorage.setItem('denuncias_poblacion', JSON.stringify(denuncias));

      // Limpiar localStorage de tipo seleccionado
      localStorage.removeItem('tipo_denuncia_seleccionado');

      // Cerrar alerta si estaba abierta
      mostrarAlertaDuplicado.value = false;
      denunciaPendiente.value = null;
      limpiarMarcadoresSimilares();

      alert('Denuncia creada exitosamente');
      irA('mis-denuncias');
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
      categoriasTabs,
      tabActivo,
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
      getColorClass,
      procesarFotografia,
      removerFotografia
    };
  }
};
