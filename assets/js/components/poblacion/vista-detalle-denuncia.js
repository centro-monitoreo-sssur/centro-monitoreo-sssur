// Vista: Detalle de Denuncia (Población)
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { categoriasDenuncias, getColorClass } from '../../utils/categorias-denuncias.js';
import { getEstadosPorCategoria, getEstadoPorId, getColorClassEstado } from '../../utils/estados-denuncias.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    
    // Estado de la denuncia (se obtiene del localStorage o se pasa como parámetro)
    const denunciaId = ref(null);
    const denuncia = ref(null);
    
    // Cargar denuncia desde localStorage (DEMO)
    const cargarDenuncia = () => {
      const id = localStorage.getItem('denuncia_detalle_id');
      if (!id) {
        irA('mis-denuncias');
        return;
      }
      
      denunciaId.value = id;
      
      // Obtener denuncias del localStorage
      const denuncias = JSON.parse(localStorage.getItem('denuncias_poblacion') || '[]');
      const denunciaEncontrada = denuncias.find(d => d.id === parseInt(id));
      
      if (denunciaEncontrada) {
        denuncia.value = denunciaEncontrada;
      } else {
        irA('mis-denuncias');
      }
    };
    
    // Obtener categoría de la denuncia
    const categoria = computed(() => {
      if (!denuncia.value) return null;
      return categoriasDenuncias.find(cat => cat.id === parseInt(denuncia.value.categoriaId));
    });
    
    // Obtener flujo de estados de la categoría
    const flujoEstados = computed(() => {
      if (!categoria.value) return [];
      return getEstadosPorCategoria(categoria.value.id).estados;
    });
    
    // Obtener estado actual de la denuncia
    const estadoActual = computed(() => {
      if (!denuncia.value || !categoria.value) return null;
      return getEstadoPorId(categoria.value.id, denuncia.value.estado);
    });
    
    // Calcular índice del estado actual en el flujo
    const indiceEstadoActual = computed(() => {
      if (!estadoActual.value || !flujoEstados.value) return -1;
      return flujoEstados.value.findIndex(e => e.id === estadoActual.value.id);
    });
    
    // Calcular porcentaje de progreso
    const porcentajeProgreso = computed(() => {
      if (indiceEstadoActual.value === -1 || flujoEstados.value.length === 0) return 0;
      return ((indiceEstadoActual.value + 1) / flujoEstados.value.length) * 100;
    });
    
    // Formatear fecha
    const formatearFecha = (fecha) => {
      if (!fecha) return 'No disponible';
      const date = new Date(fecha);
      return date.toLocaleDateString('es-SV', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    
    onMounted(() => {
      cargarDenuncia();
    });
    
    return {
      denuncia,
      categoria,
      flujoEstados,
      estadoActual,
      indiceEstadoActual,
      porcentajeProgreso,
      formatearFecha,
      irA,
      getColorClass,
      getColorClassEstado
    };
  }
};
