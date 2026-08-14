// ============================================================
// COMPONENTE: Comunicados (Centro de Monitoreo)
//
// Sustituye a «Gestión de Notificaciones» en el menú, y conviene explicar por
// qué, porque no es un cambio de nombre.
//
// Aquella pantalla administraba `public.notificaciones`. Esa tabla:
//   · solo se llenaba a mano desde ahí —nada del sistema la genera todavía—,
//   · tiene una única policy desde la v5, `notificaciones_admin_all`, y
//   · el alta no fijaba `usuario_id`.
//
// Es decir: un administrador escribía avisos que ningún empleado ni ciudadano
// podía leer y que nada consumía. Parecía el canal para comunicarse con el
// personal y no llegaba a nadie.
//
// Los comunicados sí llegan: viven en `public.noticias`, la v36 les puso
// audiencia, y las dos PWA ya los muestran.
//
// `public.notificaciones` NO se elimina. Es el sitio correcto para los avisos
// transaccionales que el sistema generará —«se te asignó el caso #412»—, pero
// eso pertenece a la campana, no a una pantalla de gestión.
// ============================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useComunicadosAdmin } from '../../stores/comunicados-admin.js';
import { useCatalogos } from '../../stores/catalogos.js';
// Las imágenes van al mismo endpoint de cPanel que las evidencias de campo: se
// comprimen ahí y en la base solo queda la URL. Así no tocan los 500 MB del
// plan gratuito de Supabase.
import { subirEvidencia, evidenciasConfiguradas } from '../../services/evidencias.js';

const NUEVO = () => ({
  id: null,
  titulo: '',
  descripcion: '',
  categoria: 'Municipalidad',
  categoria_color: 'blue',
  categoria_icono: 'fa-bullhorn',
  audiencias: ['publico'],
  distritos: [],
  autor: 'Alcaldía de San Salvador Sur',
  imagen_url: '',
  /* Dónde ocurre. El portal sabía pintar las dos cosas desde el principio —un
     punto azul, o el trazo rojo de un cierre de vía con banderas de inicio y
     fin— y ese código no se había ejecutado nunca, porque desde aquí no había
     forma de publicarlas. */
  punto: null,        // { lat, lng }
  trazado: null,      // [[lat, lng], …]
  fecha_publicacion: '',
  fecha_expiracion: '',
  activa: true,
});

// Los mismos que ofrece el portal en su barra de filtros, para que un
// comunicado publicado aquí caiga en una pestaña que allí existe.
const CATEGORIAS = ['Municipalidad', 'Vialidad', 'Servicios', 'Eventos', 'Emergencias'];

const ICONOS = [
  'fa-bullhorn', 'fa-road', 'fa-droplet', 'fa-bolt', 'fa-star',
  'fa-triangle-exclamation', 'fa-building-columns', 'fa-trash', 'fa-tree',
];

const COLORES = ['blue', 'cyan', 'orange', 'red', 'green', 'purple', 'gray'];

