// Topbar sticky con título de vista, reloj institucional y botón de
// colapso/expansión del sidebar (estilo Flowbite, unificado para móvil/escritorio).
import { ref, onMounted, onUnmounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { usePwa } from '../../stores/pwa.js';
import { ahoraTexto } from '../../utils/tiempo.js';

export default {
  setup() {
    const { tituloVista, sidebarAbierto, sidebarColapsado, toggleSidebar, isDarkMode, toggleDarkMode, irA } = useNavegacion();
    const { versionApp } = usePwa();
    const fechaHoraActual = ref(ahoraTexto());
    let timer = null;

    onMounted(() => { timer = setInterval(() => { fechaHoraActual.value = ahoraTexto(); }, 30000); });
    onUnmounted(() => clearInterval(timer));

    return { tituloVista, fechaHoraActual, sidebarAbierto, sidebarColapsado, toggleSidebar, isDarkMode, toggleDarkMode, versionApp, irA };
  },
};
