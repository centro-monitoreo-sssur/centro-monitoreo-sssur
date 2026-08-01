// Vista Login: Autenticación de usuarios al sistema
// DEMO: Credenciales hardcodeadas - reemplazar con API real
import { ref, reactive, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { usePermisos } from '../../stores/permisos.js';
import { CONTEXTO, CONTEXTOS } from '../../core/app-contexto.js';

export default {
  setup() {
    const { setAutenticado, iniciarSesion: authIniciarSesion, errorAuth, cargandoAuth, irA } = useNavegacion();
    const { cargarTipos, cargarDepartamentos, cargarDistritos } = useCatalogos();
    const { cargarDenuncias, suscribirRealtime } = useDenuncias();
    const { cargarAlcance } = usePermisos();

    // El contexto lo resuelve `core/app-contexto.js`, que es además quien
    // decide la partición de almacenamiento. Antes se releía aquí de la URL por
    // separado: dos lecturas independientes del mismo dato que podían discrepar,
    // y de hecho discrepaban en el nombre del valor por defecto ('admin' aquí,
    // 'monitoreo' allí). Deja de ser computed porque no cambia sin recargar.
    const contexto = CONTEXTO;

    // Configuración dinámica según contexto
    const configLogin = computed(() => {
      switch (contexto) {
        case 'poblacion':
          return {
            tituloLogin: 'Portal de Denucias Ciudadanas',
            subtituloLogin: 'San Salvador Sur',
            descripcionLogin: 'Reporta incidentes y participa',
            tituloCard: 'Bienvenido',
            subtituloCard: 'Portal de Denuncias Ciudadanas',
            labelUsuario: 'DUI O EMAIL',
            placeholderUsuario: 'Ingrese su DUI o email',
            iconoUsuario: 'fa-solid fa-user',
            autocompleteUsuario: 'username',
            labelPassword: 'CONTRASEÑA',
            placeholderPassword: 'Ingrese su contraseña',
            iconoPassword: 'fa-solid fa-lock',
            textoCargando: 'Accediendo...',
            textoBoton: 'Ingresar',
            textoFooter: 'Acceso exclusivo para ciudadanos registrados',
            rolDestino: 'poblacion',
            vistaDestino: 'pwa-poblacion'
          };
        case 'empleados':
          return {
            tituloLogin: 'Portal Empleados',
            subtituloLogin: 'San Salvador Sur',
            descripcionLogin: 'Gestión de campo e intervenciones',
            tituloCard: 'Bienvenido',
            subtituloCard: 'Portal de Operaciones en Campo',
            // Se acepta username o correo: Supabase Auth solo entiende correo,
            // y `resolver_identificador_login` (v17) traduce el username.
            labelUsuario: 'USUARIO O CORREO',
            placeholderUsuario: 'Usuario o correo institucional',
            iconoUsuario: 'fa-solid fa-id-badge',
            autocompleteUsuario: 'username',
            labelPassword: 'CONTRASEÑA',
            placeholderPassword: 'Ingrese su contraseña',
            iconoPassword: 'fa-solid fa-lock',
            textoCargando: 'Accediendo...',
            textoBoton: 'Ingresar',
            textoFooter: 'Acceso exclusivo para personal municipal',
            rolDestino: 'empleado',
            vistaDestino: 'pwa-empleado'
          };
        default: // admin
          return {
            tituloLogin: 'Centro de Monitoreo',
            subtituloLogin: 'San Salvador Sur',
            descripcionLogin: 'Gestión Integral Municipal',
            tituloCard: 'Bienvenido al Portal',
            subtituloCard: 'Centro de Monitoreo Municipal',
            labelUsuario: 'USUARIO O CORREO',
            placeholderUsuario: 'Usuario o correo institucional',
            iconoUsuario: 'fa-solid fa-user',
            autocompleteUsuario: 'username',
            labelPassword: 'CONTRASEÑA',
            placeholderPassword: 'Ingrese su contraseña',
            iconoPassword: 'fa-solid fa-lock',
            textoCargando: 'Accediendo...',
            textoBoton: 'Acceder al Sistema',
            textoFooter: 'Acceso restringido a personal autorizado',
            rolDestino: 'admin',
            vistaDestino: 'dashboard'
          };
      }
    });

    // Estado del formulario
    const formulario = reactive({
      usuario: '',
      password: ''
    });

    // Estado UI
    const mostrarPassword = ref(false);
    const cargando = ref(false);
    const errorGeneral = ref('');
    const logoError = ref(false);
    const errores = reactive({
      usuario: '',
      password: ''
    });

    // Credenciales demo solo se usan si Supabase no está configurado (manejado en el store de navegacion).

    // Validar formulario
    const validarFormulario = () => {
      let valido = true;

      // Validar usuario
      if (!formulario.usuario.trim()) {
        errores.usuario = 'El campo es requerido';
        valido = false;
      } else if (formulario.usuario.length < 3) {
        errores.usuario = 'Debe tener al menos 3 caracteres';
        valido = false;
      }

      // Validar password
      if (!formulario.password.trim()) {
        errores.password = 'La contraseña es requerida';
        valido = false;
      } else if (formulario.password.length < 6) {
        errores.password = 'Debe tener al menos 6 caracteres';
        valido = false;
      }

      return valido;
    };

    // Limpiar error específico
    const limpiarError = (campo) => {
      errores[campo] = '';
      errorGeneral.value = '';
    };

    // Iniciar sesión — delega a Supabase Auth (o fallback demo si db=null)
    const iniciarSesion = async () => {
      errorGeneral.value = '';
      errores.usuario = '';
      errores.password = '';

      if (!validarFormulario()) return;

      cargando.value = true;
      try {
        // El store maneja Supabase Auth o demo según disponibilidad de `db`
        const resultado = await authIniciarSesion(formulario.usuario, formulario.password);
        if (!resultado.ok) {
          errorGeneral.value = errorAuth.value || 'Usuario o contraseña incorrectos';
          return;
        }

        // Cargar catálogos y casos al ingresar (admin).
        // El orden importa: `cargarDenuncias()` resuelve el nombre del distrito
        // de cada caso contra `catalogos.distritos`. Si los catálogos no están
        // cargados, los casos quedan sin distrito y el filtro territorial del
        // Mapa en Vivo no encuentra nada hasta recargar la página.
        if (contexto === CONTEXTOS.MONITOREO) {
          await cargarTipos();
          await cargarDepartamentos();
          await cargarDistritos();
          await cargarAlcance();
          await cargarDenuncias();
          suscribirRealtime();
        }

        // El listener onAuthStateChange de navegacion.js maneja la redirección
        // pero si es modo demo, redirigimos manualmente.
        if (!window.__supabaseDbActivo) {
          irA(configLogin.value.vistaDestino);
        }
      } catch (error) {
        errorGeneral.value = 'Error al iniciar sesión. Intente nuevamente.';
      } finally {
        cargando.value = false;
      }
    };

    const irARegistro = () => {
      // Navegación interna y no recarga: este botón SOLO se pinta en contexto
      // población, así que ya se está en la partición correcta y forzar una
      // recarga a `?contexto=poblacion` devolvería a este mismo login.
      irA('registro-poblacion');
    };

    const irAEmpleados = () => {
      // Redirigir al login de empleados
      window.location.href = window.location.pathname + '?contexto=empleados';
    };

    const irACiudadanos = () => {
      // Redirigir al login de ciudadanos
      window.location.href = window.location.pathname + '?contexto=poblacion';
    };

    return {
      contexto,
      tituloLogin: computed(() => configLogin.value.tituloLogin),
      subtituloLogin: computed(() => configLogin.value.subtituloLogin),
      descripcionLogin: computed(() => configLogin.value.descripcionLogin),
      tituloCard: computed(() => configLogin.value.tituloCard),
      subtituloCard: computed(() => configLogin.value.subtituloCard),
      labelUsuario: computed(() => configLogin.value.labelUsuario),
      placeholderUsuario: computed(() => configLogin.value.placeholderUsuario),
      iconoUsuario: computed(() => configLogin.value.iconoUsuario),
      autocompleteUsuario: computed(() => configLogin.value.autocompleteUsuario),
      labelPassword: computed(() => configLogin.value.labelPassword),
      placeholderPassword: computed(() => configLogin.value.placeholderPassword),
      iconoPassword: computed(() => configLogin.value.iconoPassword),
      textoCargando: computed(() => configLogin.value.textoCargando),
      textoBoton: computed(() => configLogin.value.textoBoton),
      textoFooter: computed(() => configLogin.value.textoFooter),
      formulario,
      mostrarPassword,
      cargando,
      errorGeneral,
      logoError,
      errores,
      iniciarSesion,
      limpiarError,
      irARegistro,
      irAEmpleados,
      irACiudadanos
    };
  }
};
