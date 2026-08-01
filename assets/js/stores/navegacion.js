// ============================================================
// STORE: navegación / shell
// Vista activa, sidebar móvil, logo y definición del menú. El badge del
// nav de denuncias depende del store de denuncias (sin acoplar vistas).
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { almacen, almacenDispositivo } from '../core/almacen.js';
import { useDenuncias } from './denuncias.js';
import { usePermisos } from './permisos.js';

// Nombres de las claves persistidas, en un solo sitio. Estaban repetidas como
// literales en catorce llamadas distintas, y una errata en cualquiera de ellas
// no falla: simplemente escribe en una clave que nadie lee después.
const CLAVES = Object.freeze({
  SESION_ACTIVA: 'sesion_activa',
  USUARIO: 'usuario_autenticado',
  NOMBRE: 'nombre_usuario',
  ROL: 'rol_usuario',
  USUARIO_ID: 'usuario_id',
  GRUPOS_ABIERTOS: 'sidebar_grupos_abiertos',
});

// El tema NO lleva prefijo de contexto: es una preferencia de quien mira la
// pantalla, no de la app abierta, y además la lee un script en línea de
// index.html antes de que cargue ningún módulo (anti-FOUC).
const CLAVE_TEMA = 'color-theme';

const vistaActual = ref('login'); // Iniciar en login por defecto
const sidebarAbierto = ref(false);
const sidebarColapsado = ref(false); // estado de colapso en escritorio (estilo Flowbite)
const logoError = ref(false);

// Estado de Dark Mode (Por defecto light mode, a menos que se active expresamente)
const isDarkMode = ref(almacenDispositivo.leerTexto(CLAVE_TEMA) === 'dark');

// Estado de autenticación. Es un espejo local de la sesión de Supabase que
// evita el parpadeo del login al recargar; la sesión real vive en la clave
// `sb-sssur-<contexto>` que gestiona el SDK.
const autenticado = ref(almacen.leerTexto(CLAVES.SESION_ACTIVA) === 'true');
const usuarioActual = ref(almacen.leerTexto(CLAVES.USUARIO));
// Nombre y apellido reales del perfil en public.usuarios. `usuarioActual` es el
// correo institucional y no sirve para saludar: no tiene espacios, así que en
// un titular grande desborda el layout en móvil.
const nombreUsuario = ref(almacen.leerTexto(CLAVES.NOMBRE));
const rolUsuario = ref(almacen.leerTexto(CLAVES.ROL));
// UUID de Supabase Auth — necesario para filtrar casos por usuario_responsable_id
const usuarioId = ref(almacen.leerTexto(CLAVES.USUARIO_ID));
// Adscripción organizacional y territorial del perfil. No se persisten: se
// releen en cada `onAuthStateChange`, así que un cambio de departamento surte
// efecto en la siguiente sesión sin arrastrar un valor rancio del almacén.
const departamentoUsuario = ref(null);
const distritoUsuario = ref(null);

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
      almacen.escribirTexto(CLAVES.SESION_ACTIVA, 'true');
      if (usuario) { almacen.escribirTexto(CLAVES.USUARIO, usuario); usuarioActual.value = usuario; }
      if (rol)     { almacen.escribirTexto(CLAVES.ROL, rol); rolUsuario.value = rol; }
    } else {
      almacen.borrarVarias([CLAVES.SESION_ACTIVA, CLAVES.USUARIO, CLAVES.ROL, CLAVES.NOMBRE]);
      usuarioActual.value = '';
      rolUsuario.value = '';
      nombreUsuario.value = '';
    }
    return { ok: true };
  }
  return { ok: true };
};

