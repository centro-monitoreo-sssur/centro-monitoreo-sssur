// ============================================================
// COMPONENTE: Roles y Permisos
// Definición de roles del sistema y matriz de acceso por módulos.
// ============================================================
import { ref } from '../../core/vue.js';

export default {
  name: 'vista-roles',
  setup() {
    const roles = ref([
      { id: 'superadmin', nombre: 'SuperAdministrador', descripcion: 'Acceso total al sistema y configuración', usuarios: 2, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
      { id: 'admin', nombre: 'Administrador de Área', descripcion: 'Gestión completa de su dependencia', usuarios: 5, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
      { id: 'operador', nombre: 'Operador de Monitoreo', descripcion: 'Atención de denuncias y creación de obras', usuarios: 12, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
      { id: 'lector', nombre: 'Solo Lectura', descripcion: 'Consulta de reportes y mapas, sin edición', usuarios: 8, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
    ]);

    const modulos = [
      { id: 'dashboard', label: 'Dashboard y Métricas' },
      { id: 'mapa', label: 'Mapa en Vivo y Cartograma' },
      { id: 'denuncias', label: 'Gestión de Denuncias' },
      { id: 'intervenciones', label: 'Intervenciones en Campo' },
      { id: 'reportes', label: 'Generación de Reportes' },
      { id: 'config', label: 'Configuración del Sistema' },
    ];

    const rolSeleccionado = ref(roles.value[0]);

    function seleccionarRol(rol) {
      rolSeleccionado.value = rol;
    }

    // Matriz de permisos simulada (solo visual)
    function tienePermiso(rolId, moduloId, accion) {
      if (rolId === 'superadmin') return true;
      if (rolId === 'lector' && accion !== 'leer') return false;
      if (rolId === 'lector' && accion === 'leer' && moduloId !== 'config') return true;
      
      if (rolId === 'admin') {
        if (moduloId === 'config') return accion === 'leer';
        return true;
      }
      
      if (rolId === 'operador') {
        if (moduloId === 'config' || moduloId === 'reportes') return false;
        if (accion === 'borrar') return false;
        return true;
      }
      
      return false;
    }

    return {
      roles, modulos, rolSeleccionado, seleccionarRol, tienePermiso
    };
  }
};
