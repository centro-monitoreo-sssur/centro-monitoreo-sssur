// Vista PWA Empleado: App principal para empleados de campo
// DEMO: Funcionalidad simulada - reemplazar con API real
import { ref, computed } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { usuarioActual, nombreUsuario, rolUsuario, cerrarSesion, irA } = useNavegacion();

    // Obtener datos del empleado del localStorage
    const empleadoDatos = computed(() => {
      const datos = localStorage.getItem('empleado_datos');
      return datos ? JSON.parse(datos) : null;
    });

    // Nombre del usuario (primer nombre y primer apellido).
    // Orden de preferencia: perfil de public.usuarios → datos locales del
    // empleado → parte local del correo. NUNCA el correo completo: no tiene
    // espacios, así que como token indivisible en un titular grande desborda
    // el ancho de la pantalla y arrastra a toda la página al scroll horizontal.
    const usuarioNombre = computed(() => {
      const dosPrimeras = (texto) => {
        if (!texto) return '';
        const partes = texto.trim().split(/\s+/).filter(Boolean);
        return partes.slice(0, 2).join(' ');
      };

      if (nombreUsuario.value) return dosPrimeras(nombreUsuario.value);
      if (empleadoDatos.value?.nombre) return dosPrimeras(empleadoDatos.value.nombre) || 'Empleado';

      // Último recurso: "soporte.ti@dominio" → "Soporte Ti"
      const local = (usuarioActual.value || '').split('@')[0];
      if (!local) return 'Empleado';
      return dosPrimeras(local.replace(/[._-]+/g, ' '))
        .replace(/\b\p{L}/gu, (c) => c.toUpperCase()) || 'Empleado';
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
