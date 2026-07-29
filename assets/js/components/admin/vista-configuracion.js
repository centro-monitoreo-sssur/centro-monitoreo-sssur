// ============================================================
// COMPONENTE: Vista Configuración
// Panel de ajustes avanzados del sistema de monitoreo.
// Tabs: Categorías · Notificaciones · Mapa · Sistema · Seguridad · Exportación
// ============================================================
import { ref, computed, reactive } from '../../core/vue.js';
import { useConfiguracion } from '../../stores/configuracion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  name: 'vista-configuracion',
  setup() {
    const { config, guardado, DEFAULTS, TONOS, guardar, resetear, exportarJSON, importarJSON, probarTono } = useConfiguracion();
    const { tiposDenuncia } = useCatalogos();
    const { isDarkMode, toggleDarkMode } = useNavegacion();

    const tabActiva = ref('categorias');
    const tabs = [
      { id: 'categorias',     label: 'Dependencias',    icono: 'fa-layer-group' },
      { id: 'notificaciones', label: 'Notificaciones',  icono: 'fa-bell' },
      { id: 'mapa',           label: 'Mapa',            icono: 'fa-map' },
      { id: 'sistema',        label: 'Sistema',         icono: 'fa-sliders' },
      { id: 'acceso',         label: 'Acceso URL',      icono: 'fa-link' },
      { id: 'seguridad',      label: 'Seguridad',       icono: 'fa-shield-halved' },
      { id: 'exportacion',    label: 'Exportación',     icono: 'fa-file-export' },
    ];

    // ── Categorías ──────────────────────────────────────────
    // Trabajamos sobre una copia local reactiva de las categorías
    const catLocal = computed(() => {
      if (config.value.categorias) return config.value.categorias;
      return (tiposDenuncia.value || []).map(t => ({
        id: t.id, nombre: t.nombre, area: t.area,
        color: t.color_hex, icono: t.icono,
      }));
    });

    function actualizarColor(catId, nuevoColor) {
      if (!config.value.categorias) {
        config.value.categorias = catLocal.value.map(c => ({ ...c }));
      }
      const cat = config.value.categorias.find(c => c.id === catId);
      if (cat) cat.color = nuevoColor;
    }

    const ICONOS_DISPONIBLES = [
      'fa-users', 'fa-road', 'fa-tree', 'fa-trash-alt', 'fa-lightbulb',
      'fa-hard-hat', 'fa-water', 'fa-fire', 'fa-wrench', 'fa-wifi',
      'fa-car', 'fa-dog', 'fa-bolt', 'fa-leaf', 'fa-building',
      'fa-street-view', 'fa-triangle-exclamation', 'fa-circle-info',
    ];

    // ── Notificaciones ───────────────────────────────────────
    const tonoPreview = ref('');
    function previewTono(t) {
      tonoPreview.value = t;
      probarTono(t);
      setTimeout(() => { tonoPreview.value = ''; }, 1000);
    }

    const notifBrowser = ref(Notification?.permission === 'granted');
    async function solicitarPermisoNotif() {
      if (!('Notification' in window)) return;
      const perm = await Notification.requestPermission();
      notifBrowser.value = perm === 'granted';
      config.value.notificaciones.browserPush = perm === 'granted';
    }

    // ── Sesiones (demo) ──────────────────────────────────────
    const sesionesDemo = [
      { user: 'admin@sssur.gob.sv', ip: '192.168.1.12', fecha: '15-Jul-2026 13:45', agente: 'Chrome 126 / Windows', activa: true },
      { user: 'operador1@sssur.gob.sv', ip: '10.0.0.5', fecha: '15-Jul-2026 11:22', agente: 'Firefox 127 / Ubuntu', activa: false },
      { user: 'admin@sssur.gob.sv', ip: '192.168.1.12', fecha: '14-Jul-2026 17:08', agente: 'Chrome 126 / Windows', activa: false },
    ];

    // ── Importar JSON ────────────────────────────────────────
    const errorImport = ref('');
    function onFileImport(e) {
      const file = e.target.files[0];
      if (!file) return;
      importarJSON(file).then(() => {
        errorImport.value = '';
      }).catch(err => {
        errorImport.value = err.message;
      });
    }

    // ── Confirmación de Reset ────────────────────────────────
    const confirmarReset = ref(false);

    // ── Estilo de mapa legible ───────────────────────────────
    const estilosMapaOpciones = [
      { id: 'google',    label: 'Google Maps (Predeterminado)' },
      { id: 'satellite', label: 'Satélite (Google)' },
      { id: 'cartomap',  label: 'CartoDB Claro' },
      { id: 'darkmap',   label: 'CartoDB Oscuro' },
      { id: 'osm',       label: 'OpenStreetMap' },
    ];

    // ── Guardar con feedback ─────────────────────────────────
    function guardarYNotificar() {
      guardar();
    }

    return {
      config, guardado, tabActiva, tabs,
      catLocal, actualizarColor, ICONOS_DISPONIBLES,
      tonoPreview, previewTono, TONOS,
      notifBrowser, solicitarPermisoNotif,
      sesionesDemo,
      errorImport, onFileImport,
      confirmarReset, resetear, exportarJSON,
      estilosMapaOpciones,
      guardarYNotificar,
      isDarkMode, toggleDarkMode,
    };
  },
};
