// ============================================================================
// VISTA: pantalla de inicio de la PWA de empleado
//
// Es lo primero que ve alguien en territorio, y hasta ahora casi todo lo que
// mostraba era falso:
//   · `tareasPendientes = ref(3)` — un tres fijo. Decía "3 tareas pendientes"
//     tuviera cero o cuarenta.
//   · El área y la zona salían de `localStorage.empleado_datos`, una clave que
//     NO escribe nadie en todo el proyecto, así que siempre caían al valor por
//     defecto: "Municipalidad" y "No asignada".
//   · Cuatro funciones de navegación que solo hacían `console.log`. Ni siquiera
//     estaban enlazadas en la plantilla: eran código muerto.
//
// Ahora el contador sale de los casos reales del empleado y la adscripción del
// perfil de `public.usuarios`.
// ============================================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useMisCasos } from '../../stores/mis-casos.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { usePreferenciasCampo } from '../../stores/preferencias-campo.js';

export default {
  setup() {
    const {
      usuarioActual, nombreUsuario, rolUsuario, cerrarSesion, irA,
      departamentoUsuario, distritoUsuario,
    } = useNavegacion();
    const { estadisticas, cargarMisCasos } = useMisCasos();
    const { nombreDepartamento, nombreDistrito } = useCatalogos();

    // Dos primeras palabras del nombre. NUNCA el correo completo: no tiene
    // espacios, así que como palabra indivisible en un titular grande desborda
    // la pantalla y arrastra la página al scroll horizontal.
    const usuarioNombre = computed(() => {
      const dosPrimeras = (texto) =>
        (texto || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');

      if (nombreUsuario.value) return dosPrimeras(nombreUsuario.value);

      // Último recurso: "soporte.ti@dominio" → "Soporte Ti"
      const local = (usuarioActual.value || '').split('@')[0];
      if (!local) return 'Empleado';
      return dosPrimeras(local.replace(/[._-]+/g, ' '))
        .replace(/\b\p{L}/gu, (c) => c.toUpperCase()) || 'Empleado';
    });

    const ROLES = {
      empleado:     'Empleado de Campo',
      jefe_area:    'Jefe de Área',
      jefe_distrito:'Jefatura de Distrito',
      directivo:    'Directivo',
      alcalde:      'Alcalde',
      admin:        'Administrador',
      superadmin:   'Superadministrador',
    };
    const rolDisplay = computed(() => ROLES[rolUsuario.value] || 'Empleado Municipal');

    // Departamento real del organigrama. Si el perfil no lo tiene asignado se
    // dice así, en vez de inventar una adscripción genérica.
    const areaDisplay = computed(() => {
      const nombre = departamentoUsuario.value ? nombreDepartamento(departamentoUsuario.value) : '';
      return nombre || 'Sin departamento asignado';
    });

    const zonaAsignada = computed(() => {
      const nombre = distritoUsuario.value ? nombreDistrito(distritoUsuario.value) : '';
      return nombre || 'Sin distrito asignado';
    });

    // Trabajo vivo: lo que está por atender más lo que ya está en curso. Es la
    // cifra que responde a "¿qué me queda hoy?", que es lo que mira alguien al
    // abrir la aplicación.
    const tareasPendientes = computed(
      () => estadisticas.value.pendientes + estadisticas.value.enProceso
    );

    onMounted(cargarMisCasos);

    /* Confirmación antes de cerrar sesión.
       El botón está en la esquina superior de la cabecera, a un dedo de
       distancia del resto de la interfaz, y cerrarlo sin querer en territorio
       obliga a volver a escribir usuario y contraseña con guantes y a pleno
       sol. El portal de población ya confirmaba; esta pantalla no. */
    const mostrarModalLogout = ref(false);
    const confirmarLogout = () => {
      mostrarModalLogout.value = false;
      cerrarSesion();
    };

    // El logo cambia con el tema; el azul no se ve sobre fondo oscuro.
    const { logoHorizontal } = usePreferenciasCampo();

    return {
      logoHorizontal,
      mostrarModalLogout,
      confirmarLogout,
      usuarioNombre,
      usuarioActual,
      rolUsuario,
      rolDisplay,
      areaDisplay,
      zonaAsignada,
      tareasPendientes,
      cerrarSesion,
      irA,
    };
  },
};
