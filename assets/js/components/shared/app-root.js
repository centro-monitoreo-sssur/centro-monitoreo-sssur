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
import { CONTEXTO, CONTEXTOS } from '../../core/app-contexto.js';
import { obtenerContexto } from '../../utils/demo-data.js';

export default {
  setup() {
    const { vistaActual, sidebarAbierto, tituloVista, autenticado, perfilCargado, rolUsuario,
            setAutenticado, irA, cerrarSesion } = useNavegacion();
    const { cargarTipos, cargarDepartamentos, cargarDistritos, cargarPrioridades } = useCatalogos();
    const { cargarDenuncias, suscribirRealtime } = useDenuncias();
    const { cargarPoblacion } = usePoblacion();
    const { config } = useConfiguracion();
    const { cargarIntervenciones } = useIntervenciones();
    const { cargarKpis } = useDashboard();
    const { registrarSW, mostrarModalInstalacion, instalarPWA, posponerInstalacion } = usePwa();
    const { cargarAlcance, cargarPermisosModulo } = usePermisos();

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

    // El contexto ya viene resuelto y persistido por `core/app-contexto.js`,
    // que se evalúa antes que ningún store porque de él depende la clave donde
    // Supabase guarda la sesión. Aquí solo se decide la VISTA; la partición de
    // almacenamiento es cosa suya.
    //
    // Restos de la versión que guardaba el contexto en localStorage —donde una
    // pestaña le pisaba el contexto a la otra—. Nada lo lee ya, pero se limpia
    // para no dejar basura en el navegador de quien venía usando el sistema.
    localStorage.removeItem('contexto_acceso');

    // Única fuente de verdad para decidir a dónde va un usuario ya autenticado.
    // El rol se lee del store reactivo, NO de localStorage. Durante un login
    // recién hecho, localStorage todavía guarda el rol de la sesión anterior:
    // `onAuthStateChange` marca `autenticado = true` de inmediato y solo
    // después consulta public.usuarios para escribir el rol real. Leer
    // localStorage en ese punto decide con datos rancios.
    const resolverVistaDestino = () => {
      // `VISTA_POR_CONTEXTO['monitoreo']` es undefined a propósito: el Centro de
      // Monitoreo no fuerza vista, la decide el rol unas líneas más abajo.
      if (VISTA_POR_CONTEXTO[CONTEXTO] && config.value.accesoContextos[CONTEXTO]) {
        return VISTA_POR_CONTEXTO[CONTEXTO];
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

    // Aplica la vista inicial que impone el contexto (identifica origen, no
    // autentica). Devuelve el contexto si tomó el control de la vista, o null
    // si la decisión queda en manos del rol.
    const aplicarContextoInicial = () => {
      // El Centro de Monitoreo no tiene vista propia que forzar.
      if (CONTEXTO === CONTEXTOS.MONITOREO) return null;

      // Kill switch por contexto (ver stores/configuracion.js). Un contexto
      // apagado no abre su PWA: cae al shell administrativo y ahí deciden los
      // permisos, que es la degradación segura.
      if (!config.value.accesoContextos[CONTEXTO]) return null;

      const definicion = obtenerContexto(CONTEXTO);
      if (!definicion) return null;

      if (autenticado.value) {
        vistaActual.value = VISTA_POR_CONTEXTO[CONTEXTO];
      } else {
        vistaActual.value = definicion.requiereRegistro ? 'registro-poblacion' : 'login';
      }
      return CONTEXTO;
    };

    // Redirigir a login al perder la sesión (salvo si ya está en login/registro)
    watch(autenticado, (nuevoValor) => {
      if (nuevoValor) return;
      if (vistaActual.value === 'login' || vistaActual.value === 'registro-poblacion') return;
      vistaActual.value = CONTEXTO === CONTEXTOS.POBLACION ? 'registro-poblacion' : 'login';
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

      // El contexto ya está resuelto; aquí solo se aplica la vista que impone.
      const contexto = aplicarContextoInicial();

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
        // Las prioridades traen el SLA (`tiempo_objetivo_horas`) y son las que
        // traducen `casos.prioridad_id` a algo legible. No se cargaban, así que
        // cada vista lo traducía a mano — y ninguna acertaba.
        await cargarPrioridades();
        // El alcance decide qué controles territoriales ofrece la consola.
        // Va antes de los casos para que la vista no arranque mostrando un
        // comparativo de 5 distritos a quien solo puede ver el suyo.
        await cargarAlcance();
        // Los permisos de módulo van en paralelo al alcance: son consultas
        // independientes y el menú no debe esperar a los casos para dibujarse.
        cargarPermisosModulo();
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
