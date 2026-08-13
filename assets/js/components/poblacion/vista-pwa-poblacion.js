// Vista PWA Población: portada del portal ciudadano.
//
// Hasta el bloque 2 leía `localStorage.ciudadano_datos`, la clave que escribía
// el registro simulado. Ese registro ya no existe —ahora crea una cuenta real y
// la ficha la crea el trigger de la v32—, así que la clave nunca se rellena y
// la pantalla caía al correo del usuario: «Hola, perazarich264@gmail.com».
//
// Ahora sale de `stores/ciudadano.js`, que lee la tabla `ciudadanos`.
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useCiudadano } from '../../stores/ciudadano.js';

export default {
  setup() {
    // `usuarioActual` y `rolUsuario` ya no se exponen: la plantilla no los usa
    // —el «Ciudadano registrado» de la tarjeta es texto fijo— y `usuarioActual`
    // era justamente el correo que se colaba en el saludo.
    const { cerrarSesion, irA } = useNavegacion();
    const { distritos, cargarDistritos } = useCatalogos();
    const { perfil, cargarPerfil } = useCiudadano();

    const mostrarModalLogout = ref(false);

    const confirmarLogout = () => {
      cerrarSesion();
      mostrarModalLogout.value = false;
    };

    onMounted(() => {
      // La ficha puede no estar cargada todavía: `navegacion.js` solo lee de
      // ella el nombre y el distrito para resolver el rol, no la guarda entera.
      if (!perfil.value) cargarPerfil();
      if (!distritos.value.length) cargarDistritos();
    });

    /**
     * Primer nombre y primer apellido, que es como se saluda a alguien.
     *
     * El patrón anterior era `/\\s+/`, con doble barra. En un literal de
     * expresión regular eso NO significa «espacio en blanco»: significa una
     * barra invertida literal seguida de la letra `s`. Nunca casaba, así que
     * `split` devolvía el texto entero y «Juan Carlos» salía completo en vez de
     * «Juan». Se veía como un problema de datos y era de escapado.
     */
    const primeraPalabra = (texto) => (texto || '').trim().split(/\s+/)[0] || '';

    const usuarioNombre = computed(() => {
      const nombre = [
        primeraPalabra(perfil.value?.nombres),
        primeraPalabra(perfil.value?.apellidos),
      ].filter(Boolean).join(' ');

      if (nombre) return nombre;

      // Mientras la ficha carga —o si falla— se saluda de forma genérica. Antes
      // se recurría al correo, y ver la propia dirección en un titular grande
      // resulta impersonal y además revela el correo a quien mire la pantalla.
      return 'Ciudadano';
    });

    /** Nombre del distrito, resuelto contra el catálogo desde `distrito_id`. */
    const distritoUsuario = computed(() => {
      const id = perfil.value?.distrito_id;
      if (id == null) return 'No especificado';
      const encontrado = (distritos.value || []).find((d) => d.id === id);
      return encontrado?.nombre || 'No especificado';
    });

    return {
      usuarioNombre,
      distritoUsuario,
      mostrarModalLogout,
      confirmarLogout,
      irA,
    };
  },
};
