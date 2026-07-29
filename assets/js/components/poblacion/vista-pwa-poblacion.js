// Vista PWA Población: App principal para ciudadanos
// DEMO: Funcionalidad simulada - reemplazar con API real
import { ref, computed } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { usuarioActual, rolUsuario, cerrarSesion, irA } = useNavegacion();
    
    // Estado del modal de logout
    const mostrarModalLogout = ref(false);
    
    // Confirmar logout
    const confirmarLogout = () => {
      cerrarSesion();
      mostrarModalLogout.value = false;
    };

    // Obtener datos del ciudadano del localStorage
    const ciudadanoDatos = computed(() => {
      const datos = localStorage.getItem('ciudadano_datos');
      return datos ? JSON.parse(datos) : null;
    });

    // Nombre del usuario (Primer nombre y primer apellido)
    const usuarioNombre = computed(() => {
      if (ciudadanoDatos.value) {
        const primerNombre = (ciudadanoDatos.value.nombres || '').trim().split(/\\s+/)[0] || '';
        const primerApellido = (ciudadanoDatos.value.apellidos || '').trim().split(/\\s+/)[0] || '';
        return `${primerNombre} ${primerApellido}`.trim() || 'Ciudadano';
      }
      if (usuarioActual.value) {
        const partes = usuarioActual.value.trim().split(/\\s+/);
        return partes.length >= 2 ? `${partes[0]} ${partes[1]}` : partes[0];
      }
      return 'Ciudadano';
    });

    // Distrito del usuario
    const distritoUsuario = computed(() => {
      return ciudadanoDatos.value?.distrito || 'No especificado';
    });

    // Navegación a vistas específicas (placeholder)
    const irACrearDenuncia = () => {
      // DEMO: Implementar vista de creación de denuncia
      console.log('Navegar a crear denuncia');
    };

    const irAMisDenuncias = () => {
      // DEMO: Implementar vista de mis denuncias
      console.log('Navegar a mis denuncias');
    };

    const irAMapaDistrito = () => {
      // DEMO: Implementar vista de mapa del distrito
      console.log('Navegar a mapa del distrito');
    };

    return {
      usuarioNombre,
      usuarioActual,
      rolUsuario,
      distritoUsuario,
      mostrarModalLogout,
      confirmarLogout,
      irA,
      irACrearDenuncia,
      irAMisDenuncias,
      irAMapaDistrito
    };
  }
};
