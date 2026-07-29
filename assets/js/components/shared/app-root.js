// Shell raíz: orquesta sidebar, topbar y la vista activa. Carga inicial de
// datos (catálogos + denuncias + realtime) en su ciclo de vida.
import { computed, onMounted, watch, ref } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { usePoblacion } from '../../stores/poblacion.js';
import { useConfiguracion } from '../../stores/configuracion.js';
import { useIntervenciones } from '../../stores/intervenciones.js';
import { useDashboard } from '../../stores/dashboard.js';
import { usePwa } from '../../stores/pwa.js';
import { obtenerContexto } from '../../utils/demo-data.js';

export default {
  setup() {
    const { vistaActual, sidebarAbierto, tituloVista, autenticado, setAutenticado, irA, cerrarSesion } = useNavegacion();
    const { cargarTipos, cargarDepartamentos } = useCatalogos();
    const { cargarDenuncias, suscribirRealtime } = useDenuncias();
    const { cargarPoblacion } = usePoblacion();
    const { config } = useConfiguracion();
    const { cargarIntervenciones } = useIntervenciones();
    const { cargarKpis } = useDashboard();
    const { registrarSW, mostrarModalInstalacion, instalarPWA, posponerInstalacion } = usePwa();

    // Estado del modal de logout
    const mostrarModalLogout = ref(false);

    // Confirmar logout
    const confirmarLogout = () => {
      cerrarSesion();
      mostrarModalLogout.value = false;
    };

    // Escuchar evento para abrir modal de logout desde sidebar
    onMounted(() => {
      window.addEventListener('abrir-modal-logout', () => {
        mostrarModalLogout.value = true;
      });
    });

    // El sidebar y topbar siempre están visibles, se eliminó la lógica de fullscreen forzado.
    const ocultarShell = computed(() => false);

    // Detectar parámetros URL para contexto de acceso (identifica origen, no autentica)
    const detectarContextoURL = () => {
      if (typeof window === 'undefined') return null;
      
      const params = new URLSearchParams(window.location.search);
      
      // Detectar ?contexto=poblacion
      const contextoParam = params.get('contexto');
      console.log('detectarContextoURL - contextoParam:', contextoParam);
      
      if (contextoParam) {
        // Verificar kill switch antes de procesar
        if (contextoParam === 'poblacion' && !config.value.accesoContextos.poblacion) {
          console.log('detectarContextoURL - Kill switch activo para poblacion, ignorando');
          return null;
        }
        if (contextoParam === 'empleados' && !config.value.accesoContextos.empleados) {
          console.log('detectarContextoURL - Kill switch activo para empleados, ignorando');
          return null;
        }
        
        const contextoValido = obtenerContexto(contextoParam);
        console.log('detectarContextoURL - contextoValido:', contextoValido);
        
        if (contextoValido) {
          // Guardar contexto en localStorage
          localStorage.setItem('contexto_acceso', contextoParam);
          
          console.log('detectarContextoURL - autenticado.value:', autenticado.value);
          console.log('detectarContextoURL - requiereRegistro:', contextoValido.requiereRegistro);
          
          // Si no está autenticado y requiere registro, ir a registro
          if (!autenticado.value && contextoValido.requiereRegistro) {
            console.log('detectarContextoURL - Redirigiendo a registro-poblacion');
            vistaActual.value = 'registro-poblacion';
          } else if (!autenticado.value) {
            // Si no requiere registro (empleados), ir a login
            console.log('detectarContextoURL - Redirigiendo a login');
            vistaActual.value = 'login';
          } else if (autenticado.value) {
            // Si está autenticado, ir a vista correspondiente
            if (contextoParam === 'poblacion') {
              console.log('detectarContextoURL - Redirigiendo a pwa-poblacion');
              vistaActual.value = 'pwa-poblacion';
            } else if (contextoParam === 'empleados') {
              console.log('detectarContextoURL - Redirigiendo a pwa-empleado');
              vistaActual.value = 'pwa-empleado';
            }
          }
          return contextoParam;
        }
      }
      
      return null;
    };

    // Redirigir a login si no está autenticado (excepto si ya está en login o registro)
    watch(autenticado, (nuevoValor) => {
      const contexto = localStorage.getItem('contexto_acceso');
      
      if (!nuevoValor && vistaActual.value !== 'login' && vistaActual.value !== 'registro-poblacion') {
        // Si hay contexto de población, ir a registro
        if (contexto === 'poblacion') {
          vistaActual.value = 'registro-poblacion';
        } else {
          vistaActual.value = 'login';
        }
      } else if (nuevoValor && vistaActual.value === 'login') {
        // Si hay contexto de población, ir a PWA población
        if (contexto === 'poblacion') {
          vistaActual.value = 'pwa-poblacion';
        } else if (contexto === 'empleados') {
          vistaActual.value = 'pwa-empleado';
        } else {
          vistaActual.value = 'dashboard';
        }
      }
    });

    // Verificar autenticación al montar
    onMounted(async () => {
      // PWA Setup
      registrarSW();

      // Detectar contexto de URL primero
      const contexto = detectarContextoURL();
      const contextoGuardado = localStorage.getItem('contexto_acceso');
      
      // Si está autenticado, establecer la vista correcta según contexto URL o rol
      if (autenticado.value) {
        const rol = localStorage.getItem('rol_usuario');
        
        // Si NO hay parámetro contexto en la URL, limpiar contexto guardado y usar rol
        if (!contexto) {
          localStorage.removeItem('contexto_acceso');
          
          if (rol === 'admin') {
            vistaActual.value = 'dashboard';
          } else if (rol === 'poblacion' && config.value.accesoContextos.poblacion) {
            vistaActual.value = 'pwa-poblacion';
          } else if (rol === 'empleado' && config.value.accesoContextos.empleados) {
            vistaActual.value = 'pwa-empleado';
          } else {
            // Si el rol corresponde a un contexto desactivado, ir al dashboard
            vistaActual.value = 'dashboard';
          }
        } else {
          // Si HAY parámetro contexto en la URL, respetarlo
          if (contexto === 'poblacion' && config.value.accesoContextos.poblacion) {
            vistaActual.value = 'pwa-poblacion';
          } else if (contexto === 'empleados' && config.value.accesoContextos.empleados) {
            vistaActual.value = 'pwa-empleado';
          } else {
            // Contexto en URL pero kill switch desactivado, ir al dashboard
            vistaActual.value = 'dashboard';
          }
        }
        
        // Cargar datos
        await cargarTipos();
        await cargarDepartamentos();
        await cargarPoblacion();
        await cargarDenuncias();
        await cargarIntervenciones();
        await cargarKpis();
        suscribirRealtime();
      } else if (!contexto) {
        // Si no está autenticado y no hay contexto, ir a login
        vistaActual.value = 'login';
      }
    });

    return { 
      vistaActual, 
      sidebarAbierto, 
      ocultarShell, 
      tituloVista, 
      autenticado, 
      setAutenticado,
      mostrarModalLogout,
      confirmarLogout,
      mostrarModalInstalacion,
      instalarPWA,
      posponerInstalacion
    };
  },
};
