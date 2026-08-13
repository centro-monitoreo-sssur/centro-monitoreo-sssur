// Vista: Mi Perfil (Población)
//
// Leía `localStorage.ciudadano_datos`, la clave del registro simulado. Ese
// registro ya no existe —el bloque 2 lo sustituyó por cuentas reales— así que
// la clave no se rellena nunca y la pantalla mostraba «No especificado» en
// todos los campos. Ahora sale de la tabla `ciudadanos` vía
// `stores/ciudadano.js`.
//
// ── QUÉ PUEDE CAMBIAR EL CIUDADANO ──────────────────────────────────────────
// Teléfono, dirección y distrito. La gente se muda y cambia de número.
//
// NO puede cambiar nombres, apellidos, DUI ni fecha de nacimiento: son su
// identidad y los corrige TI desde el panel, que es la misma política que se
// aplicó al personal en la v31. No es solo una decisión de interfaz — el
// trigger `fn_protege_ficha_ciudadano` de la v32 revierte esos campos en el
// servidor aunque alguien los envíe desde la consola del navegador.
//
// El correo tampoco se cambia aquí: vive en `auth.users` y cambiarlo exige
// verificar la dirección nueva. Se deja como solicitud a la Alcaldía.
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useCiudadano } from '../../stores/ciudadano.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { distritos, cargarDistritos } = useCatalogos();
    const { perfil, correoCuenta, cargarPerfil, actualizarPerfil } = useCiudadano();

    // Solo lo editable. Antes incluía nombres y apellidos, que el servidor
    // revierte: la pantalla decía «guardado» y el nombre seguía igual.
    const formulario = ref({
      telefono: '',
      direccion: '',
      distrito_id: '',
    });

    const mostrarModalEditarPerfil = ref(false);
    const guardandoPerfil = ref(false);
    const errorPerfil = ref('');
    const avisoPerfil = ref('');

    const nombreCompleto = computed(() => {
      const n = [perfil.value?.nombres, perfil.value?.apellidos]
        .filter(Boolean).join(' ').trim();
      return n || 'Ciudadano';
    });

    /** El correo sale de la cuenta, no de la ficha. Ver la v32. */
    const correoUsuario = computed(() => correoCuenta.value || 'No especificado');

    const duiUsuario      = computed(() => perfil.value?.dui || 'No especificado');
    const telefonoUsuario = computed(() => perfil.value?.telefono || 'No especificado');
    const direccionUsuario = computed(() => perfil.value?.direccion || 'No especificada');

    const distritoUsuario = computed(() => {
      const id = perfil.value?.distrito_id;
      if (id == null) return 'No especificado';
      return (distritos.value || []).find((d) => d.id === id)?.nombre || 'No especificado';
    });

    const distritosOpciones = computed(() => distritos.value || []);

    /** Copia la ficha al formulario del modal. */
    const inicializarFormulario = () => {
      formulario.value = {
        telefono:    perfil.value?.telefono || '',
        direccion:   perfil.value?.direccion || '',
        distrito_id: perfil.value?.distrito_id ?? '',
      };
    };

    const abrirEdicion = () => {
      errorPerfil.value = '';
      avisoPerfil.value = '';
      inicializarFormulario();
      mostrarModalEditarPerfil.value = true;
    };

    const guardarPerfil = async () => {
      errorPerfil.value = '';
      avisoPerfil.value = '';
      guardandoPerfil.value = true;
      try {
        const resultado = await actualizarPerfil({
          telefono:  formulario.value.telefono.trim(),
          direccion: formulario.value.direccion.trim(),
          // El `<select>` devuelve texto; la columna es smallint.
          distrito_id: formulario.value.distrito_id === ''
            ? null
            : Number(formulario.value.distrito_id),
        });

        if (!resultado.ok) {
          errorPerfil.value = resultado.error;
          return;
        }
        mostrarModalEditarPerfil.value = false;
        avisoPerfil.value = 'Datos actualizados.';
      } finally {
        guardandoPerfil.value = false;
      }
    };

    const cancelarEdicion = () => {
      inicializarFormulario();
      mostrarModalEditarPerfil.value = false;
    };

    onMounted(async () => {
      if (!distritos.value.length) cargarDistritos();
      if (!perfil.value) await cargarPerfil();
      inicializarFormulario();
    });

    return {
      // Ficha
      nombreCompleto, correoUsuario, duiUsuario,
      telefonoUsuario, direccionUsuario, distritoUsuario,
      // Edición
      formulario, distritosOpciones,
      mostrarModalEditarPerfil, abrirEdicion, guardarPerfil, cancelarEdicion,
      guardandoPerfil, errorPerfil, avisoPerfil,
      irA,
    };
  },
};
