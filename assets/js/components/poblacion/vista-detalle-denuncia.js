// Vista: Detalle de Denuncia (Población)
//
// Buscaba la denuncia en el arreglo de `localStorage`, que ya no escribe nadie:
// desde que el envío pasa por el RPC, esta pantalla rebotaba SIEMPRE a «Mis
// Denuncias» sin decir por qué. Ahora sale de `v_mis_denuncias_ciudadano`.
//
// El seguimiento del estado es lo que se le prometió al vecino al aceptar su
// denuncia, así que es la pantalla que más importa que diga la verdad.
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useDenunciasCiudadano } from '../../stores/denuncias-ciudadano.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { getColorClass } from '../../utils/categorias-denuncias.js';
import { getColorClassEstado } from '../../utils/estados-denuncias.js';
import { compartirDenuncia } from '../../services/compartir-denuncia.js';
import {
  seguidas, avisosSoportados, permisoAvisos, alternarAviso,
} from '../../services/avisos-denuncia.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const {
      denuncias: filas, cargando, errorDenuncias,
      cargarMisDenuncias, denunciaPorId,
    } = useDenunciasCiudadano();
    // El flujo de estados lo declara cada categoría en `estados_flujo`.
    const { tiposDenuncia, cargarTipos } = useCatalogos();

    const denunciaId = ref(null);
    const fila = ref(null);

    /* Forma que espera la plantilla. `anonima` sale de
       `denunciante_es_anonimo`, que es lo que la vista expone. */
    const denuncia = computed(() => {
      if (!fila.value) return null;
      const d = fila.value;
      return {
        id: d.id,
        correlativo: d.correlativo,
        categoriaId: d.categoria_id,
        descripcion: d.descripcion,
        estado: d.estado_codigo,
        fecha: d.created_at,
        anonima: d.denunciante_es_anonimo === true,
        coordenadas: d.lat != null && d.lng != null
          ? `${Number(d.lat).toFixed(6)}, ${Number(d.lng).toFixed(6)}`
          : '',
        resolucion: d.resolucion,
        fechaCierre: d.fecha_cierre,
        distrito: d.distrito_nombre,
        direccion: d.direccion_referencia,
      };
    });

    const categoria = computed(() => {
      if (!fila.value) return null;
      return {
        id: fila.value.categoria_id,
        nombre: fila.value.categoria_nombre,
        icono: fila.value.categoria_icono,
        color: fila.value.categoria_color,
      };
    });

    /* El flujo REAL de la categoría, tal y como lo declara la base.
       Antes salía de `utils/estados-denuncias.js`, una tabla escrita a mano que
       no coincidía con `estados_flujo`: la barra de progreso mostraba pasos que
       esa categoría no tiene, o se quedaba a cero porque el estado del caso no
       aparecía en la lista. */
    const flujoEstados = computed(() => {
      const cat = (tiposDenuncia.value || []).find((t) => t.id === fila.value?.categoria_id);
      const flujo = cat?.estados_flujo;
      return Array.isArray(flujo) ? flujo : [];
    });

    const estadoActual = computed(() => {
      if (!fila.value) return null;
      const enFlujo = flujoEstados.value.find((e) => e.id === fila.value.estado_codigo);
      // Si el estado no está en el flujo declarado —una categoría cuyo flujo se
      // editó después—, se muestra el código en vez de dejar el hueco vacío.
      return enFlujo || { id: fila.value.estado_codigo, nombre: fila.value.estado_codigo };
    });

    const indiceEstadoActual = computed(() =>
      flujoEstados.value.findIndex((e) => e.id === estadoActual.value?.id)
    );

    const porcentajeProgreso = computed(() => {
      const total = flujoEstados.value.length;
      if (!total || indiceEstadoActual.value === -1) return 0;
      return ((indiceEstadoActual.value + 1) / total) * 100;
    });

    // ── Avisos y compartir ───────────────────────────────────────────────────
    // Los dos botones del pie llevaban desde el principio sin `@click`: eran
    // decoración. Ver services/avisos-denuncia.js para el alcance exacto de lo
    // que se promete aquí, que NO incluye avisar con la aplicación cerrada.
    const compartiendo = ref(false);
    const avisoAccion = ref({ tipo: '', texto: '' });

    const sigueEstaDenuncia = computed(() =>
      Boolean(fila.value) && seguidas.value.has(Number(fila.value.id))
    );
    const puedeAvisar = computed(() => avisosSoportados() && permisoAvisos() !== 'denied');

    function anunciar(tipo, texto) {
      avisoAccion.value = { tipo, texto };
      if (tipo === 'ok') setTimeout(() => { avisoAccion.value = { tipo: '', texto: '' }; }, 5000);
    }

    async function alternarNotificaciones() {
      if (!fila.value) return;
      const r = await alternarAviso(fila.value.id);
      if (!r.ok) { anunciar('error', r.motivo); return; }
      anunciar('ok', r.sigue
        ? 'Te avisaremos cuando esta denuncia cambie de estado.'
        : 'Ya no recibirás avisos de esta denuncia.');
    }

    async function compartir() {
      if (!fila.value || compartiendo.value) return;
      compartiendo.value = true;
      avisoAccion.value = { tipo: '', texto: '' };
      try {
        /* Se le pasa la denuncia YA PRESENTADA, no la fila cruda: el servicio
           dibuja una tarjeta para un vecino, no serializa un registro. */
        const r = await compartirDenuncia({
          id: fila.value.id,
          correlativo: fila.value.correlativo,
          categoriaNombre: fila.value.categoria_nombre,
          descripcion: fila.value.descripcion,
          estado: fila.value.estado_codigo,
          estadoNombre: estadoActual.value?.nombre || fila.value.estado_codigo,
          direccion: fila.value.direccion_referencia,
          distrito: fila.value.distrito_nombre,
          coordenadas: denuncia.value?.coordenadas || '',
          fechaTexto: formatearFecha(fila.value.created_at),
        });
        if (r.aviso) anunciar('ok', r.aviso);
      } catch (e) {
        console.error('[detalle-denuncia] Falló compartir:', e);
        anunciar('error', 'No se pudo preparar la imagen para compartir.');
      } finally {
        compartiendo.value = false;
      }
    }

    const formatearFecha = (fecha) => {
      if (!fecha) return 'No disponible';
      return new Date(fecha).toLocaleDateString('es-SV', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    };

    const volver = () => irA('mis-denuncias');

    onMounted(async () => {
      const id = localStorage.getItem('denuncia_detalle_id');
      if (!id) { volver(); return; }
      denunciaId.value = id;

      if (!tiposDenuncia.value?.length) cargarTipos();
      // Puede llegarse aquí directamente tras recargar la aplicación, con la
      // lista todavía vacía.
      if (!filas.value.length) await cargarMisDenuncias();

      fila.value = denunciaPorId(id);
      // Ya NO se rebota en silencio: si no está, se dice. Rebotar sin explicar
      // es lo que hacía parecer que la pantalla estaba rota.
      if (!fila.value && !errorDenuncias.value) {
        errorDenuncias.value = 'No encontramos esa denuncia entre las tuyas.';
      }
    });

    return {
      denuncia, categoria, flujoEstados, estadoActual,
      indiceEstadoActual, porcentajeProgreso,
      cargando, errorDenuncias, volver,
      formatearFecha, irA,
      getColorClass, getColorClassEstado,
      sigueEstaDenuncia, puedeAvisar, compartiendo, avisoAccion,
      alternarNotificaciones, compartir,
    };
  },
};
