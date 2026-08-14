// Vista: Mis Denuncias (Población)
//
// Leía un arreglo de `localStorage` que ya no escribe nadie: desde que el envío
// pasa por el RPC, la lista salía siempre vacía. Ahora viene de
// `v_mis_denuncias_ciudadano`, donde la RLS decide las filas —solo las suyas— y
// la vista decide las columnas —fuera notas internas y el empleado asignado—.
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useDenunciasCiudadano } from '../../stores/denuncias-ciudadano.js';
import { getColorClass } from '../../utils/categorias-denuncias.js';
import { getEstadoPorId, getColorClassEstado } from '../../utils/estados-denuncias.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const {
      denuncias: filas, cargando, errorDenuncias,
      cargarMisDenuncias,
    } = useDenunciasCiudadano();

    /* Se traduce a la forma que ya espera la plantilla en vez de reescribir el
       marcado: `categoriaId`, `estado`, `fecha`, `coordenadas`. Es una capa
       fina y deja el cambio acotado a este archivo. */
    const denuncias = computed(() => (filas.value || []).map((d) => ({
      id: d.id,
      correlativo: d.correlativo,
      categoriaId: d.categoria_id,
      categoriaNombre: d.categoria_nombre,
      categoriaIcono: d.categoria_icono,
      categoriaColor: d.categoria_color,
      descripcion: d.descripcion,
      estado: d.estado_codigo,
      fecha: d.created_at,
      // La plantilla la pinta como texto; la vista las expone ya separadas.
      coordenadas: d.lat != null && d.lng != null
        ? `${Number(d.lat).toFixed(6)}, ${Number(d.lng).toFixed(6)}`
        : '',
      resolucion: d.resolucion,
      cerrada: Boolean(d.fecha_cierre),
    })));

    const paginaActual = ref(1);
    const tamanoPagina = ref(parseInt(localStorage.getItem('tamano_pagina_denuncias') || '10'));
    const totalPaginas = computed(() =>
      Math.max(1, Math.ceil(denuncias.value.length / tamanoPagina.value))
    );

    const denunciasPaginadas = computed(() => {
      const inicio = (paginaActual.value - 1) * tamanoPagina.value;
      return denuncias.value.slice(inicio, inicio + tamanoPagina.value);
    });

    /* Abierta o cerrada, y no una lista de códigos de estado.
       Cada categoría define su propio flujo en `estados_flujo`, así que no hay
       un código único que signifique «pendiente»: contar por `estado_codigo`
       daba cero en cuanto la categoría usaba nombres propios. `fecha_cierre` es
       el único indicador que vale para todas. */
    const estadisticas = computed(() => {
      const total = denuncias.value.length;
      const resueltas = denuncias.value.filter((d) => d.cerrada).length;
      return { total, pendientes: total - resueltas, resueltas };
    });

    const verDetalles = (id) => {
      localStorage.setItem('denuncia_detalle_id', id);
      irA('detalle-denuncia');
    };

    const irAPagina = (pagina) => {
      if (pagina >= 1 && pagina <= totalPaginas.value) {
        paginaActual.value = pagina;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    const paginaAnterior = () => irAPagina(paginaActual.value - 1);
    const paginaSiguiente = () => irAPagina(paginaActual.value + 1);

    const cambiarTamanoPagina = (nuevoTamano) => {
      tamanoPagina.value = nuevoTamano;
      localStorage.setItem('tamano_pagina_denuncias', nuevoTamano);
      paginaActual.value = 1;
    };

    /* La categoría viaja YA RESUELTA en la vista, así que no hay que buscarla
       en ningún catálogo. Antes se buscaba en el arreglo de 27 escritas a mano,
       cuyos ids no tenían relación con los reales: la tarjeta salía sin icono
       y sin nombre en cuanto la denuncia era de verdad. */
    const getCategoria = (id) => {
      const d = denuncias.value.find((x) => x.categoriaId === id);
      return d ? { id, nombre: d.categoriaNombre, icono: d.categoriaIcono, color: d.categoriaColor } : null;
    };

    const getEstadoInfo = (categoriaId, estadoId) => getEstadoPorId(parseInt(categoriaId), estadoId);

    const formatDate = (fecha) => new Date(fecha).toLocaleDateString('es-SV', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    onMounted(cargarMisDenuncias);

    return {
      denuncias, denunciasPaginadas, estadisticas,
      // Estado de la carga: sin esto, «no tienes denuncias» y «todavía las
      // estoy pidiendo» se ven igual —una lista vacía— y ninguno se explica.
      cargando, errorDenuncias, recargar: cargarMisDenuncias,
      irA, verDetalles,
      getCategoria, getEstadoInfo, formatDate,
      getColorClass, getColorClassEstado,
      paginaActual, totalPaginas, tamanoPagina,
      irAPagina, paginaAnterior, paginaSiguiente, cambiarTamanoPagina,
    };
  },
};
