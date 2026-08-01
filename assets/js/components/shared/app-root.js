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
import { usePermisos } from '../../stores/permisos.js';
import { obtenerContexto } from '../../utils/demo-data.js';

export default {
  setup() {
    const { vistaActual, sidebarAbierto, tituloVista, autenticado, perfilCargado, rolUsuario,
            setAutenticado, irA, cerrarSesion } = useNavegacion();
    const { cargarTipos, cargarDepartamentos, cargarDistritos } = useCatalogos();
    const { cargarDenuncias, suscribirRealtime } = useDenuncias();
    const { cargarPoblacion } = usePoblacion();
    const { config } = useConfiguracion();
    const { cargarIntervenciones } = useIntervenciones();
    const { cargarKpis } = useDashboard();
    const { registrarSW, mostrarModalInstalacion, instalarPWA, posponerInstalacion } = usePwa();
    const { cargarAlcance } = usePermisos();

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

    // ⚠ El contexto es una propiedad DE LA PESTAÑA, no del navegador.
    //
    // Vivía en `localStorage`, que se comparte entre todas las pestañas del
    // mismo origen. Con una pestaña abierta en `?contexto=empleados` y otra en
    // la URL base, la primera escribía 'empleados' y la segunda lo leía al
    // iniciar sesión: el usuario del Centro de Monitoreo aterrizaba en la PWA
    // de campo. Al recargar parecía corregirse solo porque el borrado y la
    // decisión ocurrían en el mismo bloque síncrono, sin dar tiempo a que la
    // otra pestaña repusiera la clave.
    //
    // `sessionStorage` es por pestaña, que es justo la semántica que se busca.
    const CLAVE_CONTEXTO = 'contexto_acceso';

    const leerContexto = () => {
      // La URL manda siempre: es el dato que el usuario tiene delante.
      if (typeof window !== 'undefined') {
        const param = new URLSearchParams(window.location.search).get('contexto');
        if (param) return param;
      }
      // Respaldo por pestaña, para navegaciones internas que pierden el query.
      return sessionStorage.getItem(CLAVE_CONTEXTO);
    };

    // Restos de la versión que guardaba el contexto en localStorage. Si no se
    // borran, la clave compartida sigue viva en el navegador de quien ya venía
    // usando el sistema. Nada la lee ya, pero se limpia para no dejar basura.
    const limpiarLegado = () => localStorage.removeItem(CLAVE_CONTEXTO);

    const guardarContexto = (valor) => {
      sessionStorage.setItem(CLAVE_CONTEXTO, valor);
      limpiarLegado();
    };
    const olvidarContexto = () => {
      sessionStorage.removeItem(CLAVE_CONTEXTO);
      limpiarLegado();
    };

    // Única fuente de verdad para decidir a dónde va un usuario ya autenticado.
    // El rol se lee del store reactivo, NO de localStorage. Durante un login
    // recién hecho, localStorage todavía guarda el rol de la sesión anterior:
    // `onAuthStateChange` marca `autenticado = true` de inmediato y solo
    // después consulta public.usuarios para escribir el rol real. Leer
    // localStorage en ese punto decide con datos rancios.
    const resolverVistaDestino = () => {
      const contexto = leerContexto();
      if (contexto && VISTA_POR_CONTEXTO[contexto] && config.value.accesoContextos[contexto]) {
        return VISTA_POR_CONTEXTO[contexto];
      }
      const rol = rolUsuario.value;
      if (ROLES_DE_CAMPO.includes(rol) && config.value.accesoContextos.empleados) return 'pwa-empleado';
      if (rol === 'poblacion' && config.value.accesoContextos.poblacion) return 'pwa-poblacion';
      return 'dashboard';
    };

    // Vista elegida antes de conocer el rol real (pintado optimista al recargar
    // con sesión viva). Sirve para saber si podemos corregirla sin pisar una
    // navegación que el usuario haya hecho por su cuenta mientras tanto.
    let destinoOptimista = null;

    // Detectar parámetros URL para contexto de acceso (identifica origen, no autentica)
    const detectarContextoURL = () => {
      if (typeof window === 'undefined') return null;

      const contextoParam = new URLSearchParams(window.location.search).get('contexto');

      // Sin parámetro, la URL base significa Centro de Monitoreo. Se borra el
      // contexto de ESTA pestaña; las demás conservan el suyo.
      if (!contextoParam) {
        olvidarContexto();
        return null;
      }

      // Kill switch por contexto (ver stores/configuracion.js)
      if (!config.value.accesoContextos[contextoParam]) {
        olvidarContexto();
        return null;
      }

      const contextoValido = obtenerContexto(contextoParam);
      if (!contextoValido) {
        olvidarContexto();
        return null;
      }

      guardarContexto(contextoParam);

      if (autenticado.value) {
        vistaActual.value = VISTA_POR_CONTEXTO[contextoParam];
      } else {
        vistaActual.value = contextoValido.requiereRegistro ? 'registro-poblacion' : 'login';
      }
      return contextoParam;
    };

    // Redirigir a login al perder la sesión (salvo si ya está en login/registro)
    watch(autenticado, (nuevoValor) => {
      if (nuevoValor) return;
      if (vistaActual.value === 'login' || vistaActual.value === 'registro-poblacion') return;
      vistaActual.value = leerContexto() === 'poblacion' ? 'registro-poblacion' : 'login';
    });

    // La entrada al sistema se decide aquí, y SOLO cuando el perfil ya resolvió
    // el rol real. Antes esto colgaba del watch de `autenticado`, que se dispara
    // varios cientos de ms antes de que se conozca el rol: el usuario del
    // Centro de Monitoreo aterrizaba en la PWA de empleados y solo al recargar
    // —con el rol ya en localStorage— llegaba al panel correcto.
    watch(perfilCargado, (listo) => {
      if (!listo || !autenticado.value) return;
      const destino = resolverVistaDestino();
      // Solo se corrige si seguimos en login o en el destino que se pintó de
      // forma optimista. Si el usuario ya navegó a otra vista, no se le mueve.
      if (vistaActual.value === 'login' || vistaActual.value === destinoOptimista) {
        vistaActual.value = destino;
      }
      destinoOptimista = null;
    });

    // Verificar autenticación al montar
    onMounted(async () => {
      // PWA Setup
      registrarSW();

      // Detectar contexto de URL primero. Si no hay parámetro, esta llamada ya
      // limpió el `contexto_acceso` guardado.
      const contexto = detectarContextoURL();

      if (autenticado.value) {
        // Pintado optimista: al recargar con sesión viva, `rolUsuario` ya viene
        // de localStorage, así que se evita el parpadeo del login. Si el perfil
        // real difiere, el watch de `perfilCargado` corrige el destino.
        destinoOptimista = resolverVistaDestino();
        vistaActual.value = destinoOptimista;

        // Cargar datos. Los catálogos van ANTES que los casos: el mapeo de un
        // caso resuelve el nombre de su distrito contra `catalogos.distritos`,
        // y si el catálogo llega después el nombre queda vacío para siempre.
        await cargarTipos();
        await cargarDepartamentos();
        await cargarDistritos();
        // El alcance decide qué controles territoriales ofrece la consola.
        // Va antes de los casos para que la vista no arranque mostrando un
        // comparativo de 5 distritos a quien solo puede ver el suyo.
        await cargarAlcance();
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
