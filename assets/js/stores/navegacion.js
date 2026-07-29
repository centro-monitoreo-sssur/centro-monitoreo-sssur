// ============================================================
// STORE: navegación / shell
// Vista activa, sidebar móvil, logo y definición del menú. El badge del
// nav de denuncias depende del store de denuncias (sin acoplar vistas).
// ============================================================
import { ref, computed } from '../core/vue.js';
import { useDenuncias } from './denuncias.js';

const vistaActual = ref('login'); // Iniciar en login por defecto
const sidebarAbierto = ref(false);
const sidebarColapsado = ref(false); // estado de colapso en escritorio (estilo Flowbite)
const logoError = ref(false);

// Estado de Dark Mode (Por defecto light mode, a menos que se active expresamente)
const isDarkMode = ref(localStorage.getItem('color-theme') === 'dark');

// Estado de autenticación (DEMO: persistencia en localStorage)
const autenticado = ref(localStorage.getItem('sesion_activa') === 'true');
const usuarioActual = ref(localStorage.getItem('usuario_autenticado') || '');
const rolUsuario = ref(localStorage.getItem('rol_usuario') || '');

const setAutenticado = (valor, usuario = '', rol = '') => {
  autenticado.value = valor;
  if (valor) {
    localStorage.setItem('sesion_activa', 'true');
    if (usuario) {
      localStorage.setItem('usuario_autenticado', usuario);
      usuarioActual.value = usuario;
    }
    if (rol) {
      localStorage.setItem('rol_usuario', rol);
      rolUsuario.value = rol;
    }
  } else {
    localStorage.removeItem('sesion_activa');
    localStorage.removeItem('usuario_autenticado');
    localStorage.removeItem('rol_usuario');
    usuarioActual.value = '';
    rolUsuario.value = '';
  }
};

const cerrarSesion = () => {
  setAutenticado(false);
  vistaActual.value = 'login';
};

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
    autenticado, usuarioActual, rolUsuario, setAutenticado, cerrarSesion,
    navOperacion, navAdmin, titulos, tituloVista, irA,
  };
}