export default {
  name: 'vista-comunicados',
  setup() {
    const {
      comunicados, cargando, guardando, error,
      totalComunicados, vigentes, programados, paraPublico,
      cargarComunicados, guardarComunicado, fijarActiva,
      estaVigente, estaProgramado, estaCaducado,
      AUDIENCIAS,
    } = useComunicadosAdmin();

    const { distritos, cargarDistritos, nombreDistrito } = useCatalogos();

    const modal = ref(false);
    const enEdicion = ref(NUEVO());
    const errorFormulario = ref('');
    const aviso = ref('');
    const filtroAudiencia = ref('todas');

    const comunicadosFiltrados = computed(() => {
      if (filtroAudiencia.value === 'todas') return comunicados.value;
      return comunicados.value.filter((c) => c.audiencias?.includes(filtroAudiencia.value));
    });

    const abrir = (c = null) => {
      errorFormulario.value = '';
      aviso.value = '';
      enEdicion.value = c
        ? {
            ...NUEVO(), ...c,
            audiencias: [...(c.audiencias || [])],
            distritos: [...(c.distritos || [])],
            // `datetime-local` no entiende el desplazamiento horario que
            // devuelve PostgREST; se recorta a `AAAA-MM-DDTHH:MM`.
            fecha_publicacion: paraInput(c.fecha_publicacion),
            fecha_expiracion: paraInput(c.fecha_expiracion),
            /* La fila trae `lat`/`lng` sueltos —columnas generadas de la v39—
               y el editor de mapa trabaja con un objeto. La conversión va aquí
               y no en el store para que el formulario tenga una sola forma. */
            punto: Number.isFinite(c.lat) && Number.isFinite(c.lng)
              ? { lat: c.lat, lng: c.lng }
              : null,
            trazado: Array.isArray(c.trazado_geojson) ? c.trazado_geojson : null,
          }
        : NUEVO();
      modal.value = true;
    };

    const cerrar = () => { modal.value = false; enEdicion.value = NUEVO(); };

    const paraInput = (iso) => (iso ? String(iso).slice(0, 16) : '');

    const alternarAudiencia = (id) => {
      const lista = enEdicion.value.audiencias;
      const i = lista.indexOf(id);
      if (i === -1) lista.push(id);
      else lista.splice(i, 1);
    };

    const alternarDistrito = (id) => {
      const lista = enEdicion.value.distritos;
      const i = lista.indexOf(id);
      if (i === -1) lista.push(id);
      else lista.splice(i, 1);
    };

    /* ── Imagen de portada ────────────────────────────────────────────────
       Se sube a cPanel y en `noticias.imagen_url` solo queda la dirección. El
       endpoint ya comprime a 1024 px y limita las subidas por hora, así que no
       hace falta nada aquí salvo enseñar el progreso. */
    const subiendoImagen = ref(false);
    const imagenConfigurada = evidenciasConfiguradas;

    const subirPortada = async (evento) => {
      const archivo = evento.target?.files?.[0];
      // Se limpia SIEMPRE: sin esto, elegir la misma imagen dos veces seguidas
      // no dispara `change` y parece que el botón dejó de funcionar.
      if (evento.target) evento.target.value = '';
      if (!archivo) return;

      errorFormulario.value = '';
      subiendoImagen.value = true;
      try {
        const res = await subirEvidencia(archivo);
        if (!res.ok) { errorFormulario.value = res.error; return; }
        enEdicion.value.imagen_url = res.url;
      } finally {
        subiendoImagen.value = false;
      }
    };

    const quitarPortada = () => { enEdicion.value.imagen_url = ''; };

    const guardar = async () => {
      if (guardando.value) return;      // doble clic = comunicado duplicado
      errorFormulario.value = '';
      const res = await guardarComunicado(enEdicion.value);
      if (!res.ok) { errorFormulario.value = res.error; return; }
      aviso.value = enEdicion.value.id ? 'Comunicado actualizado.' : 'Comunicado publicado.';
      cerrar();
    };

    const alternarActiva = async (c) => {
      aviso.value = '';
      const res = await fijarActiva(c.id, !c.activa);
      if (!res.ok) aviso.value = res.error;
    };

    /* Vista previa de a quién le va a llegar, en palabras.
       Un comunicado mal dirigido no se puede «despublicar» de la memoria de
       quien ya lo leyó, así que conviene poder confirmarlo ANTES de publicar. */
    const resumenAlcance = computed(() => {
      const a = enEdicion.value.audiencias || [];
      if (!a.length) return 'Nadie lo verá: falta elegir audiencia.';

      const quien = a.map((id) => AUDIENCIAS.find((x) => x.id === id)?.label || id).join(', ');
      const d = enEdicion.value.distritos || [];
      const donde = d.length
        ? `en ${d.map((id) => nombreDistrito(id) || id).join(', ')}`
        : 'en todo el municipio';
      return `Lo verá: ${quien} — ${donde}.`;
    });

    /** Etiqueta de estado, para no obligar a deducirlo de dos fechas. */
    const estadoDe = (c) => {
      if (!c.activa) return { texto: 'Retirado', clase: 'bg-gray-200 text-gray-600' };
      if (estaProgramado(c)) return { texto: 'Programado', clase: 'bg-amber-100 text-amber-700' };
      if (estaCaducado(c)) return { texto: 'Caducado', clase: 'bg-gray-100 text-gray-500' };
      return { texto: 'Publicado', clase: 'bg-emerald-100 text-emerald-700' };
    };

    const etiquetaAudiencia = (id) => AUDIENCIAS.find((a) => a.id === id)?.label || id;

    const formatearFecha = (iso) => {
      if (!iso) return '—';
      return new Date(iso).toLocaleString('es-SV', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    };

    onMounted(() => {
      cargarComunicados();
      if (!distritos.value.length) cargarDistritos();
    });

    return {
      comunicados, comunicadosFiltrados, cargando, guardando, error,
      totalComunicados, vigentes, programados, paraPublico,
      filtroAudiencia,
      modal, enEdicion, errorFormulario, aviso,
      abrir, cerrar, guardar, alternarActiva,
      alternarAudiencia, alternarDistrito,
      resumenAlcance, estadoDe, etiquetaAudiencia, formatearFecha,
      distritos, nombreDistrito,
      AUDIENCIAS, CATEGORIAS, ICONOS, COLORES,
      // Imagen de portada
      subirPortada, quitarPortada, subiendoImagen, imagenConfigurada,
    };
  },
};
