// ============================================================================
// VISTA: bitácora del empleado
//
// Historial de los casos en los que ha intervenido: los que tiene asignados y
// los que él mismo levantó en territorio.
//
// Antes, si el empleado no tenía casos, la vista rellenaba con CINCO ejemplos
// inventados —con topónimos reales de los cinco distritos y resoluciones
// verosímiles ("Se recolectaron 8 toneladas de desechos sólidos")—
// indistinguibles de datos auténticos. Ahora, sin casos, la lista se ve vacía.
// ============================================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useMisCasos } from '../../stores/mis-casos.js';
import { colorEstado, etiquetaEstado } from '../../utils/badge.js';
import {
  colorPrioridad, pildoraPrioridad, iconoSituacion, formatearFecha,
} from '../../utils/presentacion-campo.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const {
      casos, estadisticas, cargando, errorCarga, cargarMisCasos, seleccionarCaso,
    } = useMisCasos();

    const intervenciones = casos;
    const filtroEstado = ref('todas');
    const busqueda = ref('');

    // El historial completo lo sirve `stores/mis-casos.js`: los casos asignados
    // al empleado y los que él mismo levantó. Aquí solo se filtra y se ordena.
    //
    // Han desaparecido de este archivo el bloque `historialDemo` y dos tablas de
    // traducción escritas a mano:
    //   · `mapEstado` traducía códigos —recibida, asignada, en_atencion,
    //     cerrada, anulada— que NO existen en el flujo sembrado por la v9, así
    //     que ningún caso casaba y todos caían al valor por defecto.
    //   · `mapPrioridad` daba por "media" la prioridad 2, que en el catálogo
    //     es "Alta", y por "alta" la 1, que es "Crítica".
    // Ambas cosas las resuelve ahora el catálogo real (`stores/catalogos.js`).

    onMounted(cargarMisCasos);

    // El filtro opera sobre `situacion` —la agrupación en tres valores— y no
    // sobre el código real de estado. Los botones de la plantilla ofrecen
    // "Completadas / En Proceso / Pendientes", y con cinco estados reales
    // ninguna de esas tres opciones habría casado con nada.
    const intervencionesFiltradas = computed(() => {
      let lista = intervenciones.value;

      if (filtroEstado.value !== 'todas') {
        lista = lista.filter((i) => i.situacion === filtroEstado.value);
      }

      const q = busqueda.value.trim().toLowerCase();
      if (q) {
        // `?? ''` en cada campo: `ubicacion` viene de `direccion_referencia` y
        // `correlativo` puede ser nulo en un caso recién creado. Sin esto, un
        // `.toLowerCase()` sobre null rompe la lista entera al teclear.
        lista = lista.filter((i) =>
          (i.titulo ?? '').toLowerCase().includes(q) ||
          (i.ubicacion ?? '').toLowerCase().includes(q) ||
          (i.correlativo ?? '').toLowerCase().includes(q) ||
          (i.categoria ?? '').toLowerCase().includes(q)
        );
      }

      // Copia antes de ordenar: `sort` muta, y mutar la fuente dentro de un
      // `computed` dispara su propia dependencia.
      return [...lista].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    });

    const verDetalle = (intervencion) => {
      seleccionarCaso(intervencion);
      irA('detalle-intervencion');
    };

    return {
      intervenciones,
      intervencionesFiltradas,
      estadisticas,
      filtroEstado,
      busqueda,
      cargando,
      errorCarga,
      cargarBitacora: cargarMisCasos,   // nombre que ya usa la plantilla
      verDetalle,
      irA,
      // Estado y prioridad se pintan con el CÓDIGO REAL; el icono usa la
      // situación agrupada, que es lo que la plantilla pasa en ese punto.
      getPrioridadColor: colorPrioridad,
      getPrioridadBg: pildoraPrioridad,
      getEstadoColor: colorEstado,
      getEstadoLabel: etiquetaEstado,
      getEstadoIcon: iconoSituacion,
      formatDate: formatearFecha,
    };
  }
};
