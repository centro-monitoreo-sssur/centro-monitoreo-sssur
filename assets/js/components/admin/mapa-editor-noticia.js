// ============================================================
// COMPONENTE: dónde ocurre lo que se comunica
//
// El portal ciudadano lleva desde el principio con el código para pintar un
// comunicado sobre el mapa: un punto azul para un evento o una jornada, y una
// polilínea roja con banderas de inicio y fin para un cierre de vía. Ese código
// no se había ejecutado nunca, porque no existía ninguna forma de publicar ni
// el punto ni el trazado. Esto es esa forma.
//
// ── DOS MODOS, NO DOS COMPONENTES ───────────────────────────────────────────
// «Un sitio» y «un tramo» comparten mapa, tesela, encuadre y limpieza; lo único
// que cambia es qué hace un clic. Separarlos duplicaría cien líneas para
// distinguir dos comportamientos de una.
//
// ── EL ORDEN DE LAS COORDENADAS ─────────────────────────────────────────────
// El trazado se guarda como pares [lat, lng], que es lo que consume
// `L.polyline`, NO el [lng, lat] del estándar GeoJSON pese al nombre de la
// columna. Invertirlos dibuja el trazo en el océano Índico y no falla al
// guardar: por eso la v39 añadió un CHECK que comprueba el rango del país.
//
// ── LEAFLET Y VUE ───────────────────────────────────────────────────────────
// Ni el mapa ni ninguna capa entran en un `ref`. Es la regla del proyecto y
// tiene una causa concreta: el proxy reactivo rompe los métodos internos de
// Leaflet con `TypeError: ... '_latLngToNewLayerPoint'`.
// ============================================================
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from '../../core/vue.js';
import { L } from '../../core/libs.js';

// Centro del municipio, para arrancar cuando todavía no hay nada marcado.
const CENTRO_SSSUR = [13.61229, -89.17036];
const MAXIMO_PUNTOS_TRAZADO = 500;   // el mismo tope que valida la v39

