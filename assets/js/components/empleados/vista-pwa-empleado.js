// Vista PWA Empleado: App principal para empleados de campo
// DEMO: Funcionalidad simulada - reemplazar con API real
import { ref, computed } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { usuarioActual, rolUsuario, cerrarSesion, irA } = useNavegacion();

    // Obtener datos del empleado del localStorage
    const empleadoDatos = computed(() => {
      const datos = localStorage.getItem('empleado_datos');
      return datos ? JSON.parse(datos) : null;
    });

    // Nombre del usuario (Primer nombre y primer apellido)
    const usuarioNombre = computed(() => {
      const parseNombre = (nombreCompleto) => {
        if (!nombreCompleto) return '';
        const partes = nombreCompleto.trim().split(/\\s+/);
        return partes.length >= 2 ? `${partes[0]} ${partes[1]}` : partes[0];
      };

      if (empleadoDatos.value && empleadoDatos.value.nombre) {
        return parseNombre(empleadoDatos.value.nombre) || 'Empleado';
      }
      return parseNombre(usuarioActual.value) || 'Empleado';
    });

    // Display del rol
    const rolDisplay = computed(() => {
      switch (rolUsuario.value) {
        case 'empleado_campo':
          return 'Empleado de Campo';
        case 'jefe_area':
          return 'Jefe de Área';
        default:
          return 'Empleado Municipal';
      }
    });

    // Display del área
    const areaDisplay = computed(() => {
      if (empleadoDatos.value?.area) {
        return empleadoDatos.value.area;
      }
      if (empleadoDatos.value?.distrito) {
        return `Distrito ${empleadoDatos.value.distrito}`;
      }
      return 'Municipalidad';
    });

    // Zona asignada
    const zonaAsignada = computed(() => {
      return empleadoDatos.value?.distrito || empleadoDatos.value?.area || 'No asignada';
    });

    // Tareas pendientes (demo)
    const tareasPendientes = ref(3);

    // Navegación a vistas específicas (placeholder)
    const irAMisIntervenciones = () => {
      // DEMO: Implementar vista de intervenciones
      console.log('Navegar a mis intervenciones');
    };

    const irALevantarDenuncia = () => {
      // DEMO: Implementar vista de levantar denuncia
      console.log('Navegar a levantar denuncia');
    };

    const irACierreIncidente = () => {
      // DEMO: Implementar vista de cierre de incidente
      console.log('Navegar a cierre de incidente');
    };

    const irABuzonOffline = () => {
      // DEMO: Implementar vista de buzón offline
      console.log('Navegar a buzón offline');
    };

    return {
      usuarioNombre,
      usuarioActual,
      rolUsuario,
      rolDisplay,
      areaDisplay,
      zonaAsignada,
      tareasPendientes,
      cerrarSesion,
      irA,
      irAMisIntervenciones,
      irALevantarDenuncia,
      irACierreIncidente,
      irABuzonOffline
    };
  }
};
