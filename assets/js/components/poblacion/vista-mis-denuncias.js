// Vista: Mis Denuncias (Población)
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { categoriasDenuncias, getColorClass } from '../../utils/categorias-denuncias.js';
import { getEstadoPorId, getColorClassEstado } from '../../utils/estados-denuncias.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    
    // Estado de denuncias
    const denuncias = ref([]);
    
    // Estado de paginación
    const paginaActual = ref(1);
    const tamanoPagina = ref(parseInt(localStorage.getItem('tamano_pagina_denuncias') || '10'));
    const totalPaginas = computed(() => Math.ceil(denuncias.value.length / tamanoPagina.value));
    
    // Denuncias paginadas
    const denunciasPaginadas = computed(() => {
      const inicio = (paginaActual.value - 1) * tamanoPagina.value;
      const fin = inicio + tamanoPagina.value;
      return denuncias.value.slice(inicio, fin);
    });
    
    // Estadísticas
    const estadisticas = computed(() => {
      const total = denuncias.value.length;
      const pendientes = denuncias.value.filter(d => d.estado === 'pendiente').length;
      const resueltas = denuncias.value.filter(d => d.estado === 'resuelto').length;
      
      return { total, pendientes, resueltas };
    });
    
    // Cargar denuncias desde localStorage (DEMO)
    const cargarDenuncias = () => {
      const denunciasGuardadas = localStorage.getItem('denuncias_poblacion');
      if (denunciasGuardadas) {
        denuncias.value = JSON.parse(denunciasGuardadas);
      }
    };
    
    // Ver detalles de una denuncia
    const verDetalles = (id) => {
      localStorage.setItem('denuncia_detalle_id', id);
      irA('detalle-denuncia');
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
      localStorage.setItem('tamano_pagina_denuncias', nuevoTamano);
      paginaActual.value = 1; // Resetear a primera página
    };
    
    // Helpers para UI usando categorías reales
    const getCategoria = (categoriaId) => {
      return categoriasDenuncias.find(cat => cat.id === parseInt(categoriaId));
    };
    
    const getEstadoInfo = (categoriaId, estadoId) => {
      return getEstadoPorId(parseInt(categoriaId), estadoId);
    };
    
    const formatDate = (fecha) => {
      const date = new Date(fecha);
      return date.toLocaleDateString('es-SV', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };
    
    onMounted(() => {
      cargarDenuncias();
    });
    
    return {
      denuncias,
      denunciasPaginadas,
      estadisticas,
      irA,
      verDetalles,
      getCategoria,
      getEstadoInfo,
      formatDate,
      getColorClass,
      getColorClassEstado,
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
