// ============================================================================
// VISTA: Mi Perfil (PWA de empleado)
//
// Antes era una demostración: leía `localStorage.getItem('empleado_datos')`,
// una clave que NADIE escribe nunca, así que todos los campos mostraban «No
// especificado». Guardar era un `setTimeout` que escribía en esa misma clave
// fantasma, y había un botón de «Eliminar mi cuenta» que borraba la sesión.
//
// Ahora lee de `usuarios` con el UUID de la sesión, igual que hace
// `stores/navegacion.js` al resolver el perfil.
//
// ── QUÉ PUEDE CAMBIARSE UNO MISMO ───────────────────────────────────────────
// Solo TELÉFONO y FOTOGRAFÍA. Cargo, departamento y correo son datos
// institucionales: se solicitan a la Gerencia de Tecnología, que los cambia
// desde el panel de administración. Decisión de la Gerencia, 12-ago-2026.
//
// No es solo una regla de interfaz: `migration_v31` la hace cumplir en la base
// con un trigger. Sin él, cualquier empleado podía ascenderse a
// superadministrador editando su propio `rol_id` —RLS controla filas, no
// columnas— y todo el modelo de permisos se apoya en esa columna.
//
// El borrado de cuenta se retiró: dar de baja a un empleado municipal es
// decisión de la administración, no del propio empleado.
// ============================================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { db } from '../../core/supabase.js';
import { subirFotoPerfil, almacenamientoConfigurado } from '../../services/fotos-perfil.js';

const COLUMNAS_PERFIL =
  'id, nombres, apellidos, username, email_institucional, telefono, ' +
  'foto_perfil_url, puesto_cargo, departamento_id, distrito_id, rol_id, activo';

