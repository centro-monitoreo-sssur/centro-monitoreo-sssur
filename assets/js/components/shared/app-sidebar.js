// Sidebar institucional (identidad San Salvador Sur). Lee el store de
// navegación; muestra estado de conexión a Supabase desde el core. El botón
// de colapso/expansión (escritorio) y el drawer (móvil) vienen del store.
import { computed } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { conexionOk } from '../../core/supabase.js';

export default {
  setup() {
    const {
      vistaActual, sidebarAbierto, sidebarColapsado, logoError,
      gruposVisibles, navPlano, grupoVisible, toggleGrupo,
      irA, toggleSidebar,
      nombreUsuario, usuarioActual, rolUsuario,
    } = useNavegacion();

    // La ficha del pie mostraba "Admin Sistema" / "RA" fijos para cualquiera
    // que iniciara sesión. Ahora sale del perfil real.
    const nombreMostrado = computed(
      () => nombreUsuario.value || usuarioActual.value || 'Sin identificar'
    );

    const iniciales = computed(() => {
      const partes = nombreMostrado.value.trim().split(/\s+/).filter(Boolean);
      if (!partes.length) return '??';
      // Nombre + apellido; si solo hay una palabra (p. ej. el correo), sus dos
      // primeras letras.
      const letras = partes.length === 1
        ? partes[0].slice(0, 2)
        : partes[0][0] + partes[partes.length - 1][0];
      return letras.toUpperCase();
    });

    // El modal de logout ahora está en app-root, no en sidebar
    // Solo necesitamos emitir el evento para abrir el modal
    const abrirModalLogout = () => {
      // Emitir evento al componente padre (app-root)
      const event = new CustomEvent('abrir-modal-logout');
      window.dispatchEvent(event);
    };

    return {
      vistaActual, sidebarAbierto, sidebarColapsado, logoError,
      gruposVisibles, navPlano, grupoVisible, toggleGrupo,
      irA, toggleSidebar, conexionOk, abrirModalLogout,
      nombreMostrado, iniciales, rolUsuario,
    };
  },
};
