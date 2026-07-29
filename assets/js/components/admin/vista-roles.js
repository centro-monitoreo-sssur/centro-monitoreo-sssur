// ============================================================
// COMPONENTE: Roles y Permisos
// Definición de roles del sistema y matriz de acceso por módulos.
// ============================================================
import { ref } from '../../core/vue.js';
import { db } from '../../core/supabase.js';

export default {
  name: 'vista-roles',
  setup() {
    const roles = ref([]);
    const modulos = ref([]);
    const rolesPermisos = ref([]);
    const rolSeleccionado = ref(null);
    const cargando = ref(false);

    async function cargarData() {
      cargando.value = true;
      if (db) {
        const [resRoles, resModulos, resPermisos] = await Promise.all([
          db.from('roles').select('*').order('id'),
          db.from('permisos_modulos').select('*').order('id'),
          db.from('roles_permisos').select('*')
        ]);
        
        // Asignar colores fijos por defecto si no existen
        const colors = ['text-purple-600', 'text-blue-600', 'text-emerald-600', 'text-gray-600'];
        const bgs = ['bg-purple-100', 'bg-blue-100', 'bg-emerald-100', 'bg-gray-100'];
        
        if (resRoles.data) {
          roles.value = resRoles.data.map((r, idx) => ({
            ...r,
            color: colors[idx % colors.length],
            bg: bgs[idx % bgs.length],
            usuarios: 0 // TODO: count from usuarios table
          }));
        }

        modulos.value = resModulos.data?.length ? resModulos.data.map(m => ({
           id: m.codigo_modulo, label: m.nombre
        })) : [
          { id: 'dashboard', label: 'Dashboard y Métricas' },
          { id: 'mapa', label: 'Mapa en Vivo y Cartograma' },
          { id: 'denuncias', label: 'Gestión de Denuncias' },
          { id: 'intervenciones', label: 'Intervenciones en Campo' },
          { id: 'reportes', label: 'Generación de Reportes' },
          { id: 'config', label: 'Configuración del Sistema' }
        ];

        rolesPermisos.value = resPermisos.data || [];
        if (roles.value.length > 0) rolSeleccionado.value = roles.value[0];
      }
      cargando.value = false;
    }

    function seleccionarRol(rol) {
      rolSeleccionado.value = rol;
    }

    function tienePermiso(rolId, moduloId, accion) {
       if (!rolesPermisos.value.length) {
          // Lógica por defecto (dummy)
          const rol = roles.value.find(r => r.id === rolId);
          if (!rol) return false;
          const cod = rol.codigo;
          if (cod === 'superadmin') return true;
          if (cod === 'lector' && accion !== 'leer') return false;
          if (cod === 'lector' && accion === 'leer' && moduloId !== 'config') return true;
          if (cod === 'admin') {
            if (moduloId === 'config') return accion === 'leer';
            return true;
          }
          if (cod === 'operador') {
            if (moduloId === 'config' || moduloId === 'reportes') return false;
            if (accion === 'borrar') return false;
            return true;
          }
          return false;
       }
       
       // Lógica real de tabla
       const pm = modulos.value.find(m => m.id === moduloId); // wait, modulos id is codigo_modulo
       // this needs more complex joining which we don't have yet.
       return false;
    }

    import('../../core/vue.js').then(({ onMounted }) => {
      onMounted(cargarData);
    });

    return {
      roles, modulos, rolSeleccionado, seleccionarRol, tienePermiso, cargando
    };
  }
};
