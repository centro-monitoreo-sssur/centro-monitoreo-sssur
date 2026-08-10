// ============================================================
// Registro central de componentes.
// Cada entrada asocia el componente JS con su plantilla HTML.
// Los paths de 'tpl' incluyen la subcarpeta para template-loader.
// ============================================================

// ── SHARED ───────────────────────────────────────────────────
import appRoot           from './shared/app-root.js';
import appSidebar        from './shared/app-sidebar.js';
import appTopbar         from './shared/app-topbar.js';
import bottomTabBar      from './shared/bottom-tab-bar.js';
import modalConfirmacion from './shared/modal-confirmacion.js';
import vistaLogin        from './shared/vista-login.js';
import vistaPlaceholder  from './shared/vista-placeholder.js';

// ── SHARED · primitivas de UI ────────────────────────────────
// Se registran globalmente: las usan vistas de los tres portales y pasarlas
// como dependencia local en cada componente sería ruido sin ganancia.
import uiBoton  from './shared/ui/ui-boton.js';
import uiBadge  from './shared/ui/ui-badge.js';
import uiCard   from './shared/ui/ui-card.js';
import uiInput  from './shared/ui/ui-input.js';
import uiSelect from './shared/ui/ui-select.js';
import uiModal  from './shared/ui/ui-modal.js';
import uiTabla  from './shared/ui/ui-tabla.js';

// ── ADMIN ────────────────────────────────────────────────────
import vistaDashboard     from './admin/vista-dashboard.js';
import vistaMapa          from './admin/vista-mapa.js';
import vistaReportes      from './admin/vista-reportes.js';
import vistaCartograma    from './admin/vista-cartograma.js';
import vistaConfiguracion from './admin/vista-configuracion.js';
import vistaDenuncias     from './admin/vista-denuncias.js';
import vistaIntervenciones from './admin/vista-intervenciones.js';
import vistaUsuarios      from './admin/vista-usuarios.js';
import vistaRoles         from './admin/vista-roles.js';
import vistaBitacora      from './admin/vista-bitacora.js';
import vistaDepartamentos from './admin/vista-departamentos.js';
import vistaPoblacion     from './admin/vista-poblacion.js';
import vistaNotificaciones from './admin/vista-notificaciones.js';
// Piezas de la consola de monitoreo territorial
import barraTerritorial  from './admin/mapa/barra-territorial.js';
import tableroDistritos  from './admin/mapa/tablero-distritos.js';

// ── EMPLEADOS ────────────────────────────────────────────────
import vistaPwaEmpleado          from './empleados/vista-pwa-empleado.js';
import vistaMapaVivo             from './empleados/vista-mapa-vivo.js';
import vistaMisIntervenciones    from './empleados/vista-mis-intervenciones.js';
import vistaDetalleIntervencion  from './empleados/vista-detalle-intervencion.js';
import vistaCierreIncidente      from './empleados/vista-cierre-incidente.js';
import vistaLevantarDenuncia     from './empleados/vista-levantar-denuncia.js';
import vistaBuzonOffline         from './empleados/vista-buzon-offline.js';
import vistaMiPerfilEmpleado     from './empleados/vista-mi-perfil-empleado.js';
import vistaBitacoraEmpleado     from './empleados/vista-bitacora-empleado.js';
import vistaNotificacionesEmpleado from './empleados/vista-notificaciones.js';

// ── POBLACIÓN ────────────────────────────────────────────────
import vistaPwaPoblacion        from './poblacion/vista-pwa-poblacion.js';
import vistaCrearDenuncia       from './poblacion/vista-crear-denuncia.js';
import vistaMisDenuncias        from './poblacion/vista-mis-denuncias.js';
import vistaDetalleDenuncia     from './poblacion/vista-detalle-denuncia.js';
import vistaMapaDistrito        from './poblacion/vista-mapa-distrito.js';
import vistaNoticias            from './poblacion/vista-noticias.js';
import vistaMiPerfilPoblacion   from './poblacion/vista-mi-perfil-poblacion.js';
import vistaRegistroPoblacion   from './poblacion/vista-registro-poblacion.js';

