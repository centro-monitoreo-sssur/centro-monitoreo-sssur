// Topbar sticky con migas de pan, buscador global, reloj institucional, menú de
// perfil y botón de colapso/expansión del sidebar.
//
// Fase 5. Tres añadidos con motivo operativo, no estético:
//
//   · Migas de pan: hay 31 vistas y el único indicador de posición era el
//     título. Desde una vista de detalle no se sabía a qué sección se pertenece.
//   · Buscador global (Ctrl+K): llegar a una denuncia concreta obligaba a ir a
//     Denuncias, filtrar y paginar. En una consola de monitoreo, buscar por
//     número de caso mientras alguien te lo dicta por radio es la operación más
//     frecuente que había que hacer con el ratón.
//   · Perfil con rol y departamento: con la RLS por departamento activa (v14),
//     dos usuarios ven listados distintos de los mismos datos. Sin mostrar bajo
//     qué ámbito se está mirando, la reacción natural ante una lista corta es
//     "el sistema perdió casos".
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { usePwa } from '../../stores/pwa.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useNotificaciones } from '../../stores/notificaciones.js';
import { ahoraTexto } from '../../utils/tiempo.js';

const MAX_RESULTADOS_CASOS = 6;

export default {
  setup() {
    const {
      tituloVista, vistaActual, sidebarAbierto, sidebarColapsado, toggleSidebar,
      isDarkMode, toggleDarkMode, irA, gruposVisibles,
      nombreUsuario, usuarioActual, rolUsuario, departamentoUsuario, distritoUsuario,
      cerrarSesion,
    } = useNavegacion();
    const { versionApp } = usePwa();
    const { denuncias } = useDenuncias();
    const { nombreDepartamento, nombreDistrito } = useCatalogos();
    /* El punto rojo de la campana estaba escrito a mano en la plantilla:
       encendido siempre, hubiera avisos o no. Un distintivo que nunca se apaga
       no informa de nada y, peor, hace invisible el aviso de verdad cuando
       llega. Ahora sale del contador real. */
    const { notificacionesNoLeidas } = useNotificaciones();

    const fechaHoraActual = ref(ahoraTexto());
    let timer = null;

    // ── Migas de pan ────────────────────────────────────────────────────────
    // El grupo se deduce del menú, que ya es la estructura de navegación real.
    // Mantener aquí una segunda tabla vista→sección obligaría a actualizar dos
    // sitios cada vez que se añade una pantalla.
    const migas = computed(() => {
      const ruta = [];
      for (const grupo of gruposVisibles.value) {
        // El id del ítem ES el nombre de la vista (ver `gruposNav`).
        if ((grupo.items || []).some((i) => i.id === vistaActual.value)) {
          ruta.push({ texto: grupo.label });
          break;
        }
      }
      ruta.push({ texto: tituloVista.value });
      return ruta.filter((m) => m.texto);
    });

    // ── Identidad ───────────────────────────────────────────────────────────
    const menuPerfilAbierto = ref(false);

    const nombreMostrado = computed(() => nombreUsuario.value || usuarioActual.value || 'Usuario');

    const iniciales = computed(() => {
      const partes = String(nombreMostrado.value)
        // Correcto: \s+. Con `\\s+` se busca una barra invertida literal, que es
        // el error que ya dejó un correo completo desbordando la cabecera (§11.4).
        .split(/\s+/)
        .filter(Boolean);
      if (!partes.length) return '??';
      const texto = partes.length === 1
        ? partes[0].slice(0, 2)
        : partes[0][0] + partes[partes.length - 1][0];
      return texto.toUpperCase();
    });

    const ambito = computed(() => {
      const partes = [];
      if (departamentoUsuario.value) {
        partes.push(nombreDepartamento(departamentoUsuario.value) || `Depto. ${departamentoUsuario.value}`);
      }
      if (distritoUsuario.value) {
        partes.push(nombreDistrito(distritoUsuario.value) || `Distrito ${distritoUsuario.value}`);
      }
      return partes;
    });

    // ── Buscador global ─────────────────────────────────────────────────────
    const buscadorAbierto = ref(false);
    const consulta = ref('');
    const indiceActivo = ref(0);
    const campoBusqueda = ref(null);

    const vistasBuscables = computed(() =>
      gruposVisibles.value.flatMap((g) =>
        (g.items || []).map((i) => ({
          tipo: 'vista',
          id: 'v-' + i.id,
          vista: i.id,
          titulo: i.label,
          detalle: g.label || '',
          // Los iconos del menú se guardan sin familia ('fa-chart-pie'); hay
          // que anteponer 'fa-solid' o Font Awesome no dibuja nada.
          icono: 'fa-solid ' + (i.icono || 'fa-arrow-right'),
        }))
      )
    );

    const resultados = computed(() => {
      const q = consulta.value.trim().toLowerCase();
      if (!q) return vistasBuscables.value.slice(0, 8);

      const vistas = vistasBuscables.value.filter((v) =>
        v.titulo.toLowerCase().includes(q) || v.detalle.toLowerCase().includes(q)
      );

      // Búsqueda de casos sobre lo que ya está en memoria. No consulta a la
      // base: sería una petición por pulsación y el listado cargado es el que
      // la RLS ya autorizó para este usuario. Se avisa en la UI del alcance.
      const casos = (denuncias.value || [])
        .filter((d) =>
          String(d.id).includes(q) ||
          (d.correlativo || '').toLowerCase().includes(q) ||
          (d.direccion || '').toLowerCase().includes(q) ||
          (d.descripcion || '').toLowerCase().includes(q)
        )
        .slice(0, MAX_RESULTADOS_CASOS)
        .map((d) => ({
          tipo: 'caso',
          id: 'c-' + d.id,
          vista: 'denuncias',
          titulo: '#' + String(d.id).padStart(5, '0') + ' · ' + (d.direccion || 'Sin dirección'),
          detalle: d.descripcion || '',
          icono: 'fa-solid fa-file-lines',
        }));

      return [...vistas, ...casos];
    });

    function abrirBuscador() {
      buscadorAbierto.value = true;
      consulta.value = '';
      indiceActivo.value = 0;
      nextTick(() => campoBusqueda.value?.focus());
    }

    function cerrarBuscador() {
      buscadorAbierto.value = false;
    }

    function elegir(resultado) {
      if (!resultado) return;
      cerrarBuscador();
      irA(resultado.vista);
    }

    function moverSeleccion(delta) {
      const total = resultados.value.length;
      if (!total) return;
      indiceActivo.value = (indiceActivo.value + delta + total) % total;
    }

    // Ctrl/Cmd+K global. Se registra en captura para ganarle al navegador en
    // los teclados donde Ctrl+K abre la barra de direcciones.
    function atajoGlobal(evento) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        buscadorAbierto.value ? cerrarBuscador() : abrirBuscador();
      }
    }

    // Al cambiar la consulta, la selección vuelve al primer resultado: si no,
    // el índice puede apuntar más allá del final de la lista nueva.
    watch(consulta, () => { indiceActivo.value = 0; });

    function cerrarMenus(evento) {
      if (!evento.target.closest?.('[data-menu-perfil]')) menuPerfilAbierto.value = false;
    }

    async function salir() {
      menuPerfilAbierto.value = false;
      await cerrarSesion();
    }

    onMounted(() => {
      timer = setInterval(() => { fechaHoraActual.value = ahoraTexto(); }, 30000);
      document.addEventListener('keydown', atajoGlobal, true);
      document.addEventListener('click', cerrarMenus);
    });

    onUnmounted(() => {
      clearInterval(timer);
      document.removeEventListener('keydown', atajoGlobal, true);
      document.removeEventListener('click', cerrarMenus);
    });

    return {
      tituloVista, migas, fechaHoraActual,
      sidebarAbierto, sidebarColapsado, toggleSidebar,
      isDarkMode, toggleDarkMode, versionApp, irA,
      notificacionesNoLeidas,
      // perfil
      menuPerfilAbierto, nombreMostrado, iniciales, rolUsuario, ambito, salir,
      // buscador
      buscadorAbierto, consulta, resultados, indiceActivo, campoBusqueda,
      abrirBuscador, cerrarBuscador, elegir, moverSeleccion,
    };
  },
};
