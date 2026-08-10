// ============================================================
// COMPONENTE: Gestión de Notificaciones (admin)
//
// Antes esta vista ni se mostraba: el enrutador de `app-root.html` comparaba
// `vistaActual === 'notificaciones'` mientras el ítem de menú vale
// 'vista-notificaciones', así que ninguna rama casaba y caía en el placeholder
// ("queda como siguiente iteración del backlog"). Corregido en app-root.
//
// Y el componente que había detrás era una lista de tres notificaciones
// escritas a mano. Aquí se sustituye por el módulo real sobre
// `public.notificaciones` (migration_v5): consulta, filtros, emisión, marcado
// y borrado, más Realtime — la tabla ya estaba en la publicación
// `supabase_realtime` y nadie la escuchaba.
//
// Nota de permisos: la policy `notificaciones_admin_all` de v5 concede el
// acceso SOLO a `admin` y `superadmin`. Un jefe de área ve la pantalla vacía y
// sin errores, porque RLS filtra en silencio; por eso la vista lo advierte en
// lugar de aparentar que no hay nada que mostrar.
// ============================================================
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNotificaciones } from '../../stores/notificaciones.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { tiempoRelativo } from '../../utils/tiempo.js';

const NUEVA = () => ({ titulo: '', mensaje: '', tipo: 'info', prioridad: 'media' });

// Presentación por tipo. Los códigos son los de `TIPOS_NOTIFICACION` del store,
// que a su vez son los valores que admite la columna `tipo`.
const ESTILO_TIPO = {
  info:        { icono: 'fa-circle-info',          tono: 'info',    etiqueta: 'Información' },
  exito:       { icono: 'fa-circle-check',         tono: 'exito',   etiqueta: 'Éxito' },
  advertencia: { icono: 'fa-triangle-exclamation', tono: 'alerta',  etiqueta: 'Advertencia' },
  error:       { icono: 'fa-circle-xmark',         tono: 'peligro', etiqueta: 'Error' },
  emergencia:  { icono: 'fa-tower-broadcast',      tono: 'peligro', etiqueta: 'Emergencia' },
};

const ESTILO_PRIORIDAD = {
  baja:    { tono: 'neutro',  etiqueta: 'Baja' },
  media:   { tono: 'info',    etiqueta: 'Media' },
  alta:    { tono: 'alerta',  etiqueta: 'Alta' },
  critica: { tono: 'peligro', etiqueta: 'Crítica' },
};