// Traduce lo que el usuario escribió al correo con el que Supabase Auth puede
// autenticar. Supabase SOLO acepta correo o teléfono: un `usuarios.username`
// enviado tal cual falla siempre con "Invalid login credentials", que es el
// mismo mensaje que una contraseña equivocada.
//
// Degrada sin romper: si `resolver_identificador_login` no existe todavía
// (migration_v17 sin aplicar), se usa lo escrito tal cual y el acceso por
// correo sigue funcionando exactamente como antes.
const resolverIdentificador = async (identificador) => {
  const texto = String(identificador || '').trim();
  if (!db) return { email: texto };

  try {
    const { data, error } = await db.rpc('resolver_identificador_login', {
      p_identificador: texto,
    });
    if (error) throw error;

    if (!data) {
      // Sin coincidencia. Si escribió un correo puede ser de auth.users sin
      // perfil en public.usuarios, así que se deja pasar y decide Supabase.
      return texto.includes('@')
        ? { email: texto }
        : { email: null, motivo: 'No existe ningún usuario con ese nombre de usuario.' };
    }
    if (data.activo === false) {
      return { email: null, motivo: 'Esta cuenta está desactivada. Contacta al administrador.' };
    }
    if (data.tiene_cuenta === false) {
      // El perfil se sembró por SQL sin crear la cuenta de acceso. Con
      // cualquier contraseña habría dado "credenciales incorrectas".
      return {
        email: null,
        motivo: 'Este usuario tiene perfil pero no tiene cuenta de acceso creada. ' +
                'Debe darse de alta desde Administración → Usuarios.',
      };
    }
    return { email: data.email || texto };
  } catch (e) {
    const faltaLaFuncion = /function|does not exist|not find/i.test(e.message || '');
    if (!faltaLaFuncion) console.error('[navegacion] Fallo al resolver el identificador:', e.message);
    else if (!texto.includes('@')) {
      console.warn(
        '[navegacion] `resolver_identificador_login` no existe: el acceso por ' +
        'nombre de usuario requiere database/migration_v17_login_por_username.sql. ' +
        'Mientras tanto solo funciona el correo institucional.'
      );
    }
    return { email: texto };
  }
};

// Inicio de sesión real via Supabase Auth. `identificador` puede ser el correo
// institucional o el username.
const iniciarSesion = async (identificador, password) => {
  errorAuth.value = '';
  cargandoAuth.value = true;
  const email = identificador;
  try {
    if (!db) {
      // Fallback demo: buscar en credenciales locales
      const match = DEMO_CREDENCIALES.find((c) => c.usuario === email && c.clave === password);
      if (!match) throw new Error('Credenciales incorrectas');
      autenticado.value = true;
      usuarioActual.value = match.usuario;
      rolUsuario.value = match.rol;
      almacen.escribirTexto(CLAVES.SESION_ACTIVA, 'true');
      almacen.escribirTexto(CLAVES.USUARIO, match.usuario);
      almacen.escribirTexto(CLAVES.ROL, match.rol);
      vistaActual.value = match.vista;
      return { ok: true };
    }
    const resuelto = await resolverIdentificador(identificador);
    if (!resuelto.email) {
      // Motivo concreto en vez del genérico de Supabase.
      errorAuth.value = resuelto.motivo || 'Usuario no encontrado.';
      return { ok: false, error: new Error(errorAuth.value) };
    }

    const { data, error } = await db.auth.signInWithPassword({
      email: resuelto.email,
      password,
    });
    if (error) throw error;
    // El rol y el perfil se leen en el listener onAuthStateChange
    return { ok: true, data };
  } catch (e) {
    // El mensaje de Supabase llega en inglés y es el mismo para contraseña
    // incorrecta y correo inexistente; aquí ya sabemos que el usuario existe.
    const credencialesMal = /invalid login credentials/i.test(e.message || '');
    const sinConfirmar = /email not confirmed/i.test(e.message || '');
    errorAuth.value = credencialesMal
      ? 'Contraseña incorrecta.'
      : sinConfirmar
        ? 'La cuenta existe pero el correo no ha sido confirmado. Desactiva "Confirm email" en Supabase o confirma desde el enlace enviado.'
        : (e.message || 'Error al iniciar sesión');
    return { ok: false, error: e };
  } finally {
    cargandoAuth.value = false;
  }
};

const { limpiarAlcance, puedeVer } = usePermisos();

