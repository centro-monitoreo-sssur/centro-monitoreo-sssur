// Vista Login: Autenticación de usuarios al sistema
// DEMO: Credenciales hardcodeadas - reemplazar con API real
import { ref, reactive, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useDenuncias } from '../../stores/denuncias.js';

export default {
  setup() {
    const { setAutenticado, irA } = useNavegacion();
    const { cargarTipos } = useCatalogos();
    const { cargarDenuncias, suscribirRealtime } = useDenuncias();

    // Detectar contexto desde URL
    const contexto = computed(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get('contexto') || 'admin';
    });

    // Configuración dinámica según contexto
    const configLogin = computed(() => {
      switch (contexto.value) {
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
            labelUsuario: 'CÓDIGO EMPLEADO',
            placeholderUsuario: 'Ingrese su código',
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
            labelUsuario: 'USUARIO',
            placeholderUsuario: 'Ingrese su usuario',
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

    // Credenciales demo (hardcodeadas por diseño actual)
    // DEMO: Reemplazar con API real cuando se conecte el backend
    const CREDENCIALES_DEMO = {
      admin: { usuario: 'soporte.ti', password: 'admin123#' },
      poblacion: { usuario: 'ciudadano', password: 'ciudadano123' },
      empleados: { usuario: 'empleado', password: 'empleado123' }
    };

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

    // Iniciar sesión
    const iniciarSesion = async () => {
      // Limpiar errores previos
      errorGeneral.value = '';
      errores.usuario = '';
      errores.password = '';

      // Validar formulario
      if (!validarFormulario()) {
        return;
      }

      cargando.value = true;

      // Simular latencia de red (demo)
      // DEMO: Reemplazar con llamada a API real
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const credenciales = CREDENCIALES_DEMO[contexto.value];
        
        // Validar credenciales (demo)
        if (formulario.usuario === credenciales.usuario && 
            formulario.password === credenciales.password) {
          // Login exitoso
          setAutenticado(true, formulario.usuario, configLogin.value.rolDestino);
          
          // Guardar sesión en localStorage (demo)
          localStorage.setItem('usuario_autenticado', formulario.usuario);
          localStorage.setItem('sesion_activa', 'true');
          localStorage.setItem('rol_usuario', configLogin.value.rolDestino);

          // Cargar datos demo después del login (solo para admin)
          if (contexto.value === 'admin') {
            await cargarTipos();
            await cargarDenuncias();
            suscribirRealtime();
          }

          // Redirigir según contexto
          irA(configLogin.value.vistaDestino);
        } else {
          // Credenciales inválidas
          errorGeneral.value = 'Usuario o contraseña incorrectos';
        }
      } catch (error) {
        errorGeneral.value = 'Error al iniciar sesión. Intente nuevamente.';
      } finally {
        cargando.value = false;
      }
    };

    const irARegistro = () => {
      // Guardar contexto de población
      localStorage.setItem('contexto_acceso', 'poblacion');
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