export default {
  name: 'vista-notificaciones',
  setup() {
    const {
      notificacionesOrdenadas, notificacionesNoLeidas, cargando, errorNotificaciones,
      cargarNotificaciones, suscribirRealtime, desuscribirRealtime,
      agregarNotificacion, marcarComoLeida, marcarTodasComoLeidas,
      eliminarNotificacion, eliminarLeidas,
    } = useNotificaciones();
    const { rolUsuario } = useNavegacion();

    const busqueda = ref('');
    const filtroTipo = ref('');
    const filtroPrioridad = ref('');
    const filtroEstado = ref('');          // '' | 'no_leidas' | 'leidas'
    const mensaje = ref({ tipo: '', texto: '' });
    const enCurso = ref(null);             // id de la notificación en operación

    // Emisión
    const modalAbierto = ref(false);
    const formulario = ref(NUEVA());
    const errorFormulario = ref('');
    const enviando = ref(false);

    // Confirmación de purga
    const modalPurga = ref(false);

    const puedeGestionar = computed(() =>
      rolUsuario.value === 'admin' || rolUsuario.value === 'superadmin'
    );

    const estiloTipo = (tipo) => ESTILO_TIPO[tipo] || ESTILO_TIPO.info;
    const estiloPrioridad = (p) => ESTILO_PRIORIDAD[p] || ESTILO_PRIORIDAD.media;

    const OPCIONES_TIPO = Object.entries(ESTILO_TIPO)
      .map(([id, v]) => ({ id, nombre: v.etiqueta }));
    const OPCIONES_PRIORIDAD = Object.entries(ESTILO_PRIORIDAD)
      .map(([id, v]) => ({ id, nombre: v.etiqueta }));
    const OPCIONES_ESTADO = [
      { id: 'no_leidas', nombre: 'Sin leer' },
      { id: 'leidas', nombre: 'Leídas' },
    ];

    const lista = computed(() => {
      let filas = notificacionesOrdenadas.value;

      if (filtroTipo.value) filas = filas.filter((n) => n.tipo === filtroTipo.value);
      if (filtroPrioridad.value) filas = filas.filter((n) => n.prioridad === filtroPrioridad.value);
      if (filtroEstado.value === 'no_leidas') filas = filas.filter((n) => !n.leida);
      if (filtroEstado.value === 'leidas') filas = filas.filter((n) => n.leida);

      const q = busqueda.value.trim().toLowerCase();
      if (q) {
        filas = filas.filter((n) =>
          (n.titulo || '').toLowerCase().includes(q) ||
          (n.mensaje || '').toLowerCase().includes(q)
        );
      }
      return filas;
    });

    const resumen = computed(() => {
      const todas = notificacionesOrdenadas.value;
      return {
        total: todas.length,
        sinLeer: notificacionesNoLeidas.value,
        criticas: todas.filter((n) => n.prioridad === 'critica' && !n.leida).length,
        leidas: todas.filter((n) => n.leida).length,
      };
    });

    const hayFiltros = computed(() =>
      Boolean(busqueda.value || filtroTipo.value || filtroPrioridad.value || filtroEstado.value)
    );

    function limpiarFiltros() {
      busqueda.value = '';
      filtroTipo.value = '';
      filtroPrioridad.value = '';
      filtroEstado.value = '';
    }

    function avisar(tipo, texto) {
      mensaje.value = { tipo, texto };
      if (tipo === 'ok') setTimeout(() => { mensaje.value = { tipo: '', texto: '' }; }, 4000);
    }

    // ── Acciones sobre una notificación ─────────────────────────────────────
    async function alternarLeida(notif) {
      if (notif.leida) return;              // el store no soporta volver a "no leída"
      enCurso.value = notif.id;
      const r = await marcarComoLeida(notif.id);
      enCurso.value = null;
      if (!r?.ok) avisar('error', r?.error || 'No se pudo marcar como leída.');
    }

    async function borrar(notif) {
      enCurso.value = notif.id;
      const r = await eliminarNotificacion(notif.id);
      enCurso.value = null;
      if (!r?.ok) avisar('error', r?.error || 'No se pudo eliminar.');
    }

    async function marcarTodas() {
      const r = await marcarTodasComoLeidas();
      if (!r?.ok) avisar('error', r?.error || 'No se pudieron marcar.');
      else avisar('ok', 'Todas marcadas como leídas.');
    }

    async function purgarLeidas() {
      modalPurga.value = false;
      const r = await eliminarLeidas();
      if (!r?.ok) { avisar('error', r?.error || 'No se pudieron eliminar.'); return; }
      avisar('ok', r.borradas ? `${r.borradas} notificación(es) eliminada(s).` : 'No había leídas que eliminar.');
    }

    // ── Emisión ─────────────────────────────────────────────────────────────
    function abrirEmisor() {
      formulario.value = NUEVA();
      errorFormulario.value = '';
      modalAbierto.value = true;
    }

    async function enviar() {
      const f = formulario.value;
      if (!f.titulo.trim())  { errorFormulario.value = 'El título es obligatorio.'; return; }
      if (!f.mensaje.trim()) { errorFormulario.value = 'El mensaje es obligatorio.'; return; }

      enviando.value = true;
      errorFormulario.value = '';
      try {
        const creada = await agregarNotificacion({
          titulo: f.titulo.trim(),
          mensaje: f.mensaje.trim(),
          tipo: f.tipo,
          prioridad: f.prioridad,
          origen: 'admin',
        });
        // `agregarNotificacion` cae a una copia local si la base rechaza el
        // insert. Un id numérico grande (Date.now()) delata ese camino: sin
        // avisar, el operador creería haber emitido un aviso que nadie recibió.
        const soloLocal = creada && typeof creada.id === 'number' && creada.id > 1e12;
        modalAbierto.value = false;
        if (soloLocal) {
          avisar('error', 'La notificación no llegó a la base de datos: quedó solo en esta sesión. Revisa tus permisos.');
        } else {
          avisar('ok', 'Notificación emitida.');
        }
      } catch (e) {
        errorFormulario.value = e.message || 'No se pudo emitir.';
      } finally {
        enviando.value = false;
      }
    }

    onMounted(() => {
      cargarNotificaciones();
      suscribirRealtime();
    });
    onUnmounted(desuscribirRealtime);

    return {
      lista, resumen, cargando, errorNotificaciones, puedeGestionar,
      busqueda, filtroTipo, filtroPrioridad, filtroEstado,
      OPCIONES_TIPO, OPCIONES_PRIORIDAD, OPCIONES_ESTADO,
      hayFiltros, limpiarFiltros, mensaje, enCurso,
      estiloTipo, estiloPrioridad, tiempoRelativo,
      alternarLeida, borrar, marcarTodas, purgarLeidas,
      modalPurga, modalAbierto, formulario, errorFormulario, enviando, abrirEmisor, enviar,
    };
  },
};