export default {
  setup() {
    const { irA, usuarioId } = useNavegacion();
    const {
      departamentos, distritos,
      cargarDepartamentos, cargarDistritos,
      nombreDepartamento, nombreDistrito,
    } = useCatalogos();

    const perfil = ref(null);
    const cargando = ref(true);
    const error = ref('');

    // Estado de la edición
    const modalEditar = ref(false);
    const telefonoEditado = ref('');
    const guardando = ref(false);
    const errorEdicion = ref('');
    const aviso = ref('');

    // Estado de la fotografía
    const subiendoFoto = ref(false);

    /* ─── Carga ─────────────────────────────────────────────────────────── */

    const cargarPerfil = async () => {
      if (!db) { error.value = 'Sin conexión a la base de datos.'; cargando.value = false; return; }
      cargando.value = true;
      error.value = '';
      try {
        const { data: { session } } = await db.auth.getSession();
        const uid = session?.user?.id || usuarioId.value;
        if (!uid) {
          error.value = 'Tu sesión expiró. Vuelve a iniciar sesión.';
          return;
        }

        // `maybeSingle` y no `single`: con cero filas, `single` devuelve un 406
        // y aquí «no hay ficha» es un estado posible, no un error de red.
        const { data, error: err } = await db
          .from('usuarios').select(COLUMNAS_PERFIL).eq('id', uid).maybeSingle();
        if (err) throw err;

        if (!data) {
          error.value = 'Tu usuario no tiene ficha en el sistema. Avisa a la ' +
                        'Gerencia de Tecnología.';
          return;
        }
        perfil.value = data;
        telefonoEditado.value = data.telefono || '';
      } catch (e) {
        console.error('[mi-perfil] cargarPerfil:', e);
        error.value = 'No se pudo cargar tu perfil. Revisa tu conexión.';
      } finally {
        cargando.value = false;
      }
    };

    /* ─── Presentación ──────────────────────────────────────────────────── */

    const nombreCompleto = computed(() => {
      const p = perfil.value;
      if (!p) return 'Empleado';
      return [p.nombres, p.apellidos].filter(Boolean).join(' ').trim()
        || p.username || 'Empleado';
    });

    /** Iniciales para el avatar cuando no hay fotografía. */
    const iniciales = computed(() => {
      const p = perfil.value;
      if (!p) return 'E';
      const a = (p.nombres || '').trim()[0] || '';
      const b = (p.apellidos || '').trim()[0] || '';
      return (a + b).toUpperCase() || (p.username || 'E')[0].toUpperCase();
    });

    /* Campos de solo lectura, en el orden en que se muestran.
       Se devuelve una lista y no propiedades sueltas para que la plantilla los
       pinte con un `v-for`: son cinco filas idénticas y repetir el marcado cinco
       veces es cinco sitios donde corregir cualquier ajuste. */
    const datosInstitucionales = computed(() => {
      const p = perfil.value;
      if (!p) return [];
      return [
        { icono: 'fa-envelope',  etiqueta: 'Correo institucional', valor: p.email_institucional },
        { icono: 'fa-id-badge',  etiqueta: 'Usuario',              valor: p.username },
        { icono: 'fa-briefcase', etiqueta: 'Cargo',                valor: p.puesto_cargo },
        { icono: 'fa-building',  etiqueta: 'Departamento',         valor: nombreDepartamento(p.departamento_id) },
        { icono: 'fa-map-pin',   etiqueta: 'Distrito',             valor: nombreDistrito(p.distrito_id) },
      ].map((f) => ({ ...f, valor: f.valor || 'No registrado' }));
    });

    const telefonoMostrado = computed(() => perfil.value?.telefono || 'Sin registrar');

    /* ─── Edición del teléfono ──────────────────────────────────────────── */

    const abrirEdicion = () => {
      errorEdicion.value = '';
      telefonoEditado.value = perfil.value?.telefono || '';
      modalEditar.value = true;
    };

    const cerrarEdicion = () => { modalEditar.value = false; };

    const guardarTelefono = async () => {
      if (guardando.value) return;
      errorEdicion.value = '';

      const valor = telefonoEditado.value.trim();
      // Se acepta vacío —borrar el teléfono es legítimo— pero si hay algo,
      // tiene que parecer un número salvadoreño.
      if (valor && !/^[\d+][\d\s()+-]{6,19}$/.test(valor)) {
        errorEdicion.value = 'El teléfono no parece válido. Ej: 7712-3456';
        return;
      }

      guardando.value = true;
      try {
        // Se envía SOLO el teléfono. El trigger de la v31 congelaría el resto
        // igualmente, pero mandar la fila entera y confiar en que el servidor
        // la limpie es pedirle a la red que transporte lo que no hace falta.
        const { data, error: err } = await db
          .from('usuarios')
          .update({ telefono: valor || null })
          .eq('id', perfil.value.id)
          .select(COLUMNAS_PERFIL);
        if (err) throw err;

        // Una escritura bloqueada por RLS responde 200 con cero filas: sin esta
        // comprobación, la pantalla diría «guardado» sin haber guardado.
        if (!Array.isArray(data) || !data.length) {
          errorEdicion.value = 'La base aceptó la petición pero no actualizó nada. ' +
                               'Avisa a la Gerencia de Tecnología.';
          return;
        }

        perfil.value = data[0];
        modalEditar.value = false;
        aviso.value = 'Teléfono actualizado.';
        setTimeout(() => { aviso.value = ''; }, 3000);
      } catch (e) {
        console.error('[mi-perfil] guardarTelefono:', e);
        errorEdicion.value = e.message || 'No se pudo guardar el teléfono.';
      } finally {
        guardando.value = false;
      }
    };

    /* ─── Fotografía ────────────────────────────────────────────────────── */

    const cambiarFoto = async (evento) => {
      const archivo = (evento.target.files || [])[0];
      evento.target.value = '';           // permite reelegir la misma imagen
      if (!archivo) return;

      if (!almacenamientoConfigurado) {
        aviso.value = 'La subida de fotos no está configurada en este servidor.';
        setTimeout(() => { aviso.value = ''; }, 4000);
        return;
      }

      subiendoFoto.value = true;
      errorEdicion.value = '';
      try {
        const res = await subirFotoPerfil(archivo);
        if (!res.ok) { aviso.value = res.error; return; }

        const { data, error: err } = await db
          .from('usuarios')
          .update({ foto_perfil_url: res.url })
          .eq('id', perfil.value.id)
          .select(COLUMNAS_PERFIL);
        if (err) throw err;
        if (!Array.isArray(data) || !data.length) {
          aviso.value = 'La foto subió pero no se pudo asociar a tu ficha.';
          return;
        }

        perfil.value = data[0];
        aviso.value = 'Fotografía actualizada.';
      } catch (e) {
        console.error('[mi-perfil] cambiarFoto:', e);
        aviso.value = 'No se pudo actualizar la fotografía.';
      } finally {
        subiendoFoto.value = false;
        setTimeout(() => { aviso.value = ''; }, 4000);
      }
    };

    /* ─── Ciclo de vida ─────────────────────────────────────────────────── */

    onMounted(() => {
      // Los catálogos traducen departamento_id y distrito_id a sus nombres.
      Promise.all([cargarPerfil(), cargarDepartamentos(), cargarDistritos()]);
    });

    return {
      // Estado
      perfil, cargando, error, aviso,
      modalEditar, telefonoEditado, guardando, errorEdicion, subiendoFoto,
      almacenamientoConfigurado,

      // Derivados
      nombreCompleto, iniciales, datosInstitucionales, telefonoMostrado,

      // Acciones
      abrirEdicion, cerrarEdicion, guardarTelefono, cambiarFoto, cargarPerfil,
      irA,
    };
  },
};
