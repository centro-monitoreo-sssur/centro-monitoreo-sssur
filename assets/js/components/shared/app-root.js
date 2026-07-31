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

    // Vista propia de cada contexto con módulo fuera del shell administrativo.
    const VISTA_POR_CONTEXTO = { poblacion: 'pwa-poblacion', empleados: 'pwa-empleado' };
    // Roles cuyo destino natural es la PWA de campo. El resto (superadmin,
    // admin, alcalde, directivo, jefe_area) opera el Centro de Monitoreo.
    const ROLES_DE_CAMPO = ['empleado'];

    // Única fuente de verdad para decidir a dónde va un usuario ya autenticado.
    // La usan tanto el watch de `autenticado` como el onMounted; antes cada uno
    // decidía por su cuenta —uno por localStorage, otro por rol— y divergían.
    const resolverVistaDestino = () => {
      const contexto = localStorage.getItem('contexto_acceso');
      if (contexto && VISTA_POR_CONTEXTO[contexto] && config.value.accesoContextos[contexto]) {
        return VISTA_POR_CONTEXTO[contexto];
      }
      const rol = localStorage.getItem('rol_usuario');
      if (ROLES_DE_CAMPO.includes(rol) && config.value.accesoContextos.empleados) return 'pwa-empleado';
      if (rol === 'poblacion' && config.value.accesoContextos.poblacion) return 'pwa-poblacion';
      return 'dashboard';
    };

    // Detectar parámetros URL para contexto de acceso (identifica origen, no autentica)
    const detectarContextoURL = () => {
      if (typeof window === 'undefined') return null;

      const contextoParam = new URLSearchParams(window.location.search).get('contexto');

      // Sin parámetro, la URL base significa Centro de Monitoreo. Hay que
      // BORRAR el contexto guardado: si no, una visita previa a
      // ?contexto=empleados deja la clave rancia en localStorage y el usuario
      // aterriza en la PWA de campo al iniciar sesión en el panel admin.
      if (!contextoParam) {
        localStorage.removeItem('contexto_acceso');
        return null;
      }

      // Kill switch por contexto (ver stores/configuracion.js)
      if (!config.value.accesoContextos[contextoParam]) {
        localStorage.removeItem('contexto_acceso');
        return null;
      }

      const contextoValido = obtenerContexto(contextoParam);
      if (!contextoValido) {
        localStorage.removeItem('contexto_acceso');
        return null;
      }

      localStorage.setItem('contexto_acceso', contextoParam);

      if (autenticado.value) {
        vistaActual.value = VISTA_POR_CONTEXTO[contextoParam];
      } else {
        vistaActual.value = contextoValido.requiereRegistro ? 'registro-poblacion' : 'login';
      }
      return contextoParam;
    };

    // Redirigir a login si no está autenticado (excepto si ya está en login o registro)
    watch(autenticado, (nuevoValor) => {
      const contexto = localStorage.getItem('contexto_acceso');
      
      if (!nuevoValor && vistaActual.value !== 'login' && vistaActual.value !== 'registro-poblacion') {
        vistaActual.value = contexto === 'poblacion' ? 'registro-poblacion' : 'login';
      } else if (nuevoValor && vistaActual.value === 'login') {
        vistaActual.value = resolverVistaDestino();
      }
    });

    // Verificar autenticación al montar
    onMounted(async () => {
      // PWA Setup
      registrarSW();

      // Detectar contexto de URL primero. Si no hay parámetro, esta llamada ya
      // limpió el `contexto_acceso` guardado.
      const contexto = detectarContextoURL();

      if (autenticado.value) {
        vistaActual.value = resolverVistaDestino();

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
