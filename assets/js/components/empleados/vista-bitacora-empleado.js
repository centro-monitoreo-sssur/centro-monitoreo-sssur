// Vista: Bitácora del Empleado
// Historial de todas las intervenciones en las que el empleado fue asignado.
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { irA } = useNavegacion();

    const intervenciones = ref([]);
    const filtroEstado = ref('todas');
    const busqueda = ref('');

    // DEMO: Historial de intervenciones del empleado — reemplazar con API real
    const historialDemo = [
      {
        id: 101,
        titulo: 'Reparar alumbrado público',
        descripcion: 'Poste dañado en calle principal, sector 3.',
        prioridad: 'alta',
        estado: 'completada',
        ubicacion: 'Calle Principal #123, Panchimalco',
        fecha: new Date(Date.now() - 2 * 86400000).toISOString(),
        fechaCierre: new Date(Date.now() - 1.5 * 86400000).toISOString(),
        resolucion: 'Se reemplazó el poste y se restableció el cableado.'
      },
      {
        id: 102,
        titulo: 'Limpiar acumulación de basura',
        descripcion: 'Basura en parque central, reporte ciudadano.',
        prioridad: 'media',
        estado: 'completada',
        ubicacion: 'Parque Central, San Marcos',
        fecha: new Date(Date.now() - 5 * 86400000).toISOString(),
        fechaCierre: new Date(Date.now() - 4 * 86400000).toISOString(),
        resolucion: 'Se recolectaron 8 toneladas de desechos sólidos.'
      },
      {
        id: 103,
        titulo: 'Reparación de bache en vía principal',
        descripcion: 'Bache peligroso reportado por varios vecinos.',
        prioridad: 'alta',
        estado: 'en_proceso',
        ubicacion: 'Av. Independencia, Santo Tomás',
        fecha: new Date(Date.now() - 86400000).toISOString(),
        fechaCierre: null,
        resolucion: null
      },
      {
        id: 104,
        titulo: 'Poda de árbol en zona escolar',
        descripcion: 'Árbol con ramas peligrosas sobre la escuela.',
        prioridad: 'baja',
        estado: 'completada',
        ubicacion: 'Escuela Nacional, Rosario de Mora',
        fecha: new Date(Date.now() - 10 * 86400000).toISOString(),
        fechaCierre: new Date(Date.now() - 9 * 86400000).toISOString(),
        resolucion: 'Se podaron las ramas y se limpió el área.'
      },
      {
        id: 105,
        titulo: 'Tapón en tubería de aguas lluvias',
        descripcion: 'Desbordamiento en zona habitacional.',
        prioridad: 'alta',
        estado: 'pendiente',
        ubicacion: 'Col. Las Flores, Santiago Texacuangos',
        fecha: new Date().toISOString(),
        fechaCierre: null,
        resolucion: null
      }
    ];

    onMounted(() => {
      const guardadas = localStorage.getItem('intervenciones_empleado');
      if (guardadas) {
        const parseadas = JSON.parse(guardadas);
        // Fusionar demo con las reales guardadas (evitar duplicados por id)
        const idsReales = new Set(parseadas.map(i => i.id));
        const extras = historialDemo.filter(d => !idsReales.has(d.id));
        intervenciones.value = [...parseadas, ...extras];
      } else {
        intervenciones.value = historialDemo;
      }
    });

    const intervencionesFiltradas = computed(() => {
      let lista = intervenciones.value;
      if (filtroEstado.value !== 'todas') {
        lista = lista.filter(i => i.estado === filtroEstado.value);
      }
      if (busqueda.value.trim()) {
        const q = busqueda.value.toLowerCase();
        lista = lista.filter(i =>
          i.titulo.toLowerCase().includes(q) ||
          i.ubicacion.toLowerCase().includes(q)
        );
      }
      // Más recientes primero
      return [...lista].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    });

    const estadisticas = computed(() => ({
      total: intervenciones.value.length,
      completadas: intervenciones.value.filter(i => i.estado === 'completada').length,
      enProceso: intervenciones.value.filter(i => i.estado === 'en_proceso').length,
      pendientes: intervenciones.value.filter(i => i.estado === 'pendiente').length,
    }));

    const getPrioridadColor = (p) => ({ alta: 'bg-red-500', media: 'bg-amber-500', baja: 'bg-green-500' }[p] || 'bg-gray-400');
    const getPrioridadBg = (p) => ({ alta: 'bg-red-50 text-red-700 border-red-100', media: 'bg-amber-50 text-amber-700 border-amber-100', baja: 'bg-green-50 text-green-700 border-green-100' }[p] || 'bg-gray-50 text-gray-700 border-gray-100');
    const getEstadoColor = (e) => ({ pendiente: 'bg-red-100 text-red-800', en_proceso: 'bg-blue-100 text-blue-800', completada: 'bg-emerald-100 text-emerald-800' }[e] || 'bg-gray-100 text-gray-800');
    const getEstadoLabel = (e) => ({ pendiente: 'Pendiente', en_proceso: 'En Proceso', completada: 'Completada' }[e] || e);
    const getEstadoIcon = (e) => ({ pendiente: 'fa-clock', en_proceso: 'fa-spinner', completada: 'fa-check-circle' }[e] || 'fa-circle');

    const formatDate = (fecha) => {
      if (!fecha) return '—';
      return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const verDetalle = (intervencion) => {
      localStorage.setItem('intervencion_activa', JSON.stringify(intervencion));
      irA('detalle-intervencion');
    };

    return {
      intervenciones,
      intervencionesFiltradas,
      estadisticas,
      filtroEstado,
      busqueda,
      getPrioridadColor,
      getPrioridadBg,
      getEstadoColor,
      getEstadoLabel,
      getEstadoIcon,
      formatDate,
      verDetalle,
      irA
    };
  }
};
