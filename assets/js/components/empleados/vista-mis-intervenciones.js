// Vista: Mis Intervenciones (Empleados)
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    
    // Estado de intervenciones
    const intervenciones = ref([]);
    
    // Estado de paginación
    const paginaActual = ref(1);
    const tamanoPagina = ref(parseInt(localStorage.getItem('tamano_pagina_intervenciones') || '10'));
    const totalPaginas = computed(() => Math.ceil(intervenciones.value.length / tamanoPagina.value));
    
    // Intervenciones paginadas
    const intervencionesPaginadas = computed(() => {
      const inicio = (paginaActual.value - 1) * tamanoPagina.value;
      const fin = inicio + tamanoPagina.value;
      return intervenciones.value.slice(inicio, fin);
    });
    
    // Estadísticas
    const estadisticas = computed(() => {
      const total = intervenciones.value.length;
      const pendientes = intervenciones.value.filter(i => i.estado === 'pendiente').length;
      const completadas = intervenciones.value.filter(i => i.estado === 'completada').length;
      
      return { total, pendientes, completadas };
    });
    
    // Cargar intervenciones desde localStorage (DEMO)
    const cargarIntervenciones = () => {
      const intervencionesGuardadas = localStorage.getItem('intervenciones_empleado');
      if (intervencionesGuardadas) {
        intervenciones.value = JSON.parse(intervencionesGuardadas);
      } else {
        // Datos demo
        intervenciones.value = [
          {
            id: 1,
            titulo: 'Reparar alumbrado público',
            descripcion: 'Poste dañado en calle principal',
            prioridad: 'alta',
            estado: 'pendiente',
            ubicacion: 'Calle Principal #123',
            fecha: new Date().toISOString()
          },
          {
            id: 2,
            titulo: 'Limpiar acumulación de basura',
            descripcion: 'Basura en parque central',
            prioridad: 'media',
            estado: 'en_proceso',
            ubicacion: 'Parque Central',
            fecha: new Date(Date.now() - 86400000).toISOString()
          }
        ];
      }
    };
    
    // Helpers para UI
    const getPrioridadColor = (prioridad) => {
      const colores = {
        alta: 'bg-red-500',
        media: 'bg-yellow-500',
        baja: 'bg-green-500'
      };
      return colores[prioridad] || 'bg-gray-500';
    };
    
    const getEstadoColor = (estado) => {
      const colores = {
        pendiente: 'bg-red-100 text-red-800',
        en_proceso: 'bg-blue-100 text-blue-800',
        completada: 'bg-green-100 text-green-800'
      };
      return colores[estado] || 'bg-gray-100 text-gray-800';
    };
    
    const getEstadoLabel = (estado) => {
      const labels = {
        pendiente: 'Pendiente',
        en_proceso: 'En Proceso',
        completada: 'Completada'
      };
      return labels[estado] || 'Desconocido';
    };
    
    const formatDate = (fecha) => {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };
    
    onMounted(() => {
      cargarIntervenciones();
    });
    
    const verDetalle = (intervencion) => {
      localStorage.setItem('intervencion_activa', JSON.stringify(intervencion));
      irA('detalle-intervencion');
    };
    
    // Navegación de paginación
    const irAPagina = (pagina) => {
      if (pagina >= 1 && pagina <= totalPaginas.value) {
        paginaActual.value = pagina;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    
    const paginaAnterior = () => irAPagina(paginaActual.value - 1);
    const paginaSiguiente = () => irAPagina(paginaActual.value + 1);
    
    // Cambiar tamaño de página
    const cambiarTamanoPagina = (nuevoTamano) => {
      tamanoPagina.value = nuevoTamano;
      localStorage.setItem('tamano_pagina_intervenciones', nuevoTamano);
      paginaActual.value = 1; // Resetear a primera página
    };
    
    return {
      intervenciones,
      intervencionesPaginadas,
      estadisticas,
      irA,
      verDetalle,
      getPrioridadColor,
      getEstadoColor,
      getEstadoLabel,
      formatDate,
      paginaActual,
      totalPaginas,
      tamanoPagina,
      irAPagina,
      paginaAnterior,
      paginaSiguiente,
      cambiarTamanoPagina
    };
  }
};
