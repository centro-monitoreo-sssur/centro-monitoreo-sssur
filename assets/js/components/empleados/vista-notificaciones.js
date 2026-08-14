// Vista: Comunicados (PWA de empleados)
//
// Leía `stores/notificaciones.js`, que consulta `public.notificaciones`. Esa
// tabla tiene UNA sola policy desde la v5 —`notificaciones_admin_all`, para
// admin y superadmin— así que un empleado de campo veía la pantalla vacía
// SIEMPRE, y sin error: la RLS filtra en silencio.
//
// Ahora muestra los comunicados que la municipalidad dirige al personal. La
// v36 los marca con audiencia `empleados`, y la policy hace el resto: este
// código no filtra por audiencia, solo pide y recibe lo que le toca.
import { ref, computed, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useComunicados } from '../../stores/comunicados.js';
import { sanearHtml } from '../shared/ui/ui-editor-texto.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const {
      comunicados, cargando, errorComunicados,
      estaLeido, sinLeer, cargarComunicados, marcarLeido,
    } = useComunicados();

    /* Se traduce a la forma que ya espera la plantilla en vez de reescribir el
       marcado. `prioridad` sale de la categoría —un comunicado no la declara—
       y el icono, del propio comunicado cuando lo trae. */
    const notificaciones = computed(() => comunicados.value.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      mensaje: c.descripcion,
      tipo: c.categoria || 'informacion',
      iconoPropio: c.categoria_icono || null,
      prioridad: 'normal',
      leida: estaLeido(c.id),
      fecha_creacion: c.fecha,
      autor: c.autor || 'Alcaldía de San Salvador Sur',
    })));


    /* El cuerpo del comunicado se redacta con formato desde el panel, así que
       llega como HTML. Se vuelve a sanear AQUÍ, al pintarlo, aunque ya se
       saneó al escribirlo: la fila pudo entrar por otra vía —el editor SQL de
       Supabase— y `v-html` sobre contenido no verificado es cómo se cuela un
       script. Sanear dos veces no cuesta nada; confiar una sola vez, sí.

       Ver la lista blanca en components/shared/ui/ui-editor-texto.js. */
    const cuerpoSeguro = (html) => sanearHtml(html || '');

    /* En las tarjetas del listado se recorta a dos líneas, y ahí el HTML
       estorba: se verían las etiquetas. Se extrae solo el texto. */
    const resumenTexto = (html) => {
      const d = document.createElement('div');
      d.innerHTML = sanearHtml(html || '');
      return (d.textContent || '').replace(/\s+/g, ' ').trim();
    };

    const contadorNoLeidas = sinLeer;

    // Los comunicados no se borran desde el teléfono: los publica y los retira
    // la municipalidad. Se conservan los nombres que usa la plantilla para no
    // tocarla, pero no hacen nada destructivo.
    const marcarComoLeida = (id) => marcarLeido(id);
    const marcarTodasComoLeidas = async () => {
      for (const n of notificaciones.value) {
        if (!n.leida) await marcarLeido(n.id);
      }
    };

    const filtrarPorTipo = (tipo) => notificaciones.value.filter((n) => n.tipo === tipo);
    const filtrarPorPrioridad = (p) => notificaciones.value.filter((n) => n.prioridad === p);
    
    const filtroTipo = ref('todas');
    const filtroPrioridad = ref('todas');
    const mostrarFiltros = ref(false);
    
    // Computed para notificaciones filtradas
    const notificacionesFiltradas = computed(() => {
      let filtradas = notificaciones.value;
      
      if (filtroTipo.value !== 'todas') {
        filtradas = filtrarPorTipo(filtroTipo.value);
      }
      
      if (filtroPrioridad.value !== 'todas') {
        filtradas = filtrarPorPrioridad(filtroPrioridad.value);
      }
      
      return filtradas.sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
    });
    
    // Computed para notificaciones agrupadas por fecha
    const notificacionesPorFecha = computed(() => {
      const agrupadas = {};
      notificacionesFiltradas.value.forEach(notif => {
        const fecha = new Date(notif.fecha_creacion).toLocaleDateString('es-SV', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
        if (!agrupadas[fecha]) {
          agrupadas[fecha] = [];
        }
        agrupadas[fecha].push(notif);
      });
      return agrupadas;
    });
    
    // Marcar como leída al hacer click
    const handleNotificacionClick = (notif) => {
      if (!notif.leida) {
        marcarComoLeida(notif.id);
      }
      // Opcional: navegar a detalle relacionado
      if (notif.metadata && notif.metadata.ruta) {
        irA(notif.metadata.ruta);
      }
    };
    
    // Marcar todas como leídas
    const handleMarcarTodas = () => {
      marcarTodasComoLeidas();
    };
    
    /* Un comunicado no se borra desde el teléfono: lo publica y lo retira la
       municipalidad, y que cada empleado pudiera hacer desaparecer el suyo
       significaría que un aviso importante se pierde con un toque accidental.
       Los dos handlers se conservan porque la plantilla los invoca, pero solo
       marcan como leído, que es la acción que sí le corresponde a quien lee. */
    const handleEliminar = (id) => marcarComoLeida(id);
    const handleEliminarTodasLeidas = () => marcarTodasComoLeidas();
    
    // Limpiar filtros
    const handleLimpiarFiltros = () => {
      filtroTipo.value = 'todas';
      filtroPrioridad.value = 'todas';
    };
    
    // Formatear fecha relativa
    const getFechaRelativa = (fecha) => {
      const ahora = new Date();
      const fechaNotif = new Date(fecha);
      const diffMs = ahora - fechaNotif;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHoras = Math.floor(diffMs / 3600000);
      const diffDias = Math.floor(diffMs / 86400000);
      
      if (diffMin < 1) return 'Ahora mismo';
      if (diffMin < 60) return `Hace ${diffMin} min`;
      if (diffHoras < 24) return `Hace ${diffHoras} h`;
      if (diffDias < 7) return `Hace ${diffDias} días`;
      return fechaNotif.toLocaleDateString('es-SV', { day: '2-digit', month: 'short' });
    };
    
    // Obtener icono según tipo
    const getIconoTipo = (tipo) => {
      const iconos = {
        alerta: 'fa-exclamation-triangle',
        informacion: 'fa-info-circle',
        exito: 'fa-check-circle',
        advertencia: 'fa-exclamation-circle',
        emergencia: 'fa-bell',
        sistema: 'fa-cog'
      };
      return iconos[tipo] || 'fa-bell';
    };
    
    // Obtener color según prioridad
    const getColorPrioridad = (prioridad) => {
      const colores = {
        baja: 'text-gray-500 bg-gray-100',
        normal: 'text-blue-500 bg-blue-100',
        alta: 'text-orange-500 bg-orange-100',
        critica: 'text-red-500 bg-red-100',
        emergencia: 'text-red-600 bg-red-200'
      };
      return colores[prioridad] || 'text-gray-500 bg-gray-100';
    };
    
    // Obtener etiqueta de prioridad
    const getEtiquetaPrioridad = (prioridad) => {
      const etiquetas = {
        baja: 'Baja',
        normal: 'Normal',
        alta: 'Alta',
        critica: 'Crítica',
        emergencia: 'Emergencia'
      };
      return etiquetas[prioridad] || prioridad;
    };
    
    // `app-root` ya los pidió al arrancar y los refresca al volver a la
    // pantalla, pero esta vista puede abrirse en una sesión donde eso todavía
    // no ocurrió —por ejemplo, tras un login recién hecho—.
    onMounted(() => {
      if (!comunicados.value.length) cargarComunicados();
    });

    return {
      notificaciones,
      notificacionesFiltradas,
      notificacionesPorFecha,
      contadorNoLeidas,
      // Estado de la carga: sin esto, «no hay comunicados» y «todavía estoy
      // pidiéndolos» se ven igual, que es una lista vacía sin explicación.
      cargando, errorComunicados,
      cuerpoSeguro, resumenTexto,
      filtroTipo,
      filtroPrioridad,
      mostrarFiltros,
      irA,
      handleNotificacionClick,
      handleMarcarTodas,
      handleEliminar,
      handleEliminarTodasLeidas,
      handleLimpiarFiltros,
      getFechaRelativa,
      getIconoTipo,
      getColorPrioridad,
      getEtiquetaPrioridad
    };
  }
};
