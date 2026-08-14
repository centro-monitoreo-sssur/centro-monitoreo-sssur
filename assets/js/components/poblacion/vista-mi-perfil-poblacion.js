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
// El mismo endpoint de cPanel que usa la PWA de campo. Sirve tal cual: nombra
// el archivo con el `sub` del token y no exige pertenecer a `usuarios`, así que
// un ciudadano autenticado es un remitente igual de válido.
import { subirFotoPerfil, almacenamientoConfigurado } from '../../services/fotos-perfil.js';

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

    /* ─── Foto ───────────────────────────────────────────────────────────
       Va aparte del modal a propósito: cambiar la foto es un gesto suelto
       —se pulsa el avatar y se elige— y meterlo dentro del formulario
       obligaría a abrirlo y guardarlo para algo que ya se resolvió al subir.

       La imagen no viaja a Supabase: el endpoint de cPanel la comprime y la
       guarda, y en la base solo queda la URL. Es lo que mantiene el plan
       gratuito lejos de su límite de disco. */
    const subiendoFoto = ref(false);
    const fotoUrl = computed(() => perfil.value?.foto_url || '');
    const fotoConfigurada = almacenamientoConfigurado;

    const cambiarFoto = async (evento) => {
      const archivo = evento.target?.files?.[0];
      // Se limpia el input SIEMPRE: si no, elegir la misma foto dos veces
      // seguidas no dispara `change` y parecería que el botón dejó de servir.
      if (evento.target) evento.target.value = '';
      if (!archivo) return;

      errorPerfil.value = '';
      avisoPerfil.value = '';
      subiendoFoto.value = true;
      try {
        const subida = await subirFotoPerfil(archivo);
        if (!subida.ok) { errorPerfil.value = subida.error; return; }

        // La URL se guarda con el mismo camino que el resto del perfil, así
        // que hereda la comprobación de filas afectadas: una escritura que la
        // RLS deniegue responde 200 con cero filas y sin error.
        const res = await actualizarPerfil({ foto_url: subida.url });
        if (!res.ok) { errorPerfil.value = res.error; return; }

        avisoPerfil.value = 'Foto actualizada.';
      } catch (e) {
        errorPerfil.value = 'No se pudo actualizar la foto.';
        console.error('[mi-perfil] Falló el cambio de foto:', e);
      } finally {
        subiendoFoto.value = false;
      }
    };

    /** Iniciales para el avatar cuando no hay foto. */
    const iniciales = computed(() => {
      const n = (perfil.value?.nombres || '').trim().split(/\s+/)[0] || '';
      const a = (perfil.value?.apellidos || '').trim().split(/\s+/)[0] || '';
      return ((n[0] || '') + (a[0] || '')).toUpperCase() || 'C';
    });

    onMounted(async () => {
      if (!distritos.value.length) cargarDistritos();
      if (!perfil.value) await cargarPerfil();
      inicializarFormulario();
    });

    return {
      // Ficha
      nombreCompleto, correoUsuario, duiUsuario,
      telefonoUsuario, direccionUsuario, distritoUsuario,
      // Foto
      fotoUrl, iniciales, cambiarFoto, subiendoFoto, fotoConfigurada,
      // Edición
      formulario, distritosOpciones,
      mostrarModalEditarPerfil, abrirEdicion, guardarPerfil, cancelarEdicion,
      guardandoPerfil, errorPerfil, avisoPerfil,
      irA,
    };
  },
};
