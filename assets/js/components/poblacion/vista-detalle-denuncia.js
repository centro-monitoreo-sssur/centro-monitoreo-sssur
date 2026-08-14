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
    };
  },
};
