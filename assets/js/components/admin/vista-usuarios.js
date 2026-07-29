// ============================================================
// VISTA: Usuarios del Sistema
// Vista para gestionar los usuarios del sistema de monitoreo.
// Diseño moderno, profesional y limpio usando exclusivamente TailwindCSS.
// ============================================================
import { ref, reactive, computed, onMounted, watch } from '../../core/vue.js';
import { formatoFecha } from '../../utils/formato.js';

export default {
  setup() {
    /* ─── Estado de UI ─── */
    const usuarios = ref([]);
    const cargando = ref(true);
    const filtroBusqueda = ref('');
    const filtroRol = ref('');
    const filtroEstado = ref('');
    const usuarioSeleccionado = ref(null);
    const modalEditar = ref(false);
    const modalEliminar = ref(false);
    
    /* ─── Datos de demostración (en un sistema real, esto vendría de Supabase) ─── */
    const usuariosDemo = [
      { 
        id: 1, 
        nombre: 'María González', 
        email: 'm.gonzalez@sansalvadorsur.gob.sv', 
        rol: 'admin', 
        estado: 'activo', 
        ultimoAcceso: '2026-07-15T14:30:00Z',
        creadoEn: '2026-01-10T08:00:00Z'
      },
      { 
        id: 2, 
        nombre: 'Carlos Méndez', 
        email: 'c.mendez@sansalvadorsur.gob.sv', 
        rol: 'supervisor', 
        estado: 'activo', 
        ultimoAcceso: '2026-07-16T09:15:00Z',
        creadoEn: '2026-02-20T10:00:00Z'
      },
      { 
        id: 3, 
        nombre: 'Ana López', 
        email: 'a.lopez@sansalvadorsur.gob.sv', 
        rol: 'operador', 
        estado: 'activo', 
        ultimoAcceso: '2026-07-16T08:45:00Z',
        creadoEn: '2026-03-05T11:00:00Z'
      },
      { 
        id: 4, 
        nombre: 'Jorge Ruiz', 
        email: 'j.ruiz@sansalvadorsur.gob.sv', 
        rol: 'cuadrilla', 
        estado: 'activo', 
        ultimoAcceso: '2026-07-14T16:20:00Z',
        creadoEn: '2026-04-12T09:00:00Z'
      },
      { 
        id: 5, 
        nombre: 'Elena Torres', 
        email: 'e.torres@sansalvadorsur.gob.sv', 
        rol: 'solo_lectura', 
        estado: 'inactivo', 
        ultimoAcceso: '2026-07-10T17:10:00Z',
        creadoEn: '2026-05-03T14:00:00Z'
      },
      { 
        id: 6, 
        nombre: 'Roberto Silva', 
        email: 'r.silva@sansalvadorsur.gob.sv', 
        rol: 'operador', 
        estado: 'activo', 
        ultimoAcceso: '2026-07-16T07:30:00Z',
        creadoEn: '2026-06-18T13:00:00Z'
      }
    ];

    /* ─── Computeds ─── */
    const usuariosFiltrados = computed(() => {
      return usuarios.value.filter(usuario => {
        const coincideBusqueda = usuario.nombre.toLowerCase().includes(filtroBusqueda.value.toLowerCase()) ||
                                usuario.email.toLowerCase().includes(filtroBusqueda.value.toLowerCase());
        
        const coincideRol = !filtroRol.value || usuario.rol === filtroRol.value;
        const coincideEstado = !filtroEstado.value || usuario.estado === filtroEstado.value;
        
        return coincideBusqueda && coincideRol && coincideEstado;
      });
    });

    const totalUsuarios = computed(() => usuarios.value.length);
    const usuariosActivos = computed(() => usuarios.value.filter(u => u.estado === 'activo').length);
    const usuariosInactivos = computed(() => usuarios.value.filter(u => u.estado === 'inactivo').length);

    /* ─── Funciones ─── */
    const cargarUsuarios = async () => {
      cargando.value = true;
      try {
        // En un sistema real, esto sería una llamada a Supabase
        // Por ahora, usamos datos de demostración
        await new Promise(resolve => setTimeout(resolve, 500)); // Simular latencia
        usuarios.value = usuariosDemo;
      } catch (error) {
        console.error('Error cargando usuarios:', error);
        usuarios.value = usuariosDemo; // Fallback a datos de demostración
      } finally {
        cargando.value = false;
      }
    };

    const limpiarFiltros = () => {
      filtroBusqueda.value = '';
      filtroRol.value = '';
      filtroEstado.value = '';
    };

    const abrirModalEditar = (usuario) => {
      usuarioSeleccionado.value = { ...usuario };
      modalEditar.value = true;
    };

    const abrirModalEliminar = (usuario) => {
      usuarioSeleccionado.value = { ...usuario };
      modalEliminar.value = true;
    };

    const cerrarModalEditar = () => {
      modalEditar.value = false;
      usuarioSeleccionado.value = null;
    };

    const cerrarModalEliminar = () => {
      modalEliminar.value = false;
      usuarioSeleccionado.value = null;
    };

    const guardarCambiosUsuario = () => {
      // En un sistema real, esto actualizaría en Supabase
      const indice = usuarios.value.findIndex(u => u.id === usuarioSeleccionado.value.id);
      if (indice !== -1) {
        usuarios.value[indice] = { ...usuarioSeleccionado.value };
      }
      cerrarModalEditar();
    };

    const eliminarUsuario = () => {
      // En un sistema real, esto eliminaría de Supabase
      usuarios.value = usuarios.value.filter(u => u.id !== usuarioSeleccionado.value.id);
      cerrarModalEliminar();
    };

    /* ─── Ciclo de vida ─── */
    onMounted(() => {
      cargarUsuarios();
    });

    return {
      // Estado
      usuarios,
      cargando,
      filtroBusqueda,
      filtroRol,
      filtroEstado,
      usuarioSeleccionado,
      modalEditar,
      modalEliminar,
      
      // Computeds
      usuariosFiltrados,
      totalUsuarios,
      usuariosActivos,
      usuariosInactivos,
      
      // Funciones
      cargarUsuarios,
      limpiarFiltros,
      abrirModalEditar,
      abrirModalEliminar,
      cerrarModalEditar,
      cerrarModalEliminar,
      guardarCambiosUsuario,
      eliminarUsuario,
      
      // Helpers
      formatoFecha
    };
  },
};