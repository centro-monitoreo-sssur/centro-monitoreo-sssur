// ============================================================
// COMPONENTE: Vista Configuración
// Panel de ajustes avanzados del sistema de monitoreo.
// Tabs: Categorías · Notificaciones · Mapa · Sistema · Seguridad · Exportación
// ============================================================
import { ref, computed, reactive, onMounted } from '../../core/vue.js';
import { useConfiguracion } from '../../stores/configuracion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useDiagnostico } from '../../stores/diagnostico.js';
import { db } from '../../core/supabase.js';
// Catálogos declarativos del Mapa en Vivo. La pestaña "Mapa" configura el
// estado inicial de la consola, así que lee del mismo sitio que la consola
// para que las dos no puedan divergir.
import { HERRAMIENTAS } from '../../config/mapa/herramientas-mapa.js';
import { ESTADOS_FILTRO, VENTANAS_TIEMPO, COLUMNAS_COMPARATIVO }
  from '../../config/mapa/filtros-territoriales.js';

export default {
  name: 'vista-configuracion',
  setup() {
    const {
      config, guardado, DEFAULTS, TONOS, GRUPOS_TONO,
      guardar, resetear, exportarJSON, importarJSON, probarTono,
    } = useConfiguracion();

    // ── Paleta de indicadores ────────────────────────────────
    // Etiquetas legibles para cada clave semántica. La clave es la que viaja a
    // la variable CSS; el texto es lo que ve el administrador.
    const CAMPOS_KPI = [
      { clave: 'total',     etiqueta: 'Total de casos',   donde: 'Dashboard · Reportes' },
      { clave: 'pendiente', etiqueta: 'Pendientes',       donde: 'Dashboard · Mapa · Reportes' },
      { clave: 'enCurso',   etiqueta: 'En curso',         donde: 'Dashboard · Mapa · Reportes' },
      { clave: 'resuelta',  etiqueta: 'Resueltas',        donde: 'Dashboard · Mapa · Reportes' },
      { clave: 'vencida',   etiqueta: 'Fuera de objetivo', donde: 'Tablero de distritos' },
      { clave: 'neutro',    etiqueta: 'Neutro / sin dato', donde: 'Todas las vistas' },
    ];

    const CAMPOS_SEMAFORO = [
      { clave: 'ok',       etiqueta: 'Dentro de objetivo' },
      { clave: 'atencion', etiqueta: 'Requiere atención' },
      { clave: 'alerta',   etiqueta: 'En alerta' },
      { clave: 'critico',  etiqueta: 'Crítico' },
    ];

    // Paletas listas para aplicar de una vez. Las tres están comprobadas para
    // mantener contraste suficiente sobre fondo claro y oscuro.
    const PALETAS = [
      { id: 'institucional', nombre: 'Institucional',
        kpi: { total: '#3b82f6', pendiente: '#ef4444', enCurso: '#f59e0b', resuelta: '#10b981', vencida: '#dc2626', neutro: '#64748b' },
        graficos: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'] },
      { id: 'sobrio', nombre: 'Sobrio',
        kpi: { total: '#475569', pendiente: '#b91c1c', enCurso: '#b45309', resuelta: '#047857', vencida: '#991b1b', neutro: '#94a3b8' },
        graficos: ['#475569', '#0f766e', '#b45309', '#7e22ce', '#b91c1c', '#0e7490', '#a21caf', '#4d7c0f', '#c2410c', '#4338ca'] },
      { id: 'accesible', nombre: 'Alto contraste',
        // Paleta segura para deuteranopía y protanopía: evita el par rojo/verde
        // como única diferencia entre estados contiguos.
        kpi: { total: '#0072b2', pendiente: '#d55e00', enCurso: '#e69f00', resuelta: '#009e73', vencida: '#cc79a7', neutro: '#525252' },
        graficos: ['#0072b2', '#009e73', '#e69f00', '#cc79a7', '#d55e00', '#56b4e9', '#f0e442', '#000000', '#8c8c8c', '#7570b3'] },
    ];

    function aplicarPaleta(paleta) {
      config.value.colores.kpi = { ...paleta.kpi };
      config.value.colores.graficos = [...paleta.graficos];
    }

    function restablecerColores() {
      config.value.colores = structuredClone(DEFAULTS.colores);
    }

    function actualizarSerie(indice, valor) {
      // Reasignar el array completo: mutar por índice no siempre dispara el
      // `watch` profundo que publica las variables CSS.
      const copia = [...config.value.colores.graficos];
      copia[indice] = valor;
      config.value.colores.graficos = copia;
    }
    const { tiposDenuncia } = useCatalogos();
    const { isDarkMode, toggleDarkMode } = useNavegacion();

    const {
      resultados: chequeos, ejecutando: diagEjecutando, ultimaEjecucion: diagUltima,
      ejecutar: ejecutarDiagnostico, criticos, avisos, correctos, desconocidos,
      porGrupo, salud, claseEstado, iconoEstado,
    } = useDiagnostico();

    // Arranca en Diagnóstico: es lo primero que un superadmin quiere saber al
    // entrar a Configuración, y hasta ahora no había forma de saberlo sin
    // abrir el SQL Editor de Supabase.
    const tabActiva = ref('diagnostico');
    const tabs = [
      { id: 'diagnostico',    label: 'Diagnóstico',     icono: 'fa-stethoscope' },
      // Renombrada: ya no son solo las dependencias, también la paleta de
      // indicadores y gráficos de todas las vistas.
      { id: 'categorias',     label: 'Apariencia',      icono: 'fa-palette' },
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
        id: t.id, 
        nombre: t.nombre, 
        area: t.departamento_responsable_id ? t.departamento_responsable_id : (t.area || 'General'),
        color: t.color_hex, 
        icono: t.icono,
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

    // ── Acordeón de las tarjetas de configuración ────────────
    // Cada pestaña apila varias tarjetas y llegaron a ser demasiadas para
    // recorrerlas a scroll. Plegarlas deja visible el índice de lo que se puede
    // configurar, que es lo que uno busca al entrar.
    const CLAVE_SECCIONES = 'config_secciones_abiertas';
    const leerSeccionesAbiertas = () => {
      try {
        const guardado = JSON.parse(localStorage.getItem(CLAVE_SECCIONES));
        if (Array.isArray(guardado)) return guardado;
      } catch { /* JSON corrupto: se ignora */ }
      return ['mapa-paneles'];   // la primera abierta para que no parezca vacío
    };
    const seccionesAbiertas = ref(leerSeccionesAbiertas());

    const seccionAbierta = (id) => seccionesAbiertas.value.includes(id);

    const toggleSeccion = (id) => {
      const i = seccionesAbiertas.value.indexOf(id);
      if (i === -1) seccionesAbiertas.value.push(id);
      else seccionesAbiertas.value.splice(i, 1);
      localStorage.setItem(CLAVE_SECCIONES, JSON.stringify(seccionesAbiertas.value));
    };

    // ── Mapa en Vivo ─────────────────────────────────────────
    // Etiquetas de los paneles. Las claves coinciden con `config.mapa` y con
    // lo que lee `estadoInicialPaneles()` en config/mapa/paneles-mapa.js.
    const AJUSTES_PANELES = [
      { clave: 'panelFeedAbierto',      etiqueta: 'Feed de incidencias abierto', ayuda: 'Panel izquierdo con la cola priorizada' },
      { clave: 'panelCapasAbierto',     etiqueta: 'Panel de capas abierto',      ayuda: 'Panel derecho con tipos, tramos e intervenciones' },
      { clave: 'kpisVisiblesMovil',     etiqueta: 'Franja de KPIs en móvil',     ayuda: 'En escritorio siempre está visible' },
      { clave: 'acordeonTipos',         etiqueta: 'Desplegar «Tipos de denuncia»', ayuda: 'Sección del panel de capas' },
      { clave: 'acordeonTramos',        etiqueta: 'Desplegar «Tramos en obra»',    ayuda: 'Sección del panel de capas' },
      { clave: 'acordeonIntervenciones', etiqueta: 'Desplegar «Intervenciones»',   ayuda: 'Sección del panel de capas' },
    ];

    // Solo las herramientas configurables: las de dibujo tienen `claveConfig`
    // en null porque no pueden arrancar encendidas.
    const AJUSTES_HERRAMIENTAS = HERRAMIENTAS
      .filter((h) => h.claveConfig)
      .map((h) => ({ clave: h.claveConfig, etiqueta: h.nombre, icono: h.icono, ayuda: h.ayuda }));

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

    // ── Accesos recientes ────────────────────────────────────
    // Esto era un array literal con correos, IPs y fechas de julio de 2026
    // escritos a mano, presentado en la pestaña de Seguridad como si fuera un
    // registro de accesos. Un dato de auditoría inventado es peor que ninguno:
    // se toman decisiones sobre él. Ahora sale de `bitacora_auditoria`.
    const sesiones = ref([]);
    const cargandoSesiones = ref(false);
    const sesionesError = ref('');

    async function cargarSesiones() {
      if (!db) return;
      cargandoSesiones.value = true;
      sesionesError.value = '';
      try {
        const { data, error } = await db
          .from('bitacora_auditoria')
          .select(`
            id, accion, ip_cliente, created_at, fue_impersonado,
            usuarios!bitacora_auditoria_usuario_id_fkey ( email_institucional, nombres, apellidos )
          `)
          .in('accion', ['LOGIN', 'FAILED_LOGIN', 'LOGOUT', 'IMPERSONATE'])
          .order('created_at', { ascending: false })
          .limit(25);
        if (error) throw error;
        sesiones.value = (data || []).map((s) => ({
          id: s.id,
          usuario: s.usuarios
            ? (`${s.usuarios.nombres || ''} ${s.usuarios.apellidos || ''}`.trim() || s.usuarios.email_institucional)
            : 'Desconocido',
          accion: s.accion,
          ip: s.ip_cliente || '—',
          impersonado: s.fue_impersonado,
          fecha: new Date(s.created_at).toLocaleString('es-SV'),
        }));
      } catch (e) {
        sesionesError.value = e.message;
        console.error('[configuracion] No se pudieron leer los accesos:', e.message);
      } finally {
        cargandoSesiones.value = false;
      }
    }

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

    onMounted(() => {
      ejecutarDiagnostico();
      cargarSesiones();
    });

    return {
      config, guardado, tabActiva, tabs,
      catLocal, actualizarColor, ICONOS_DISPONIBLES,
      tonoPreview, previewTono, TONOS, GRUPOS_TONO,
      CAMPOS_KPI, CAMPOS_SEMAFORO, PALETAS,
      aplicarPaleta, restablecerColores, actualizarSerie,
      notifBrowser, solicitarPermisoNotif,
      sesiones, cargandoSesiones, sesionesError, cargarSesiones,

      // Diagnóstico
      chequeos, diagEjecutando, diagUltima, ejecutarDiagnostico,
      criticos, avisos, correctos, desconocidos,
      porGrupo, salud, claseEstado, iconoEstado,
      errorImport, onFileImport,
      confirmarReset, resetear, exportarJSON,
      estilosMapaOpciones,
      // Mapa en Vivo. Con sufijo _CFG los que comparten nombre con algo de la
      // consola, para que no se confundan al leer la plantilla.
      AJUSTES_PANELES, AJUSTES_HERRAMIENTAS,
      seccionAbierta, toggleSeccion,
      ESTADOS_FILTRO_CFG: ESTADOS_FILTRO,
      VENTANAS_TIEMPO_CFG: VENTANAS_TIEMPO,
      COLUMNAS_COMPARATIVO_CFG: COLUMNAS_COMPARATIVO,
      guardarYNotificar,
      isDarkMode, toggleDarkMode,
    };
  },
};
