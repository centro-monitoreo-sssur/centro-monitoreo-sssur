// ============================================================
// STORE: navegación / shell
// Vista activa, sidebar móvil, logo y definición del menú. El badge del
// nav de denuncias depende del store de denuncias (sin acoplar vistas).
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { useDenuncias } from './denuncias.js';
import { usePermisos } from './permisos.js';

const vistaActual = ref('login'); // Iniciar en login por defecto
const sidebarAbierto = ref(false);
const sidebarColapsado = ref(false); // estado de colapso en escritorio (estilo Flowbite)
const logoError = ref(false);

// Estado de Dark Mode (Por defecto light mode, a menos que se active expresamente)
const isDarkMode = ref(localStorage.getItem('color-theme') === 'dark');

// Estado de autenticación (DEMO: persistencia en localStorage)
const autenticado = ref(localStorage.getItem('sesion_activa') === 'true');
const usuarioActual = ref(localStorage.getItem('usuario_autenticado') || '');
// Nombre y apellido reales del perfil en public.usuarios. `usuarioActual` es el
// correo institucional y no sirve para saludar: no tiene espacios, así que en
// un titular grande desborda el layout en móvil.
const nombreUsuario = ref(localStorage.getItem('nombre_usuario') || '');
const rolUsuario = ref(localStorage.getItem('rol_usuario') || '');
// UUID de Supabase Auth — necesario para filtrar casos por usuario_responsable_id
const usuarioId = ref(localStorage.getItem('usuario_id') || '');

// `autenticado` pasa a true en cuanto Supabase confirma la sesión, pero el ROL
// llega después: hay que consultar public.usuarios. Quien decida a qué vista
// mandar al usuario debe esperar esta bandera, no leer `rol_usuario` de
// localStorage — en ese instante todavía contiene el valor de la sesión
// anterior y el usuario aterriza en el módulo equivocado.
const perfilCargado = ref(false);

// Error de autenticación (para mostrarlo en el formulario de login)
const errorAuth = ref('');
const cargandoAuth = ref(false);

// Credenciales demo (solo cuando db no está disponible)
const DEMO_CREDENCIALES = [
  { usuario: 'soporte.ti',  clave: 'admin123#',   rol: 'admin',    vista: 'dashboard' },
  { usuario: 'empleado',    clave: 'empleado123', rol: 'empleado', vista: 'pwa-empleado' },
  { usuario: 'ciudadano',   clave: 'ciudadano123',rol: 'ciudadano',vista: 'pwa-poblacion' },
];

const setAutenticado = async (valor, usuario = '', rol = '') => {
  // Modo demo: sin db
  if (!db) {
    autenticado.value = valor;
    if (valor) {
      localStorage.setItem('sesion_activa', 'true');
      if (usuario) { localStorage.setItem('usuario_autenticado', usuario); usuarioActual.value = usuario; }
      if (rol)     { localStorage.setItem('rol_usuario', rol); rolUsuario.value = rol; }
    } else {
      localStorage.removeItem('sesion_activa');
      localStorage.removeItem('usuario_autenticado');
      localStorage.removeItem('rol_usuario');
  localStorage.removeItem('nombre_usuario');
      usuarioActual.value = '';
      rolUsuario.value = '';
  nombreUsuario.value = '';
    }
    return { ok: true };
  }
  return { ok: true };
};

// Inicio de sesión real via Supabase Auth
const iniciarSesion = async (email, password) => {
  errorAuth.value = '';
  cargandoAuth.value = true;
  try {
    if (!db) {
      // Fallback demo: buscar en credenciales locales
      const match = DEMO_CREDENCIALES.find((c) => c.usuario === email && c.clave === password);
      if (!match) throw new Error('Credenciales incorrectas');
      autenticado.value = true;
      usuarioActual.value = match.usuario;
      rolUsuario.value = match.rol;
      localStorage.setItem('sesion_activa', 'true');
      localStorage.setItem('usuario_autenticado', match.usuario);
      localStorage.setItem('rol_usuario', match.rol);
      vistaActual.value = match.vista;
      return { ok: true };
    }
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // El rol y el perfil se leen en el listener onAuthStateChange
    return { ok: true, data };
  } catch (e) {
    errorAuth.value = e.message || 'Error al iniciar sesión';
    return { ok: false, error: e };
  } finally {
    cargandoAuth.value = false;
  }
};

const { limpiarAlcance } = usePermisos();

const cerrarSesion = async () => {
  if (db) await db.auth.signOut();
  autenticado.value = false;
  perfilCargado.value = false;
  // Sin esto el siguiente usuario hereda el alcance territorial del anterior
  // hasta que `mi_alcance()` responda: una jefatura distrital vería por un
  // instante el comparativo de los 5 distritos.
  limpiarAlcance();
  usuarioActual.value = '';
  rolUsuario.value = '';
  nombreUsuario.value = '';
  localStorage.removeItem('sesion_activa');
  localStorage.removeItem('usuario_autenticado');
  localStorage.removeItem('rol_usuario');
  localStorage.removeItem('nombre_usuario');
  vistaActual.value = 'login';
};

