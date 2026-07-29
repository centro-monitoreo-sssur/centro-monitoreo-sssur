// Vista: Levantar Denuncia (Empleado) - Diseño Stepper Material 3
// DEMO: Funcionalidad simulada - reemplazar con API real
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { L } from '../../core/libs.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { comprimirImagen } from '../../utils/image-compressor.js';
import { db } from '../../services/supabase-api.js';
import { useOfflineQueue } from '../../stores/offline-queue.js';
import { useConexion } from '../../services/conexion.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { agregarOperacion, TIPOS_OPERACION } = useOfflineQueue();
    const { estaOnline } = useConexion();
    const { tiposDenuncia } = useCatalogos();

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

    // Categorías de denuncias desde catálogos reales (fallback: array vacío)
    const categoriasTabs = ref({});
    const tabActivo = ref('');

    // Cargar categorías agrupadas por departamento
    const cargarCategorias = () => {
      const agrupadas = {};
      (tiposDenuncia.value || []).forEach(t => {
        const area = t.area || 'General';
        if (!agrupadas[area]) agrupadas[area] = [];
        agrupadas[area].push({ id: t.id, nombre: t.nombre, icono: t.icono, color: t.color_hex });
      });
      categoriasTabs.value = agrupadas;
      if (!tabActivo.value) tabActivo.value = Object.keys(agrupadas)[0] || '';
    };

    // Estado del mapa
    const mapa = ref(null);
    const marcador = ref(null);
    const coordenadasSeleccionadas = ref('');
    const mostrarMenuCapas = ref(false);
    const estiloTile = ref('google');
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

    const obtenerColorLimites = () => estiloTile.value === 'satellite' ? '#ffffff' : '#1d4ed8';

    const cargarLimitesMunicipio = () => {
      if (!mapa.value) return;
      const color = obtenerColorLimites();
      try {
        if (typeof window.getMunicipalityGeoJSON === 'function') {
          const limites = window.getMunicipalityGeoJSON();
          if (limites && limites.features) {
            if (capaLimitesRef) mapa.value.removeLayer(capaLimitesRef);
            capaLimitesRef = L.geoJSON(limites, {
              style: { color, weight: 2.5, opacity: 0.9, fillOpacity: 0 }
            }).addTo(mapa.value);
          }
        }
        if (typeof window.getDistritosGeoJSON === 'function') {
          const distritos = window.getDistritosGeoJSON();
          if (distritos && distritos.features) {
            if (capaDistritosRef) mapa.value.removeLayer(capaDistritosRef);
            capaDistritosRef = L.geoJSON(distritos, {
              style: { color, weight: 2.5, opacity: 0.9, fillOpacity: 0 },
              onEachFeature: (feature, layer) => {
                const nombre = feature.properties?.name || feature.properties?.NOMBRE || feature.properties?.nombre;
                if (nombre) layer.bindPopup(`<b style="font-family:'Inter',sans-serif;font-size:12px;">${nombre}</b>`);
              }
            }).addTo(mapa.value);
          }
        }
      } catch (error) {
        console.error('Error al cargar límites:', error);
      }
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
        const limitesMunicipio = typeof window.getMunicipalityGeoJSON === 'function'
          ? window.getMunicipalityGeoJSON() : null;
        const limitesPoligonos = typeof window.getDistritosGeoJSON === 'function'
          ? window.getDistritosGeoJSON() : null;

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
      });
    };

    const siguientePaso = () => {
      if (pasoActual.value === 1 && !formulario.value.categoriaId) return;
      if (pasoActual.value === 2 && !coordenadasSeleccionadas.value) return;
      if (pasoActual.value < totalPasos) {
        pasoActual.value++;
        if (pasoActual.value === 2) {
          setTimeout(() => {
            inicializarMapa();
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
        if (pasoActual.value === 2) {
          setTimeout(() => { if (mapa.value) mapa.value.invalidateSize(); }, 100);
        }
      }
    };

    const irAPaso = (paso) => {
      if (paso < pasoActual.value) {
        pasoActual.value = paso;
        if (paso === 2) {
          setTimeout(() => { if (mapa.value) mapa.value.invalidateSize(); }, 100);
        }
      }
    };

    const categoriaSeleccionada = computed(() => {
      if (!formulario.value.categoriaId) return null;
      return categoriasDenuncias.find(cat => cat.id === parseInt(formulario.value.categoriaId));
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
      formulario.value.categoriaId || formulario.value.descripcion || coordenadasSeleccionadas.value;

    const cancelarDenuncia = () => {
      if (hayDatosIngresados()) {
        mostrarConfirmacionCancelar.value = true;
      } else {
        irA('pwa-empleado');
      }
    };

    const confirmarCancelacion = () => {
      localStorage.removeItem('tipo_denuncia_seleccionado');
      irA('pwa-empleado');
      mostrarConfirmacionCancelar.value = false;
    };

    const cerrarModalFueraJurisdiccion = () => {
      mostrarModalFueraJurisdiccion.value = false;
      localStorage.removeItem('tipo_denuncia_seleccionado');
      irA('pwa-empleado');
    };

    const guardarDenuncia = async () => {
      if (!formulario.value.categoriaId || formulario.value.descripcion.length < 10) {
        alert('Por favor completa todos los campos requeridos (descripción mínimo 10 caracteres).');
        return;
      }
      if (!coordenadasSeleccionadas.value) {
        alert('Por favor selecciona la ubicación en el mapa.');
        return;
      }

      const categoria = (tiposDenuncia.value || []).find(cat => cat.id == formulario.value.categoriaId);

      const denuncia = {
        titulo: categoria ? categoria.nombre : 'Denuncia',
        categoria_id: formulario.value.categoriaId,
        descripcion: formulario.value.descripcion,
        coordenadas: coordenadasSeleccionadas.value,
        es_anonima: formulario.value.anonima,
        fotos: formulario.value.fotos,
        origen: 'empleado',
        estado_codigo: 'recibida',
        fecha: new Date().toISOString()
      };

      // --- Offline-first ---
      if (estaOnline.value && db) {
        try {
          const { error } = await db.from('casos').insert([{
            titulo: denuncia.titulo,
            descripcion: denuncia.descripcion,
            categoria_id: denuncia.categoria_id,
            coordenadas: denuncia.coordenadas,
            es_anonima: denuncia.es_anonima,
            origen: denuncia.origen,
            estado_codigo: denuncia.estado_codigo
          }]);
          if (error) throw error;

          localStorage.removeItem('tipo_denuncia_seleccionado');
          alert('✅ Denuncia registrada exitosamente.');
          irA('pwa-empleado');
          return;
        } catch(e) {
          console.warn('[LevanterDenuncia] Falla al guardar en DB, encolando...', e.message);
        }
      }

      // Sin conexión o fallo DB → encolar para sincronizar después
      agregarOperacion({
        tipo: TIPOS_OPERACION.LEVANTAR_DENUNCIA,
        datos: denuncia,
        prioridad: 'alta'
      });

      localStorage.removeItem('tipo_denuncia_seleccionado');
      alert('📥 Sin conexión. La denuncia fue guardada en el buzón offline y se enviará automáticamente al recuperar señal.');
      irA('pwa-empleado');
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
      cargarCategorias();
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
      estaOnline,
      procesarFotografia,
      removerFotografia
    };
  }
};
