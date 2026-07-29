// ============================================================
// COMPONENTE: Roles y Permisos
// Definición de roles del sistema y matriz de acceso por módulos.
// ============================================================
import { ref, onMounted } from '../../core/vue.js';
import { db } from '../../core/supabase.js';

export default {
  name: 'vista-roles',
  setup() {
    const roles = ref([]);
    const modulos = ref([]);
    const rolesPermisos = ref([]);
    const rolSeleccionado = ref(null);
    const cargando = ref(false);

    const MODULOS_DEFAULT = [
      { id: 'dashboard', label: 'Dashboard y Métricas' },
      { id: 'mapa', label: 'Mapa en Vivo y Cartograma' },
      { id: 'denuncias', label: 'Gestión de Denuncias' },
      { id: 'intervenciones', label: 'Intervenciones en Campo' },
      { id: 'reportes', label: 'Generación de Reportes' },
      { id: 'config', label: 'Configuración del Sistema' }
    ];

    const ROLES_DEFAULT = [
      { id: 1, codigo: 'superadmin', nombre: 'Superadministrador', descripcion: 'Acceso total al sistema', color: 'text-purple-600', bg: 'bg-purple-100', usuarios: 0 },
      { id: 2, codigo: 'admin', nombre: 'Administrador', descripcion: 'Gestión operativa del sistema', color: 'text-blue-600', bg: 'bg-blue-100', usuarios: 0 },
      { id: 3, codigo: 'operador', nombre: 'Operador de Campo', descripcion: 'Gestión de denuncias e intervenciones', color: 'text-emerald-600', bg: 'bg-emerald-100', usuarios: 0 },
      { id: 4, codigo: 'lector', nombre: 'Lector', descripcion: 'Solo lectura de reportes', color: 'text-gray-600', bg: 'bg-gray-100', usuarios: 0 },
    ];

    async function cargarData() {
      cargando.value = true;
      const colors = ['text-purple-600', 'text-blue-600', 'text-emerald-600', 'text-gray-600'];
      const bgs = ['bg-purple-100', 'bg-blue-100', 'bg-emerald-100', 'bg-gray-100'];

      if (db) {
        const [resRoles, resModulos, resPermisos] = await Promise.all([
          db.from('roles').select('*').order('id'),
          db.from('permisos_modulos').select('*').order('id'),
          db.from('roles_permisos').select('*')
        ]);

        roles.value = (resRoles.data || ROLES_DEFAULT).map((r, idx) => ({
          ...r,
          color: colors[idx % colors.length],
          bg: bgs[idx % bgs.length],
          usuarios: 0
        }));

        modulos.value = resModulos.data?.length
          ? resModulos.data.map(m => ({ id: m.codigo_modulo, label: m.nombre }))
          : MODULOS_DEFAULT;

        rolesPermisos.value = resPermisos.data || [];
      } else {
        // Fallback demo sin DB
        roles.value = ROLES_DEFAULT;
        modulos.value = MODULOS_DEFAULT;
      }

      if (roles.value.length > 0) rolSeleccionado.value = roles.value[0];
      cargando.value = false;
    }

    function seleccionarRol(rol) {
      rolSeleccionado.value = rol;
    }

    function tienePermiso(rolId, moduloId, accion) {
      if (!rolesPermisos.value.length) {
        const rol = roles.value.find(r => r.id === rolId);
        if (!rol) return false;
        const cod = rol.codigo;
        if (cod === 'superadmin') return true;
        if (cod === 'lector' && accion !== 'leer') return false;
        if (cod === 'lector' && accion === 'leer' && moduloId !== 'config') return true;
        if (cod === 'admin') return moduloId === 'config' ? accion === 'leer' : true;
        if (cod === 'operador') {
          if (moduloId === 'config' || moduloId === 'reportes') return false;
          if (accion === 'borrar') return false;
          return true;
        }
        return false;
      }
      // Con datos reales de roles_permisos
      const permiso = rolesPermisos.value.find(p => p.rol_id === rolId && p.modulo_id === moduloId);
      if (!permiso) return false;
      return !!permiso[accion];
    }

    // onMounted en contexto síncrono de setup() — patrón correcto
    onMounted(cargarData);

    return {
      roles, modulos, rolSeleccionado, seleccionarRol, tienePermiso, cargando
    };
  }
};
