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

    // Espejo de public.permisos_modulos (database/migration_v11). El `id` es el
    // `codigo_modulo`, que es lo que evalúan las policies de la base — ojo: el
    // módulo de denuncias se llama 'casos' en la BD aunque se muestre como
    // "Gestión de Denuncias".
    const MODULOS_DEFAULT = [
      { id: 'dashboard', label: 'Dashboard y Métricas' },
      { id: 'mapa', label: 'Mapa en Vivo y Cartograma' },
      { id: 'casos', label: 'Gestión de Denuncias' },
      { id: 'intervenciones', label: 'Intervenciones en Campo' },
      { id: 'reportes', label: 'Generación de Reportes' },
      { id: 'cuadrillas', label: 'Cuadrillas de Campo' },
      { id: 'poblacion', label: 'Ciudadanos Registrados' },
      { id: 'usuarios', label: 'Usuarios y Roles' },
      { id: 'config', label: 'Configuración del Sistema' }
    ];

    // Espejo de public.roles (database/migration_v13). Solo se usa si la BD no
    // responde; los ids reales los asigna Postgres.
    const ROLES_DEFAULT = [
      { id: 1, codigo: 'superadmin', nombre: 'Superadministrador', descripcion: 'Acceso total al sistema', color: 'text-purple-600', bg: 'bg-purple-100', usuarios: 0 },
      { id: 2, codigo: 'admin', nombre: 'Administrador', descripcion: 'Gestión operativa del sistema', color: 'text-blue-600', bg: 'bg-blue-100', usuarios: 0 },
      { id: 3, codigo: 'alcalde', nombre: 'Alcalde', descripcion: 'Consulta total del municipio', color: 'text-amber-600', bg: 'bg-amber-100', usuarios: 0 },
      { id: 4, codigo: 'directivo', nombre: 'Director / Gerente', descripcion: 'Consulta y exportación de la operación', color: 'text-indigo-600', bg: 'bg-indigo-100', usuarios: 0 },
      { id: 5, codigo: 'jefe_area', nombre: 'Jefatura de Área', descripcion: 'Gestiona casos e intervenciones de su área', color: 'text-blue-600', bg: 'bg-blue-100', usuarios: 0 },
      { id: 6, codigo: 'empleado', nombre: 'Personal de Campo', descripcion: 'Ejecuta y actualiza el trabajo asignado', color: 'text-emerald-600', bg: 'bg-emerald-100', usuarios: 0 },
    ];

    // La matriz visual habla de leer / escribir / borrar; roles_permisos guarda
    // bits CRUD explícitos. Este es el puente entre ambos vocabularios.
    const COLUMNAS_POR_ACCION = {
      leer:     ['ver'],
      escribir: ['crear', 'editar'],
      borrar:   ['borrar'],
      exportar: ['exportar'],
    };

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

        // `dbId` conserva el id numérico porque roles_permisos referencia
        // permisos_modulos por id, no por código.
        modulos.value = resModulos.data?.length
          ? resModulos.data.map(m => ({ id: m.codigo_modulo, dbId: m.id, label: m.nombre_modulo }))
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
      const columnas = COLUMNAS_POR_ACCION[accion] || [];
      if (!columnas.length) return false;

      // Sin datos de la BD: aproximación por código de rol, solo para que la
      // pantalla no se vea vacía en modo demo.
      if (!rolesPermisos.value.length) {
        const cod = roles.value.find(r => r.id === rolId)?.codigo;
        if (!cod) return false;
        if (cod === 'superadmin') return true;
        if (cod === 'admin') return moduloId === 'config' ? accion === 'leer' : true;
        if (cod === 'alcalde')   return accion === 'leer' || (accion === 'exportar' && moduloId !== 'poblacion');
        if (cod === 'directivo') return (accion === 'leer' || accion === 'exportar')
          && !['poblacion', 'usuarios', 'config'].includes(moduloId);
        if (cod === 'jefe_area') {
          if (['poblacion', 'usuarios', 'config'].includes(moduloId)) return false;
          return accion !== 'borrar';
        }
        if (cod === 'empleado') {
          return ['dashboard', 'mapa', 'casos', 'intervenciones', 'cuadrillas'].includes(moduloId)
            && accion !== 'borrar' && accion !== 'exportar';
        }
        return false;
      }

      // Con datos reales: roles_permisos.permiso_modulo_id apunta al id
      // numérico de permisos_modulos, no al código del módulo.
      const dbId = modulos.value.find(m => m.id === moduloId)?.dbId;
      if (!dbId) return false;

      const permiso = rolesPermisos.value.find(
        (p) => p.rol_id === rolId && p.permiso_modulo_id === dbId
      );
      if (!permiso) return false;

      return columnas.some((col) => !!permiso[col]);
    }

    // onMounted en contexto síncrono de setup() — patrón correcto
    onMounted(cargarData);

    return {
      roles, modulos, rolSeleccionado, seleccionarRol, tienePermiso, cargando
    };
  }
};
