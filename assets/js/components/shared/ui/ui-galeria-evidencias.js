// ============================================================
// PRIMITIVA: galería de evidencia fotográfica de un caso
//
// La misma en las tres aplicaciones. El Centro de Monitoreo la usa en el modal
// de gestión y en el del Mapa en Vivo; la PWA de campo, en el detalle de la
// intervención; el portal, en el detalle de la denuncia del vecino. Una sola
// implementación porque la pregunta es la misma en todas: «enséñame la foto».
//
// ── LO QUE DISTINGUE ────────────────────────────────────────────────────────
// Separa la foto del REPORTE de la foto del CIERRE (`casos_adjuntos.es_evidencia`).
// Son dos momentos del caso —el problema y el trabajo hecho— y mezclarlas en
// una sola tira deja al operador sin saber cuál está mirando. Si solo hay de
// una clase, no se pinta ningún encabezado: no hace falta explicar una
// distinción que no existe en ese caso.
//
// ── POR QUÉ CARGA SOLA Y NO RECIBE LAS FOTOS COMO PROP ──────────────────────
// Porque ninguna de las cuatro pantallas que la usan traía los adjuntos, y
// pedírselos a cada una obligaría a repetir la misma consulta cuatro veces con
// cuatro estados de carga distintos. La galería sabe pedirlas; quien la coloca
// solo tiene que decirle de qué caso.
//
// ── EL VISOR ────────────────────────────────────────────────────────────────
// Sin biblioteca. Un lightbox son cuarenta líneas y ya hay trece dependencias
// de CDN pendientes de vendorizar; añadir la catorceava para esto no sale a
// cuenta.
// ============================================================
import { ref, computed, watch, onMounted, onUnmounted } from '../../../core/vue.js';
import { cargarAdjuntosDeCaso } from '../../../services/adjuntos-caso.js';

export default {
  props: {
    /** Caso cuyas fotografías se muestran. Cambiarlo recarga la galería. */
    casoId: { type: [Number, String], default: null },
    /** Rótulo de la sección. */
    titulo: { type: String, default: 'Evidencia fotográfica' },
    /* Miniaturas más pequeñas y sin tarjeta alrededor, para las PWA, donde el
       ancho es el recurso escaso. */
    compacta: { type: Boolean, default: false },
    /* Oculta el bloque entero cuando el caso no tiene ninguna foto. En el modal
       de gestión interesa lo contrario: decir «sin fotografías» es información
       —el vecino no adjuntó nada—, no un hueco. */
    ocultarSiVacia: { type: Boolean, default: false },
  },

  setup(props) {
    const adjuntos = ref([]);
    const cargando = ref(false);
    const error = ref('');
    // Índice de la foto abierta en el visor. null = visor cerrado.
    const indiceVisor = ref(null);
    // Fotos que el navegador no logró cargar; se marcan para no dejar el hueco
    // roto de un `<img>` fallido, que se ve peor que decirlo.
    const rotas = ref(new Set());

    const deReporte = computed(() => adjuntos.value.filter((a) => !a.esEvidenciaDeCierre));
    const deCierre  = computed(() => adjuntos.value.filter((a) => a.esEvidenciaDeCierre));
    // Solo se rotulan los grupos si conviven los dos.
    const hayDosGrupos = computed(() => deReporte.value.length > 0 && deCierre.value.length > 0);
    const vacia = computed(() => !cargando.value && !error.value && adjuntos.value.length === 0);
    const visible = computed(() => !(props.ocultarSiVacia && vacia.value));

    const fotoActual = computed(() =>
      indiceVisor.value === null ? null : adjuntos.value[indiceVisor.value] || null
    );

    async function cargar() {
      if (!props.casoId) { adjuntos.value = []; return; }
      cargando.value = true;
      error.value = '';
      rotas.value = new Set();
      const r = await cargarAdjuntosDeCaso(props.casoId);
      adjuntos.value = r.adjuntos;
      error.value = r.error;
      cargando.value = false;
    }

    // ── Visor ────────────────────────────────────────────────────────────────

    /* El visor navega sobre la lista COMPLETA, no sobre el grupo desde el que
       se abrió: quien está mirando las fotos de un caso quiere pasarlas todas,
       no toparse con el final del grupo. */
    function abrirVisor(adjunto) {
      const i = adjuntos.value.findIndex((a) => a.id === adjunto.id);
      if (i >= 0) indiceVisor.value = i;
    }
    function cerrarVisor() { indiceVisor.value = null; }

    function mover(paso) {
      if (indiceVisor.value === null || adjuntos.value.length < 2) return;
      const total = adjuntos.value.length;
      indiceVisor.value = (indiceVisor.value + paso + total) % total;
    }

    function alFallarImagen(adjunto) {
      // `Set` nuevo y no `add`: Vue no observa la mutación de un Set dentro de
      // un `ref`, así que sin reemplazarlo el aviso no se pintaría nunca.
      rotas.value = new Set([...rotas.value, adjunto.id]);
    }
    const estaRota = (adjunto) => rotas.value.has(adjunto.id);

    /** Tamaño en algo que se lea de un vistazo. */
    function tamanoLegible(bytes) {
      if (!bytes) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function fechaLegible(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleString('es-SV', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    }

    /* El teclado se atiende en `window` y no en el contenedor: el visor se
       monta sobre un modal que ya tiene el foco, así que un listener local no
       recibiría nada. */
    function alPulsarTecla(evento) {
      if (indiceVisor.value === null) return;
      if (evento.key === 'Escape')     { evento.stopPropagation(); cerrarVisor(); }
      if (evento.key === 'ArrowRight') mover(1);
      if (evento.key === 'ArrowLeft')  mover(-1);
    }

    onMounted(() => {
      cargar();
      window.addEventListener('keydown', alPulsarTecla, true);
    });
    onUnmounted(() => window.removeEventListener('keydown', alPulsarTecla, true));

    // Los modales reutilizan la misma instancia y solo cambian el caso.
    watch(() => props.casoId, () => { cerrarVisor(); cargar(); });

    return {
      adjuntos, cargando, error, vacia, visible,
      deReporte, deCierre, hayDosGrupos,
      indiceVisor, fotoActual, abrirVisor, cerrarVisor, mover,
      alFallarImagen, estaRota,
      tamanoLegible, fechaLegible, recargar: cargar,
    };
  },
};
