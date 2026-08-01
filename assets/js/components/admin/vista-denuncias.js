// ============================================================
// COMPONENTE: Gestión de Denuncias
// Listado completo de incidencias en tabla con paginación, filtros
// y panel de detalles.
// ============================================================
import { ref, computed } from '../../core/vue.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
// badge.js es la fuente única de estados. Esta vista tenía su propia copia y en
// ella faltaba `en_revision`, así que ese estado se pintaba como "Desconocido".
// `colorEstado` y no `badgeEstado`: la plantilla ya pone su propio tamaño.
import { colorEstado as badgeEstado, etiquetaEstado, estadosPosibles } from '../../utils/badge.js';

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
      // '#gray-500' no es un color CSS válido: el `backgroundColor` inline se
      // descartaba y el icono quedaba sin fondo. Se usa el gris real.
      return cat || { nombre: 'Desconocido', color_hex: '#6b7280', icono: 'fa-question' };
    }

    // Exporta lo que el usuario está viendo: los filtros aplicados, no la tabla
    // completa. Es la expectativa del botón, y evita volcar casos que la RLS
    // recortó del listado.
    function exportarCSV() {
      const filas = denunciasFiltradas.value;
      if (!filas.length) {
        alert('No hay denuncias que exportar con los filtros actuales.');
        return;
      }

      // Cualquier campo puede traer comas, comillas o saltos de línea escritos
      // por un ciudadano: se entrecomilla siempre y se duplican las comillas.
      const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      const cabeceras = ['ID', 'Correlativo', 'Fecha', 'Categoria', 'Estado', 'Distrito', 'Direccion', 'Descripcion'];
      const cuerpo = filas.map((d) => [
        d.id,
        d.correlativo || '',
        d.created_at ? new Date(d.created_at).toLocaleString('es-SV') : '',
        getCategoria(d.tipo_id).nombre,
        etiquetaEstado(d.estado),
        d.distrito || '',
        d.direccion || '',
        d.descripcion || '',
      ].map(csv).join(','));

      // El BOM es lo que hace que Excel en español abra el archivo en UTF-8;
      // sin él, las tildes de los nombres de distrito salen corruptas.
      const blob = new Blob(['﻿' + [cabeceras.map(csv).join(','), ...cuerpo].join('\r\n')],
                            { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `denuncias_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);   // sin esto el blob queda retenido en memoria
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
      denunciaSeleccionada, abrirDetalle, cerrarDetalle, exportarCSV, estadosPosibles
    };
  }
};
