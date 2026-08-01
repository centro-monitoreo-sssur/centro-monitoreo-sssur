// ============================================================================
// VISTA: Mis Intervenciones (PWA de empleado)
//
// Antes esta vista NO consultaba la base. Leía `localStorage.intervenciones_empleado`
// y, si no había nada, mostraba dos registros inventados —"Reparar alumbrado
// público" y "Limpiar acumulación de basura"— con fechas generadas al vuelo.
// Un empleado podía pasar la jornada creyendo que tenía trabajo asignado que
// no existía en ningún sistema.
//
// Ahora lee de `stores/mis-casos.js`, que consulta `casos` filtrando por lo
// asignado al usuario y lo que él mismo reportó. Sin casos, la lista se ve
// vacía: es la única respuesta honesta.
// ============================================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useMisCasos } from '../../stores/mis-casos.js';
import { almacen } from '../../core/almacen.js';
import { colorEstado, etiquetaEstado } from '../../utils/badge.js';
import { colorPrioridad, formatearFecha } from '../../utils/presentacion-campo.js';

const CLAVE_TAMANO = 'tamano_pagina_intervenciones';

export default {
  setup() {
    const { irA } = useNavegacion();
    const {
      casosPorPrioridad, estadisticas, cargando, errorCarga,
      cargarMisCasos, seleccionarCaso,
    } = useMisCasos();

    // ── Paginación ──────────────────────────────────────────────────────
    const paginaActual = ref(1);
    const tamanoPagina = ref(parseInt(almacen.leerTexto(CLAVE_TAMANO, '10'), 10) || 10);

    // El trabajo pendiente va ordenado por urgencia y antigüedad, no por fecha
    // de creación. En una pantalla de campo el orden ES la instrucción: lo
    // primero de la lista es lo que hay que atender primero.
    const intervenciones = casosPorPrioridad;

    const totalPaginas = computed(() =>
      Math.max(1, Math.ceil(intervenciones.value.length / tamanoPagina.value))
    );

    const intervencionesPaginadas = computed(() => {
      const inicio = (paginaActual.value - 1) * tamanoPagina.value;
      return intervenciones.value.slice(inicio, inicio + tamanoPagina.value);
    });

    const irAPagina = (pagina) => {
      if (pagina < 1 || pagina > totalPaginas.value) return;
      paginaActual.value = pagina;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const paginaAnterior  = () => irAPagina(paginaActual.value - 1);
    const paginaSiguiente = () => irAPagina(paginaActual.value + 1);

    const cambiarTamanoPagina = (nuevoTamano) => {
      tamanoPagina.value = nuevoTamano;
      almacen.escribirTexto(CLAVE_TAMANO, nuevoTamano);
      paginaActual.value = 1;
    };

    // ── Navegación al detalle ───────────────────────────────────────────
    // El caso se pasa por el store, no serializado en localStorage. Aquello
    // guardaba una COPIA que envejecía: si alguien cambiaba el caso desde el
    // Centro de Monitoreo, el empleado seguía viendo —y cerrando— la versión
    // que tenía cuando pulsó la fila.
    const verDetalle = (intervencion) => {
      seleccionarCaso(intervencion);
      irA('detalle-intervencion');
    };

    onMounted(cargarMisCasos);

    return {
      intervenciones,
      intervencionesPaginadas,
      estadisticas,
      cargando,
      errorCarga,
      recargar: cargarMisCasos,
      irA,
      verDetalle,
      // Nombres que ya usa la plantilla, y ambos reciben el CÓDIGO REAL de
      // estado. Se muestra "En obra" o "En revisión", no una simplificación:
      // es el mismo vocabulario que usa el Centro de Monitoreo, y que el
      // supervisor y el empleado digan lo mismo por radio importa más que
      // ahorrarle dos palabras. La agrupación en tres valores (`situacion`)
      // queda para filtros y contadores, donde sí aporta.
      getPrioridadColor: colorPrioridad,
      getEstadoColor: colorEstado,
      getEstadoLabel: etiquetaEstado,
      formatDate: formatearFecha,
      paginaActual,
      totalPaginas,
      tamanoPagina,
      irAPagina,
      paginaAnterior,
      paginaSiguiente,
      cambiarTamanoPagina,
    };
  },
};