export const componentes = {
  // ── SHARED ─────────────────────────────────────────────────
  'app-root':               { comp: appRoot,               tpl: 'shared/app-root' },
  'app-sidebar':            { comp: appSidebar,            tpl: 'shared/app-sidebar' },
  'app-topbar':             { comp: appTopbar,             tpl: 'shared/app-topbar' },
  'bottom-tab-bar':         { comp: bottomTabBar,          tpl: 'shared/bottom-tab-bar' },
  'modal-confirmacion':     { comp: modalConfirmacion,     tpl: 'shared/modal-confirmacion' },
  'vista-login':            { comp: vistaLogin,            tpl: 'shared/vista-login' },
  'vista-placeholder':      { comp: vistaPlaceholder,      tpl: 'shared/vista-placeholder' },

  // ── SHARED · primitivas de UI ──────────────────────────────
  'ui-boton':               { comp: uiBoton,               tpl: 'shared/ui/ui-boton' },
  'ui-badge':               { comp: uiBadge,               tpl: 'shared/ui/ui-badge' },
  'ui-card':                { comp: uiCard,                tpl: 'shared/ui/ui-card' },
  'ui-input':               { comp: uiInput,               tpl: 'shared/ui/ui-input' },
  'ui-select':              { comp: uiSelect,              tpl: 'shared/ui/ui-select' },
  'ui-modal':               { comp: uiModal,               tpl: 'shared/ui/ui-modal' },
  'ui-tabla':               { comp: uiTabla,               tpl: 'shared/ui/ui-tabla' },

  // ── ADMIN ──────────────────────────────────────────────────
  'vista-dashboard':        { comp: vistaDashboard,        tpl: 'admin/vista-dashboard' },
  'vista-mapa':             { comp: vistaMapa,             tpl: 'admin/vista-mapa' },
  'vista-cartograma':       { comp: vistaCartograma,       tpl: 'admin/vista-cartograma' },
  'vista-reportes':         { comp: vistaReportes,         tpl: 'admin/vista-reportes' },
  'vista-configuracion':    { comp: vistaConfiguracion,    tpl: 'admin/vista-configuracion' },
  'vista-denuncias':        { comp: vistaDenuncias,        tpl: 'admin/vista-denuncias' },
  'vista-intervenciones':   { comp: vistaIntervenciones,   tpl: 'admin/vista-intervenciones' },
  'vista-usuarios':         { comp: vistaUsuarios,         tpl: 'admin/vista-usuarios' },
  'vista-roles':            { comp: vistaRoles,            tpl: 'admin/vista-roles' },
  'vista-bitacora':         { comp: vistaBitacora,         tpl: 'admin/vista-bitacora' },
  'vista-departamentos':    { comp: vistaDepartamentos,    tpl: 'admin/vista-departamentos' },
  'vista-poblacion':        { comp: vistaPoblacion,        tpl: 'admin/vista-poblacion' },
  'vista-notificaciones':    { comp: vistaNotificaciones,   tpl: 'admin/vista-notificaciones' },

  // ── ADMIN · piezas de la consola de monitoreo territorial ──
  'barra-territorial':      { comp: barraTerritorial,      tpl: 'admin/mapa/barra-territorial' },
  'tablero-distritos':      { comp: tableroDistritos,      tpl: 'admin/mapa/tablero-distritos' },

  // ── EMPLEADOS ──────────────────────────────────────────────
  'vista-pwa-empleado':         { comp: vistaPwaEmpleado,         tpl: 'empleados/vista-pwa-empleado' },
  'vista-mapa-vivo':            { comp: vistaMapaVivo,            tpl: 'empleados/vista-mapa-vivo' },
  'vista-mis-intervenciones':   { comp: vistaMisIntervenciones,   tpl: 'empleados/vista-mis-intervenciones' },
  'vista-detalle-intervencion': { comp: vistaDetalleIntervencion, tpl: 'empleados/vista-detalle-intervencion' },
  'vista-cierre-incidente':     { comp: vistaCierreIncidente,     tpl: 'empleados/vista-cierre-incidente' },
  'vista-levantar-denuncia':    { comp: vistaLevantarDenuncia,    tpl: 'empleados/vista-levantar-denuncia' },
  'vista-buzon-offline':        { comp: vistaBuzonOffline,        tpl: 'empleados/vista-buzon-offline' },
  'vista-mi-perfil-empleado':   { comp: vistaMiPerfilEmpleado,    tpl: 'empleados/vista-mi-perfil-empleado' },
  'vista-bitacora-empleado':    { comp: vistaBitacoraEmpleado,    tpl: 'empleados/vista-bitacora-empleado' },
  'vista-notificaciones-empleado': { comp: vistaNotificacionesEmpleado, tpl: 'empleados/vista-notificaciones' },

  // ── POBLACIÓN ──────────────────────────────────────────────
  'vista-pwa-poblacion':        { comp: vistaPwaPoblacion,        tpl: 'poblacion/vista-pwa-poblacion' },
  'vista-crear-denuncia':       { comp: vistaCrearDenuncia,       tpl: 'poblacion/vista-crear-denuncia' },
  'vista-mis-denuncias':        { comp: vistaMisDenuncias,        tpl: 'poblacion/vista-mis-denuncias' },
  'vista-detalle-denuncia':     { comp: vistaDetalleDenuncia,     tpl: 'poblacion/vista-detalle-denuncia' },
  'vista-mapa-distrito':        { comp: vistaMapaDistrito,        tpl: 'poblacion/vista-mapa-distrito' },
  'vista-noticias':             { comp: vistaNoticias,            tpl: 'poblacion/vista-noticias' },
  'vista-mi-perfil-poblacion':  { comp: vistaMiPerfilPoblacion,   tpl: 'poblacion/vista-mi-perfil-poblacion' },
  'vista-registro-poblacion':   { comp: vistaRegistroPoblacion,   tpl: 'poblacion/vista-registro-poblacion' },
};
