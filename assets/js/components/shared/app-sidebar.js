// Sidebar institucional (identidad San Salvador Sur). Lee el store de
// navegación; muestra estado de conexión a Supabase desde el core. El botón
// de colapso/expansión (escritorio) y el drawer (móvil) vienen del store.
import { ref } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { conexionOk } from '../../core/supabase.js';

export default {
  setup() {
    const {
      vistaActual, sidebarAbierto, sidebarColapsado, logoError,
      navOperacion, navAdmin, irA, toggleSidebar,
    } = useNavegacion();

    // El modal de logout ahora está en app-root, no en sidebar
    // Solo necesitamos emitir el evento para abrir el modal
    const abrirModalLogout = () => {
      // Emitir evento al componente padre (app-root)
      const event = new CustomEvent('abrir-modal-logout');
      window.dispatchEvent(event);
    };

    return {
      vistaActual, sidebarAbierto, sidebarColapsado, logoError,
      navOperacion, navAdmin, irA, toggleSidebar, conexionOk,
      abrirModalLogout,
    };
  },
};
