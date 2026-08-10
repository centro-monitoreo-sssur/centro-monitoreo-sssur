// ============================================================
// COMPONENTE: Gestión de Denuncias
// Listado completo de incidencias en tabla con paginación, filtros
// y panel de detalles.
//
// Fase 3: la tabla, el modal y los campos de filtro pasan a las primitivas
// (`ui-tabla`, `ui-modal`, `ui-input`, `ui-select`). La vista se queda con lo
// que es suyo —filtrar, ordenar, paginar y exportar— y deja de repetir markup.
// ============================================================
import { ref, computed, watch } from '../../core/vue.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
// badge.js es la fuente única de estados. Esta vista tenía su propia copia y en
// ella faltaba `en_revision`, así que ese estado se pintaba como "Desconocido".
// `colorEstado` y no `badgeEstado`: la plantilla ya pone su propio tamaño.
import { colorEstado as badgeEstado, etiquetaEstado, estadosPosibles } from '../../utils/badge.js';

const COLUMNAS = [
  { clave: 'id',         titulo: 'ID',            ordenable: true, mono: true, ancho: '90px' },
  { clave: 'created_at', titulo: 'Fecha y hora',  ordenable: true, ancho: '170px' },
  { clave: 'tipo_id',    titulo: 'Categoría',     ordenable: true, ancho: '220px' },
  { clave: 'direccion',  titulo: 'Ubicación',     ordenable: true },
  { clave: 'estado',     titulo: 'Estado',        ordenable: true, ancho: '140px' },
  { clave: 'acciones',   titulo: 'Acciones',      alineacion: 'centro', ancho: '90px' },
];

export default {
  name: 'vista-denuncias',
  setup() {
    const { denuncias, cargandoDenuncias } = useDenuncias();
    const { tiposDenuncia } = useCatalogos();

    // Filtros
    const busqueda = ref('');
    const filtroEstado = ref('todos');
    const filtroCategoria = ref('todas');

    // Orden. Vive aquí y no dentro de `ui-tabla` porque hay que ordenar el
    // conjunto filtrado ENTERO antes de cortar la página: si ordenara la tabla,
    // solo reordenaría las 10 filas que ya está mostrando.
    const ordenPor = ref('created_at');
    const ordenAsc = ref(false);

    const seleccion = ref([]);

    // El selector necesita {valor, texto}: `estadosPosibles` son códigos crudos
    // (`en_revision`) y mostrarlos tal cual obligaría al operador a traducir
    // mentalmente el vocabulario interno del sistema.
    const estadosOpciones = computed(() =>
      estadosPosibles.map((codigo) => ({ id: codigo, nombre: etiquetaEstado(codigo) }))
    );

    const denunciasFiltradas = computed(() => {
      let lista = denuncias.value || [];

      if (filtroEstado.value !== 'todos') {
        lista = lista.filter(d => d.estado === filtroEstado.value);
      }

      if (filtroCategoria.value !== 'todas') {
        lista = lista.filter(d => d.tipo_id === filtroCategoria.value);
      }

      if (busqueda.value.trim()) {
        const q = busqueda.value.toLowerCase();
        lista = lista.filter(d =>
          (d.direccion && d.direccion.toLowerCase().includes(q)) ||
          (d.descripcion && d.descripcion.toLowerCase().includes(q)) ||
          (d.id.toString().includes(q))
        );
      }

      const clave = ordenPor.value;
      const signo = ordenAsc.value ? 1 : -1;
      // Copia antes de ordenar: `sort` muta el array, y el que llega aquí es el
      // del store — reordenarlo cambiaría también el orden del mapa y del
      // dashboard sin que nadie lo haya pedido.
      return [...lista].sort((a, b) => {
        if (clave === 'created_at') return (new Date(a.created_at) - new Date(b.created_at)) * signo;
        if (clave === 'tipo_id') {
          return getCategoria(a.tipo_id).nombre
            .localeCompare(getCategoria(b.tipo_id).nombre, 'es') * signo;
        }
        const x = a[clave], y = b[clave];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo;
        return String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true }) * signo;
      });
    });

    // Paginación
    const paginaActual = ref(1);
    const itemsPorPagina = ref(parseInt(localStorage.getItem('tamano_pagina_denuncias_admin') || '10'));

    const paginasTotales = computed(() =>
      Math.max(1, Math.ceil(denunciasFiltradas.value.length / itemsPorPagina.value))
    );

    const paginaDenuncias = computed(() => {
      const inicio = (paginaActual.value - 1) * itemsPorPagina.value;
      return denunciasFiltradas.value.slice(inicio, inicio + itemsPorPagina.value);
    });

    // Al filtrar estando en una página alta, el resultado cabía en menos páginas
    // y la tabla se quedaba vacía sin explicación. Cualquier cambio de filtro
    // vuelve a la primera página.
    watch([busqueda, filtroEstado, filtroCategoria], () => { paginaActual.value = 1; });

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

    function ordenar({ clave, asc }) {
      if (clave === 'acciones') return;
      ordenPor.value = clave;
      ordenAsc.value = asc;
    }

    // Helpers
    function getCategoria(tipo_id) {
      const cat = (tiposDenuncia.value || []).find(t => t.id === tipo_id);
      // '#gray-500' no es un color CSS válido: el `backgroundColor` inline se
      // descartaba y el icono quedaba sin fondo. Se usa el gris real.
      return cat || { nombre: 'Desconocido', color_hex: '#6b7280', icono: 'fa-question' };
    }

    /** Convierte una lista de denuncias en un CSV y lo descarga. */
    function descargarCSV(filas, sufijo) {
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
      enlace.download = `denuncias${sufijo}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);   // sin esto el blob queda retenido en memoria
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
      descargarCSV(filas, '');
    }

    function exportarSeleccion() {
      const ids = new Set(seleccion.value);
      const filas = denunciasFiltradas.value.filter((d) => ids.has(d.id));
      if (!filas.length) return;
      descargarCSV(filas, '_seleccion');
    }

    function limpiarSeleccion() {
      seleccion.value = [];
    }

    function formatearFecha(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    }

    const formatearId = (id) => '#' + String(id).padStart(5, '0');

    // Modal de Detalles
    const denunciaSeleccionada = ref(null);
    function abrirDetalle(denuncia) {
      denunciaSeleccionada.value = denuncia;
    }
    function cerrarDetalle() {
      denunciaSeleccionada.value = null;
    }

    return {
      COLUMNAS, cargandoDenuncias,
      busqueda, filtroEstado, filtroCategoria,
      tiposDenuncia, denunciasFiltradas,
      paginaActual, paginasTotales, paginaDenuncias, cambiarPagina,
      itemsPorPagina, cambiarTamanoPagina, ordenar,
      seleccion, exportarSeleccion, limpiarSeleccion,
      getCategoria, badgeEstado, etiquetaEstado, formatearFecha, formatearId,
      denunciaSeleccionada, abrirDetalle, cerrarDetalle, exportarCSV, estadosOpciones
    };
  }
};
