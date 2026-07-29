// ============================================================
// COMPONENTE: Bitácora de Auditoría
// Registro inmutable de eventos del sistema (lectura, escritura, borrado).
// ============================================================
import { ref, computed } from '../../core/vue.js';

export default {
  name: 'vista-bitacora',
  setup() {
    const logs = ref([
      { id: 10045, fecha: '2026-07-15T14:30:00Z', usuario: 'amartinez@sssur.gob.sv', accion: 'LOGIN', modulo: 'Auth', detalle: 'Inicio de sesión exitoso', ip: '192.168.1.12' },
      { id: 10046, fecha: '2026-07-15T14:35:12Z', usuario: 'cruiz@sssur.gob.sv', accion: 'UPDATE', modulo: 'Denuncias', detalle: 'Cambio de estado Denuncia #00012 a "En curso"', ip: '10.0.0.5' },
      { id: 10047, fecha: '2026-07-15T14:40:05Z', usuario: 'msantos@sssur.gob.sv', accion: 'CREATE', modulo: 'Intervenciones', detalle: 'Nueva orden de trabajo #INV-106 generada', ip: '192.168.1.45' },
      { id: 10048, fecha: '2026-07-15T14:45:30Z', usuario: 'amartinez@sssur.gob.sv', accion: 'UPDATE', modulo: 'Config', detalle: 'Modificación de colores de categorías de denuncia', ip: '192.168.1.12' },
      { id: 10049, fecha: '2026-07-15T15:00:22Z', usuario: 'lgomez@sssur.gob.sv', accion: 'FAILED_LOGIN', modulo: 'Auth', detalle: 'Intento de acceso fallido (contraseña incorrecta)', ip: '192.168.1.50' },
      { id: 10050, fecha: '2026-07-15T15:10:00Z', usuario: 'Sistema', accion: 'SYSTEM', modulo: 'Sincronización', detalle: 'Sincronización periódica con Supabase completada', ip: 'localhost' },
      { id: 10051, fecha: '2026-07-15T15:15:45Z', usuario: 'amartinez@sssur.gob.sv', accion: 'DELETE', modulo: 'Usuarios', detalle: 'Bloqueo de usuario "ecastro@sssur.gob.sv"', ip: '192.168.1.12' },
    ]);

    const busqueda = ref('');
    const filtroAccion = ref('todas');

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
      busqueda, filtroAccion, accionesUnicas, logsFiltrados,
      getAccionBadge, formatearFecha
    };
  }
};
