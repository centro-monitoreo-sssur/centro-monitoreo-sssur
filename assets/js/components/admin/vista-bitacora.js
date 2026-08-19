// ============================================================
// COMPONENTE: Bitácora de Auditoría
// Registro inmutable de eventos del sistema (lectura, escritura, borrado).
// ============================================================
import { ref, computed, onMounted, watch } from '../../core/vue.js';
import { useAuditoria } from '../../stores/auditoria.js';

export default {
  name: 'vista-bitacora',
  setup() {
    const { logs, cargarLogs, cargarMasLogs, cargando, cargandoMas,
            totalLogs, hayMasLogs, filtroDesde, filtroHasta } = useAuditoria();

    onMounted(() => {
      cargarLogs();
    });

    // El rango recarga desde el servidor: es el corte que decide qué existe.
    // Búsqueda y acción filtran EN LO CARGADO, y la pantalla lo dice.
    watch([filtroDesde, filtroHasta], () => { cargarLogs(); });

    const busqueda = ref('');
    const filtroAccion = ref('todas');

    const COLUMNAS_TABLA = [
      { clave: 'id',      titulo: 'ID',           ordenable: true,  ancho: '80px' },
      { clave: 'fecha',   titulo: 'Fecha y hora', ordenable: true,  ancho: '170px' },
      { clave: 'usuario', titulo: 'Usuario',      ordenable: true,  ancho: '180px' },
      { clave: 'accion',  titulo: 'Acción',       ordenable: true,  ancho: '120px' },
      { clave: 'modulo',  titulo: 'Módulo',       ordenable: true,  ancho: '130px' },
      { clave: 'detalle', titulo: 'Detalle',      ordenable: false },
      { clave: 'ip',      titulo: 'Dir. IP',      ordenable: false, ancho: '130px' },
    ];

    const accionesUnicas = ['LOGIN', 'FAILED_LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'SYSTEM'];

    const logsFiltrados = computed(() => {
      let lista = logs.value;
      
      if (filtroAccion.value !== 'todas') {
        lista = lista.filter(l => l.accion === filtroAccion.value);
      }
      
      if (busqueda.value.trim()) {
        const q = busqueda.value.toLowerCase();
        lista = lista.filter(l => 
          l.usuario.toLowerCase().includes(q) || 
          l.detalle.toLowerCase().includes(q) ||
          l.modulo.toLowerCase().includes(q) ||
          l.ip.includes(q)
        );
      }
      
      return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    });

    function getAccionBadge(accion) {
      const styles = {
        'LOGIN': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        'FAILED_LOGIN': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
        'CREATE': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        'UPDATE': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        'DELETE': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-500',
        'SYSTEM': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
      };
      return styles[accion] || 'bg-gray-100 text-gray-600';
    }

    function formatearFecha(isoStr) {
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    return {
      logs, busqueda, filtroAccion, accionesUnicas, logsFiltrados, COLUMNAS_TABLA,
      cargarMasLogs, cargandoMas, totalLogs, hayMasLogs, filtroDesde, filtroHasta,
      getAccionBadge, formatearFecha, cargando
    };
  }
};
