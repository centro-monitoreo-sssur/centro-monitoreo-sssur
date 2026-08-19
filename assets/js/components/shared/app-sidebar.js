// Barra lateral. Estructura de TailAdmin con la identidad de San Salvador Sur:
// fondo claro, item activo como pildora de tinte azul institucional, y colapso
// a 90 px que se despliega al pasar el raton (ver assets/css/tailwind-fuente.css).
//
// Se retiró el acordeón por grupos: TailAdmin los muestra siempre abiertos y
// con catorce ítems no hay nada que plegar. El store sigue ofreciendo
// `toggleGrupo`, `grupoVisible` y `navPlano` por si otra vista los quisiera,
// pero aquí ya no se usan — y con ellos deja de tener efecto la preferencia de
// grupos abiertos que se guardaba en el almacén local.
//
// Lee el store de navegación; el estado de conexión a Supabase viene del core.
// El botón de colapso (escritorio) y el cajón lateral (móvil) los gobierna el
// store, no este componente.
import { computed } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { conexionOk } from '../../core/supabase.js';

export default {
  setup() {
    const {
      vistaActual, sidebarAbierto, sidebarColapsado, logoError,
      gruposVisibles, irA, toggleSidebar,
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
      gruposVisibles, irA, toggleSidebar, conexionOk, abrirModalLogout,
      nombreMostrado, iniciales, rolUsuario,
    };
  },
};
