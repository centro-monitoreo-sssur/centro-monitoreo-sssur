// ============================================================
// COMPONENTE: Gestión de Denuncias
// Listado completo de incidencias en tabla con paginación, filtros
// y panel de detalles.
// ============================================================
import { ref, computed } from '../../core/vue.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';

export default {
  name: 'vista-denuncias',
  setup() {
    const { denuncias } = useDenuncias();
    const { tiposDenuncia } = useCatalogos();

    // Filtros
    const busqueda = ref('');
    const filtroEstado = ref('todos');
    const filtroCategoria = ref('todas');

    const denunciasFiltradas = computed(() => {
      let lista = denuncias.value || [];
      
      // Filtro de estado
      if (filtroEstado.value !== 'todos') {
        lista = lista.filter(d => d.estado === filtroEstado.value);
      }
      
      // Filtro de categoría
      if (filtroCategoria.value !== 'todas') {
        lista = lista.filter(d => d.tipo_id === filtroCategoria.value);
      }

      // Búsqueda de texto (dirección, descripción, id)
      if (busqueda.value.trim()) {
        const q = busqueda.value.toLowerCase();
        lista = lista.filter(d => 
          (d.direccion && d.direccion.toLowerCase().includes(q)) ||
          (d.descripcion && d.descripcion.toLowerCase().includes(q)) ||
          (d.id.toString().includes(q))
        );
      }

      // Ordenar por fecha descendente
      return lista.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    });

    // Paginación
    const paginaActual = ref(1);
    const itemsPorPagina = ref(parseInt(localStorage.getItem('tamano_pagina_denuncias_admin') || '10'));
    
    const paginasTotales = computed(() => Math.ceil(denunciasFiltradas.value.length / itemsPorPagina.value));
    
    const paginaDenuncias = computed(() => {
      const inicio = (paginaActual.value - 1) * itemsPorPagina.value;
      return denunciasFiltradas.value.slice(inicio, inicio + itemsPorPagina.value);
    });

    function cambiarPagina(p) {
      if (p >= 1 && p <= paginasTotales.value) {
        paginaActual.value = p;
      }
    }
    
    function cambiarTamanoPagina(nuevoTamano) {
      itemsPorPagina.value = nuevoTamano;
      localStorage.setItem('tamano_pagina_denuncias_admin', nuevoTamano);
      paginaActual.value = 1; // Resetear a primera página
    }

    // Helpers
    function getCategoria(tipo_id) {
      const cat = (tiposDenuncia.value || []).find(t => t.id === tipo_id);
      return cat || { nombre: 'Desconocido', color_hex: '#gray-500', icono: 'fa-question' };
    }

    function badgeEstado(estado) {
      const badges = {
        'pendiente': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
        'en_obra': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
        'resuelta': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
        'rechazada': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
      };
      return badges[estado] || badges['pendiente'];
    }

    function etiquetaEstado(estado) {
      const labels = {
        'pendiente': 'Pendiente',
        'en_obra': 'En curso',
        'resuelta': 'Resuelta',
        'rechazada': 'Rechazada'
      };
      return labels[estado] || 'Desconocido';
    }

    function formatearFecha(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    }

    // Modal de Detalles
    const denunciaSeleccionada = ref(null);
    function abrirDetalle(denuncia) {
      denunciaSeleccionada.value = denuncia;
    }
    function cerrarDetalle() {
      denunciaSeleccionada.value = null;
    }

    return {
      busqueda, filtroEstado, filtroCategoria,
      tiposDenuncia, denunciasFiltradas,
      paginaActual, paginasTotales, paginaDenuncias, cambiarPagina,
      itemsPorPagina, cambiarTamanoPagina,
      getCategoria, badgeEstado, etiquetaEstado, formatearFecha,
      denunciaSeleccionada, abrirDetalle, cerrarDetalle
    };
  }
};