const cerrarSesion = async () => {
  // `scope: 'local'` cierra SOLO esta aplicación. Por defecto Supabase usa
  // 'global', que revoca todos los refresh tokens del usuario: un supervisor
  // que sale de la PWA de campo se encontraría con la sesión del Centro de
  // Monitoreo caída en la otra pestaña, y no es lo que ha pedido. La sesión de
  // cada contexto vive en su propia clave, así que cerrarlas por separado es
  // coherente con el aislamiento (ver core/app-contexto.js).
  if (db) await db.auth.signOut({ scope: 'local' });
  autenticado.value = false;
  perfilCargado.value = false;
  // Sin esto el siguiente usuario hereda el alcance territorial del anterior
  // hasta que `mi_alcance()` responda: una jefatura distrital vería por un
  // instante el comparativo de los 5 distritos.
  limpiarAlcance();
  usuarioActual.value = '';
  rolUsuario.value = '';
  nombreUsuario.value = '';
  // Se borran claves concretas y NO `almacen.limpiarTodo()`: un barrido se
  // llevaría por delante la cola offline, y un empleado que cierra sesión al
  // final de la jornada perdería los partes que levantó sin señal.
  almacen.borrarVarias([
    CLAVES.SESION_ACTIVA, CLAVES.USUARIO, CLAVES.ROL, CLAVES.NOMBRE, CLAVES.USUARIO_ID,
  ]);
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
      almacen.escribirTexto(CLAVES.USUARIO_ID, session.user.id);
      almacen.escribirTexto(CLAVES.SESION_ACTIVA, 'true');
      almacen.escribirTexto(CLAVES.USUARIO, session.user.email);
      try {
        // Leer rol desde la tabla `usuarios` usando el UUID de Supabase Auth
        // `departamento_id` y `distrito_id` alimentan la adscripción que muestra
        // la PWA de campo. Sin ellos, la pantalla de inicio del empleado decía
        // "Municipalidad" y "No asignada" para todo el mundo, porque los leía de
        // una clave de localStorage que no escribía nadie.
        const { data: perfil, error } = await db
          .from('usuarios')
          .select('rol_id, nombres, apellidos, departamento_id, distrito_id, roles(codigo)')
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
        if (codigoRol) almacen.escribirTexto(CLAVES.ROL, codigoRol);
        else almacen.borrar(CLAVES.ROL);

        // El nombre del perfil se consultaba y se descartaba, así que la UI
        // terminaba saludando con el correo institucional completo.
        nombreUsuario.value = [perfil?.nombres, perfil?.apellidos].filter(Boolean).join(' ').trim();
        if (nombreUsuario.value) almacen.escribirTexto(CLAVES.NOMBRE, nombreUsuario.value);

        departamentoUsuario.value = perfil?.departamento_id ?? null;
        distritoUsuario.value = perfil?.distrito_id ?? null;
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
      // Cerrar el canal de tiempo real aquí y no en `cerrarSesion()`: esta rama
      // cubre TODAS las formas de perder la sesión —botón de salir, caducidad
      // del token, cierre desde otro dispositivo—, no solo la voluntaria.
      desuscribirRealtime();
      limpiarAlcance();
      usuarioActual.value = '';
      rolUsuario.value = '';
      nombreUsuario.value = '';
      usuarioId.value = '';
      almacen.borrarVarias([
        CLAVES.SESION_ACTIVA, CLAVES.USUARIO, CLAVES.ROL, CLAVES.NOMBRE, CLAVES.USUARIO_ID,
      ]);
      vistaActual.value = 'login';
    }
  });
}

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
    almacenDispositivo.escribirTexto(CLAVE_TEMA, 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    almacenDispositivo.escribirTexto(CLAVE_TEMA, 'light');
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

const { denunciasPendientesCount, desuscribirRealtime } = useDenuncias();

// ── Menú por grupos ──────────────────────────────────────────
// `modulo` es el `codigo_modulo` de public.permisos_modulos, que es lo que
// evalúan tanto las policies como `roles_permisos`. Es la clave que conecta el
// menú con el modelo de permisos; sin ella el sidebar era una lista fija que
// ofrecía módulos donde el usuario solo encontraba tablas vacías.
//
// Ojo: el módulo de denuncias se llama 'casos' en la BD aunque la UI lo muestre
// como "Gestión de Denuncias". Cartograma comparte módulo con el mapa.
const gruposNav = [
  {
    id: 'operacion',
    label: 'Operación',
    icono: 'fa-tower-broadcast',
    items: [
      { id: 'dashboard',      label: 'Dashboard',            icono: 'fa-chart-pie',       modulo: 'dashboard' },
      { id: 'mapa',           label: 'Mapa en Vivo',         icono: 'fa-map-marked-alt',  modulo: 'mapa' },
      { id: 'cartograma',     label: 'Cartograma',           icono: 'fa-map',             modulo: 'mapa' },
      { id: 'denuncias',      label: 'Gestión de Denuncias', icono: 'fa-clipboard-list',  modulo: 'casos',
        badge: () => denunciasPendientesCount.value || null },
      { id: 'intervenciones', label: 'Intervenciones',       icono: 'fa-hard-hat',        modulo: 'intervenciones' },
      { id: 'reportes',       label: 'Reportes',             icono: 'fa-chart-line',      modulo: 'reportes' },
    ],
  },
  {
    id: 'organizacion',
    label: 'Organización',
    icono: 'fa-sitemap',
    // Direcciones, Distritos y Cuadrillas entran en este grupo cuando existan
    // sus vistas. No se listan todavía: una entrada de menú que no abre nada
    // es peor que una ausencia.
    items: [
      { id: 'departamentos', label: 'Departamentos', icono: 'fa-building',    modulo: 'config' },
      { id: 'usuarios',      label: 'Usuarios',      icono: 'fa-user-shield', modulo: 'usuarios' },
    ],
  },
  {
    id: 'ciudadania',
    label: 'Ciudadanía',
    icono: 'fa-people-roof',
    items: [
      { id: 'poblacion',            label: 'Población Registrada', icono: 'fa-users', modulo: 'poblacion' },
      { id: 'vista-notificaciones', label: 'Notificaciones',       icono: 'fa-bell',  modulo: 'config' },
    ],
  },
  {
    id: 'seguridad',
    label: 'Seguridad y Sistema',
    icono: 'fa-shield-halved',
    items: [
      { id: 'roles',    label: 'Roles y Permisos',      icono: 'fa-lock',    modulo: 'usuarios' },
      { id: 'bitacora', label: 'Bitácora de Auditoría', icono: 'fa-history', modulo: 'config' },
      { id: 'config',   label: 'Configuración',         icono: 'fa-cog',     modulo: 'config' },
    ],
  },
];

// Grupos con al menos un ítem visible. Un grupo que se queda sin hijos
// desaparece entero: dejar el encabezado de un acordeón vacío sugiere que
// falta cargar algo.
const gruposVisibles = computed(() =>
  gruposNav
    .map((g) => ({ ...g, items: g.items.filter((i) => puedeVer(i.modulo)) }))
    .filter((g) => g.items.length > 0)
);

// Plano y ya filtrado. Lo usa el sidebar colapsado, donde no hay acordeón
// porque a 76 px no caben los encabezados de grupo.
const navPlano = computed(() => gruposVisibles.value.flatMap((g) => g.items));

// ── Estado del acordeón ──────────────────────────────────────
const leerGruposAbiertos = () => {
  // `almacen.leerJson` ya absorbe el JSON corrupto; aquí solo queda validar que
  // lo guardado siga siendo una lista.
  const guardado = almacen.leerJson(CLAVES.GRUPOS_ABIERTOS);
  return Array.isArray(guardado) ? guardado : ['operacion']; // el grupo diario arranca abierto
};
const gruposAbiertos = ref(leerGruposAbiertos());

const toggleGrupo = (id) => {
  const i = gruposAbiertos.value.indexOf(id);
  if (i === -1) gruposAbiertos.value.push(id);
  else gruposAbiertos.value.splice(i, 1);
  almacen.escribirJson(CLAVES.GRUPOS_ABIERTOS, gruposAbiertos.value);
};

const grupoAbierto = (id) => gruposAbiertos.value.includes(id);

// El grupo que contiene la vista activa siempre se dibuja abierto, aunque el
// usuario lo hubiera cerrado: si no, al navegar el menú no refleja dónde está.
const grupoDeVista = computed(() =>
  gruposNav.find((g) => g.items.some((i) => i.id === vistaActual.value))?.id || null
);
const grupoVisible = (id) => grupoAbierto(id) || grupoDeVista.value === id;

const titulos = {
  dashboard: 'Panel Principal', mapa: 'Mapa en Vivo', denuncias: 'Gestión de Denuncias',
  intervenciones: 'Intervenciones Activas', reportes: 'Reportes y Analítica',
  usuarios: 'Usuarios del Sistema', roles: 'Roles y Permisos',
  bitacora: 'Bitácora de Auditoría', config: 'Configuración General',
  departamentos: 'Departamentos y Unidades', poblacion: 'Población Registrada',
  'vista-notificaciones': 'Gestión de Notificaciones',
  cartograma: 'Cartograma Territorial',   // faltaba: la topbar mostraba el genérico
};
const tituloVista = computed(() => titulos[vistaActual.value] || 'Centro de Monitoreo');

const irA = (id) => { vistaActual.value = id; sidebarAbierto.value = false; };

export function useNavegacion() {
  return {
    vistaActual, sidebarAbierto, sidebarColapsado, logoError, toggleSidebar,
    mapaFullscreen, toggleMapaFullscreen,
    isDarkMode, toggleDarkMode,
    autenticado, perfilCargado, usuarioActual, nombreUsuario, rolUsuario, usuarioId,
    departamentoUsuario, distritoUsuario,
    errorAuth, cargandoAuth,
    setAutenticado, iniciarSesion, cerrarSesion,
    gruposVisibles, navPlano, grupoVisible, toggleGrupo,
    titulos, tituloVista, irA,
  };
}
