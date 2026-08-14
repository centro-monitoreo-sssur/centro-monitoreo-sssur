// ============================================================
// COMPONENTE: aviso interno a pantalla completa
//
// Cuando la municipalidad publica un comunicado con audiencia `interno`, quien
// opera el Centro de Monitoreo debe verlo, no encontrárselo. Un distintivo en
// el menú no sirve para un aviso que hay que leer AHORA —un corte del sistema,
// una instrucción de la gerencia—: por eso interrumpe.
//
// ── POR QUÉ SOLO `interno` ──────────────────────────────────────────────────
// Un aviso dirigido a la ciudadanía o a las cuadrillas no tiene por qué
// interrumpir a quien está atendiendo casos. Lo verá en su sitio. Si todo
// interrumpe, se aprende a cerrar el modal sin leerlo y deja de servir para
// nada.
//
// ── DE UNO EN UNO ───────────────────────────────────────────────────────────
// Si hay tres sin leer no se apilan tres modales: se muestran en orden de
// publicación, y cada «Entendido» marca el actual y trae el siguiente. Es lo
// que permite leerlos de verdad en vez de cerrarlos en cadena.
// ============================================================
import { ref, computed, watch } from '../../core/vue.js';
import { useComunicados } from '../../stores/comunicados.js';
import { sanearHtml } from './ui/ui-editor-texto.js';

export default {
  name: 'modal-comunicado-interno',
  setup() {
    const { internosSinLeer, marcarLeido } = useComunicados();

    /* No se muestra directamente `internosSinLeer[0]`. Al marcar el actual como
       leído, el store lo saca de la lista y el siguiente ocuparía su sitio de
       golpe: el modal cambiaría de contenido bajo el cursor y quien acaba de
       pulsar «Entendido» estaría descartando algo que no ha visto.

       Se fija una copia y solo se avanza cuando se cierra. */
    const actual = ref(null);
    const cerrando = ref(false);

    const hayMas = computed(() =>
      internosSinLeer.value.filter((c) => c.id !== actual.value?.id).length
    );

    const cuerpoSeguro = computed(() => sanearHtml(actual.value?.descripcion || ''));

    const fechaLegible = computed(() => {
      if (!actual.value?.fecha) return '';
      return new Date(actual.value.fecha).toLocaleString('es-SV', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    });

    const tomarSiguiente = () => {
      const pendientes = internosSinLeer.value;
      actual.value = pendientes.length ? { ...pendientes[0] } : null;
    };

    // Arranca en cuanto haya alguno, y también cuando llegue uno nuevo en un
    // refresco posterior. `immediate` porque al montar la lista puede ya estar
    // cargada —`app-root` la pide antes de que este componente exista—.
    watch(internosSinLeer, (lista) => {
      if (!actual.value && lista.length) tomarSiguiente();
    }, { immediate: true, deep: false });

    const confirmar = async () => {
      if (!actual.value || cerrando.value) return;
      cerrando.value = true;
      const id = actual.value.id;
      try {
        await marcarLeido(id);
      } finally {
        cerrando.value = false;
        // Se limpia y se vuelve a tomar: si `marcarLeido` falló, el store
        // deshizo la marca y este mismo comunicado volverá a salir. Es lo
        // correcto — un aviso que no se pudo registrar como leído no debe
        // darse por leído.
        actual.value = null;
        tomarSiguiente();
      }
    };

    return { actual, hayMas, cuerpoSeguro, fechaLegible, cerrando, confirmar };
  },
};