// Listener de cambios de sesión en Supabase (corre una sola vez al cargar la app)
if (db) {
  db.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      perfilCargado.value = false;
      autenticado.value = true;
      usuarioActual.value = session.user.email;
      usuarioId.value = session.user.id;
      localStorage.setItem('usuario_id', session.user.id);
      localStorage.setItem('sesion_activa', 'true');
      localStorage.setItem('usuario_autenticado', session.user.email);
      try {
        // Leer rol desde la tabla `usuarios` usando el UUID de Supabase Auth
        const { data: perfil, error } = await db
          .from('usuarios')
          .select('rol_id, nombres, apellidos, roles(codigo)')
          .eq('id', session.user.id)
          .single();
        if (error) throw error;

        const codigoRol = perfil?.roles?.codigo || '';
        if (!codigoRol) {
          // Antes esto caía a 'empleado' por defecto. Un fallo de RLS sobre
          // `roles` degradaba en silencio a un superadmin a rol de campo y lo
          // mandaba a la PWA. Preferimos rol vacío + error visible: sin rol el
          // destino es el Centro de Monitoreo y los permisos los aplica RLS.
          console.error(
            '[navegacion] No se pudo resolver el rol del usuario ' + session.user.email +
            '. Revisa que `usuarios.rol_id` apunte a un registro de `roles` legible ' +
            'por el usuario autenticado (policy de select sobre public.roles).'
          );
        }
        rolUsuario.value = codigoRol;
        if (codigoRol) localStorage.setItem('rol_usuario', codigoRol);
        else localStorage.removeItem('rol_usuario');

        // El nombre del perfil se consultaba y se descartaba, así que la UI
        // terminaba saludando con el correo institucional completo.
        nombreUsuario.value = [perfil?.nombres, perfil?.apellidos].filter(Boolean).join(' ').trim();
        if (nombreUsuario.value) localStorage.setItem('nombre_usuario', nombreUsuario.value);
      } catch (e) {
        console.error('[navegacion] Falló la carga del perfil del usuario:', e.message);
      } finally {
        // Se marca SIEMPRE, incluso si la consulta falló: de lo contrario la
        // app se queda esperando para siempre y no redirige a ninguna vista.
        perfilCargado.value = true;
      }
    } else {
      perfilCargado.value = false;
      autenticado.value = false;
      limpiarAlcance();
      usuarioActual.value = '';
      rolUsuario.value = '';
      nombreUsuario.value = '';
      usuarioId.value = '';
      localStorage.removeItem('sesion_activa');
      localStorage.removeItem('usuario_autenticado');
      localStorage.removeItem('rol_usuario');
  localStorage.removeItem('nombre_usuario');
      localStorage.removeItem('usuario_id');
      vistaActual.value = 'login';
    }
  });
}

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('color-theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('color-theme', 'light');
  }
};

// Pantalla completa de la vista Mapa: al activarse se ocultan sidebar, topbar
// y footer, y el mapa ocupa todo el viewport. Toggle del propio mapa.
const mapaFullscreen = ref(true);
const toggleMapaFullscreen = () => { mapaFullscreen.value = !mapaFullscreen.value; };

// Un solo botón hamburguesa: en móvil abre/cierra el drawer; en escritorio
// colapsa/expande el sidebar fijo.
const toggleSidebar = () => {
  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    sidebarAbierto.value = !sidebarAbierto.value;
  } else {
    sidebarColapsado.value = !sidebarColapsado.value;
  }
};

const { denunciasPendientesCount } = useDenuncias();

const navOperacion = [
  { id: 'dashboard',       label: 'Dashboard',            icono: 'fa-chart-pie' },
  { id: 'mapa',            label: 'Mapa en Vivo',         icono: 'fa-map-marked-alt' },
  { id: 'denuncias',       label: 'Gestión de Denuncias', icono: 'fa-clipboard-list', badge: () => denunciasPendientesCount.value || null },
  { id: 'intervenciones',  label: 'Intervenciones',       icono: 'fa-hard-hat' },
  { id: 'cartograma',      label: 'Cartograma',           icono: 'fa-map' },
  { id: 'reportes',        label: 'Reportes',             icono: 'fa-chart-line' },
];
const navAdmin = [
  { id: 'usuarios',     label: 'Usuarios',               icono: 'fa-user-shield' },
  { id: 'poblacion',    label: 'Población Registrada',   icono: 'fa-users' },
  { id: 'departamentos',label: 'Departamentos',          icono: 'fa-building' },
  { id: 'roles',        label: 'Roles y Permisos',       icono: 'fa-lock' },
  { id: 'bitacora',     label: 'Bitácora de Auditoría',  icono: 'fa-history' },
  { id: 'vista-notificaciones',label: 'Notificaciones',         icono: 'fa-bell' },
  { id: 'config',       label: 'Configuración',          icono: 'fa-cog' },
];

const titulos = {
  dashboard: 'Panel Principal', mapa: 'Mapa en Vivo', denuncias: 'Gestión de Denuncias',
  intervenciones: 'Intervenciones Activas', reportes: 'Reportes y Analítica',
  usuarios: 'Usuarios del Sistema', roles: 'Roles y Permisos',
  bitacora: 'Bitácora de Auditoría', config: 'Configuración General',
  departamentos: 'Departamentos y Unidades', poblacion: 'Población Registrada',
  'vista-notificaciones': 'Gestión de Notificaciones',
};
const tituloVista = computed(() => titulos[vistaActual.value] || 'Centro de Monitoreo');

const irA = (id) => { vistaActual.value = id; sidebarAbierto.value = false; };

export function useNavegacion() {
  return {
    vistaActual, sidebarAbierto, sidebarColapsado, logoError, toggleSidebar,
    mapaFullscreen, toggleMapaFullscreen,
    isDarkMode, toggleDarkMode,
    autenticado, perfilCargado, usuarioActual, nombreUsuario, rolUsuario, usuarioId,
    errorAuth, cargandoAuth,
    setAutenticado, iniciarSesion, cerrarSesion,
    navOperacion, navAdmin, titulos, tituloVista, irA,
  };
}