export default {
  props: {
    /** Punto marcado: { lat, lng } o null. */
    punto: { type: Object, default: null },
    /** Trazado: arreglo de pares [lat, lng] o null. */
    trazado: { type: Array, default: null },
  },
  emits: ['update:punto', 'update:trazado'],

  setup(props, { emit }) {
    // 'ninguno' | 'punto' | 'trazado'. Se decide por lo que ya trae el
    // comunicado al abrirlo para editar.
    const modo = ref(
      Array.isArray(props.trazado) && props.trazado.length ? 'trazado'
        : props.punto ? 'punto'
          : 'ninguno'
    );

    // Copia de trabajo del trazado. Se emite al padre en cada cambio, pero se
    // dibuja desde aquí: leer del padre en cada clic obligaría a esperar un
    // ciclo de reactividad para pintar el punto que se acaba de poner.
    const puntosTrazado = ref(Array.isArray(props.trazado) ? [...props.trazado] : []);
    const puntoActual = ref(props.punto ? { ...props.punto } : null);

    // Objetos de Leaflet: `let` plano, jamás reactivo. Ver el encabezado.
    let mapa = null;
    let capaPunto = null;
    let capaLinea = null;
    let capaVertices = [];
    let observadorTamano = null;

    const hayTrazadoUtil = computed(() => puntosTrazado.value.length >= 2);
    const tope = computed(() => puntosTrazado.value.length >= MAXIMO_PUNTOS_TRAZADO);

    const ayuda = computed(() => {
      if (modo.value === 'punto') {
        return puntoActual.value
          ? 'Toca otro sitio para mover la marca.'
          : 'Toca en el mapa el lugar del que habla el comunicado.';
      }
      if (modo.value === 'trazado') {
        if (tope.value) return `Máximo ${MAXIMO_PUNTOS_TRAZADO} puntos.`;
        if (puntosTrazado.value.length === 0) return 'Toca el inicio del tramo cerrado.';
        if (puntosTrazado.value.length === 1) return 'Ahora toca el final. Puedes añadir más puntos para seguir las curvas.';
        return 'Añade más puntos para seguir la calle, o guarda así.';
      }
      return 'Este comunicado no señala ningún lugar en el mapa.';
    });

    // ── Dibujo ───────────────────────────────────────────────────────────────

    function limpiarCapas() {
      if (!mapa) return;
      if (capaPunto) { mapa.removeLayer(capaPunto); capaPunto = null; }
      if (capaLinea) { mapa.removeLayer(capaLinea); capaLinea = null; }
      capaVertices.forEach((v) => mapa.removeLayer(v));
      capaVertices = [];
    }

    function iconoRedondo(color, icono, tamano) {
      return L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:50%;
               width:${tamano}px;height:${tamano}px;display:flex;align-items:center;
               justify-content:center;font-size:${Math.round(tamano / 2.4)}px;
               box-shadow:0 2px 8px rgba(0,0,0,.35)"><i class="fa-solid ${icono}"></i></div>`,
        iconSize: [tamano, tamano],
        iconAnchor: [tamano / 2, tamano / 2],
      });
    }

    /* Se repinta entero en cada cambio en lugar de mover capas.
       Son como mucho unas decenas de vértices dibujados por una persona a mano:
       el coste es irrelevante y el estado en pantalla no puede quedar
       desincronizado del arreglo, que es el error caro. */
    function repintar() {
      if (!mapa) return;
      limpiarCapas();

      if (modo.value === 'punto' && puntoActual.value) {
        capaPunto = L.marker([puntoActual.value.lat, puntoActual.value.lng], {
          icon: iconoRedondo('#2563eb', 'fa-location-dot', 34),
        }).addTo(mapa);
        return;
      }

      if (modo.value === 'trazado' && puntosTrazado.value.length) {
        if (puntosTrazado.value.length >= 2) {
          capaLinea = L.polyline(puntosTrazado.value, {
            color: '#ef4444', weight: 6, opacity: .85,
            dashArray: '10, 8', lineCap: 'round', lineJoin: 'round',
          }).addTo(mapa);
        }
        puntosTrazado.value.forEach((par, i) => {
          const ultimo = i === puntosTrazado.value.length - 1;
          const extremo = i === 0 || (ultimo && puntosTrazado.value.length > 1);
          capaVertices.push(
            L.marker(par, {
              icon: extremo
                ? iconoRedondo('#ef4444', 'fa-road-barrier', 28)
                // Los vértices intermedios son solo la forma de la calle, no
                // información para nadie: se dibujan discretos.
                : iconoRedondo('#f87171', 'fa-circle', 16),
            }).addTo(mapa)
          );
        });
      }
    }

    function encuadrar() {
      if (!mapa) return;
      if (modo.value === 'trazado' && puntosTrazado.value.length >= 2) {
        mapa.fitBounds(L.latLngBounds(puntosTrazado.value), { padding: [40, 40] });
      } else if (modo.value === 'punto' && puntoActual.value) {
        mapa.setView([puntoActual.value.lat, puntoActual.value.lng], 16);
      }
    }

    // ── Interacción ──────────────────────────────────────────────────────────

    function alTocarMapa(evento) {
      const lat = Number(evento.latlng.lat.toFixed(6));
      const lng = Number(evento.latlng.lng.toFixed(6));

      if (modo.value === 'punto') {
        puntoActual.value = { lat, lng };
        emit('update:punto', { lat, lng });
        repintar();
        return;
      }
      if (modo.value === 'trazado') {
        if (tope.value) return;
        puntosTrazado.value = [...puntosTrazado.value, [lat, lng]];
        emitirTrazado();
        repintar();
      }
    }

    /* Menos de dos puntos no es un tramo: se emite null para no guardar un
       trazado que el portal no sabría dibujar y que el CHECK de la v39
       rechazaría al llegar a la base. */
    function emitirTrazado() {
      emit('update:trazado', hayTrazadoUtil.value ? [...puntosTrazado.value] : null);
    }

    function deshacerPunto() {
      if (!puntosTrazado.value.length) return;
      puntosTrazado.value = puntosTrazado.value.slice(0, -1);
      emitirTrazado();
      repintar();
    }

    function limpiar() {
      puntosTrazado.value = [];
      puntoActual.value = null;
      emit('update:punto', null);
      emit('update:trazado', null);
      repintar();
    }

    /* Cambiar de modo BORRA lo del otro: un comunicado señala un sitio o un
       tramo, no las dos cosas, y el portal dibuja el trazado con preferencia.
       Guardar los dos dejaría un punto invisible que reaparecería al volver a
       editar sin que nadie entienda de dónde salió. */
    function cambiarModo(nuevo) {
      if (modo.value === nuevo) return;
      modo.value = nuevo;
      limpiar();
    }

    // ── Ciclo de vida ────────────────────────────────────────────────────────

    function crearMapa(elemento) {
      mapa = L.map(elemento, {
        zoomControl: true,
        attributionControl: false,
        // Sin esto, rodar la rueda dentro de un formulario largo hace zoom en
        // vez de desplazar la página, y se pierde el sitio donde se estaba.
        scrollWheelZoom: false,
      }).setView(CENTRO_SSSUR, 13);

      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 })
        .addTo(mapa);

      mapa.on('click', alTocarMapa);

      /* Leaflet mide su contenedor UNA vez, al crearlo. Este mapa vive dentro
         de un modal que puede abrirse con el contenedor todavía a cero, y
         entonces se queda con las teselas a medio cargar hasta que algo lo
         mueva. */
      observadorTamano = new ResizeObserver(() => mapa && mapa.invalidateSize());
      observadorTamano.observe(elemento);

      repintar();
      encuadrar();
    }

    onMounted(async () => {
      await nextTick();
      const elemento = document.getElementById('mapa-editor-noticia');
      if (elemento) crearMapa(elemento);
    });

    onUnmounted(() => {
      if (observadorTamano) { observadorTamano.disconnect(); observadorTamano = null; }
      if (mapa) { mapa.off('click', alTocarMapa); mapa.remove(); mapa = null; }
      capaPunto = null; capaLinea = null; capaVertices = [];
    });

    // El padre reutiliza el mismo formulario para cada comunicado que se abre.
    watch(() => [props.punto, props.trazado], ([nuevoPunto, nuevoTrazado]) => {
      puntoActual.value = nuevoPunto ? { ...nuevoPunto } : null;
      puntosTrazado.value = Array.isArray(nuevoTrazado) ? [...nuevoTrazado] : [];
      modo.value = puntosTrazado.value.length ? 'trazado'
        : puntoActual.value ? 'punto'
          : 'ninguno';
      repintar();
      encuadrar();
    });

    return {
      modo, puntosTrazado, puntoActual, ayuda, tope, hayTrazadoUtil,
      cambiarModo, deshacerPunto, limpiar, encuadrar,
      MAXIMO_PUNTOS_TRAZADO,
    };
  },
};
