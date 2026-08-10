// ============================================================
// COMPONENTE: Roles y Permisos
// Alta, edición y baja de roles + matriz de acceso por módulo, editable.
//
// Antes esta pantalla era de solo lectura: el botón "Crear Rol" estaba
// `disabled` y la matriz solo pintaba casillas. El motivo de fondo no era el
// frontend — `roles`, `permisos_modulos` y `roles_permisos` tienen RLS activo
// y solo políticas de SELECT, así que la base rechazaba toda escritura.
// Requiere `database/migration_v22_gestion_roles.sql`.
//
// Los datos de demo se eliminaron a propósito. En una pantalla de control de
// acceso, una matriz inventada es peor que una vacía: enseña permisos que nadie
// tiene y esconde los que sí están concedidos.
// ============================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useRoles } from '../../stores/roles.js';
import { useNavegacion } from '../../stores/navegacion.js';

const ROL_NUEVO = () => ({ id: null, codigo: '', nombre: '', descripcion: '', activo: true });

// Paleta de la tarjeta por posición. No viene de la BD: `roles` no tiene
// columna de color y añadirla sería guardar decoración en el modelo de
// seguridad.
const COLORES = [
  { texto: 'text-purple-600 dark:text-purple-300', fondo: 'bg-purple-100 dark:bg-purple-900/40' },
  { texto: 'text-brand-600 dark:text-brand-300',   fondo: 'bg-brand-50 dark:bg-brand-900/40' },
  { texto: 'text-amber-600 dark:text-amber-300',   fondo: 'bg-amber-100 dark:bg-amber-900/40' },
  { texto: 'text-indigo-600 dark:text-indigo-300', fondo: 'bg-indigo-100 dark:bg-indigo-900/40' },
  { texto: 'text-emerald-600 dark:text-emerald-300', fondo: 'bg-emerald-100 dark:bg-emerald-900/40' },
  { texto: 'text-rose-600 dark:text-rose-300',     fondo: 'bg-rose-100 dark:bg-rose-900/40' },
];

const ETIQUETAS_ACCION = {
  leer:     { titulo: 'Ver',      ayuda: 'Abrir el módulo y consultar sus datos' },
  escribir: { titulo: 'Editar',   ayuda: 'Crear y modificar registros' },
  borrar:   { titulo: 'Eliminar', ayuda: 'Dar de baja registros' },
  exportar: { titulo: 'Exportar', ayuda: 'Descargar datos en CSV o reportes' },
};

export default {
  name: 'vista-roles',
  setup() {
    const {
      roles, modulos, cargando, guardando, error,
      cargarTodo, guardarRol, eliminarRol,
      tienePermiso, fijarPermiso, conteoDeRol, ACCIONES,
    } = useRoles();
    const { rolUsuario } = useNavegacion();

    const rolSeleccionado = ref(null);
    const mensaje = ref({ tipo: '', texto: '' });

    // Modal de alta/edición
    const modalAbierto = ref(false);
    const formulario = ref(ROL_NUEVO());
    const errorFormulario = ref('');

    // Modal de confirmación de borrado
    const rolABorrar = ref(null);

    // Casilla en curso, para deshabilitar solo esa y no la matriz entera.
    const casillaEnCurso = ref('');

    // La escritura está reservada a superadmin por `migration_v22`. Se refleja
    // en la UI en vez de dejar pulsar botones que la base va a rechazar: un
    // permiso denegado tras el clic se percibe como una avería.
    const puedeGestionar = computed(() => rolUsuario.value === 'superadmin');

    const colorDe = (indice) => COLORES[indice % COLORES.length];

    const etiquetaDe = (accion) => ETIQUETAS_ACCION[accion] || { titulo: accion, ayuda: '' };

    function avisar(tipo, texto) {
      mensaje.value = { tipo, texto };
      if (tipo === 'ok') setTimeout(() => { mensaje.value = { tipo: '', texto: '' }; }, 4000);
    }

    function seleccionarRol(rol) {
      rolSeleccionado.value = rol;
    }

    // ── Alta / edición ──────────────────────────────────────────────────────
    function abrirNuevo() {
      formulario.value = ROL_NUEVO();
      errorFormulario.value = '';
      modalAbierto.value = true;
    }

    function abrirEdicion(rol) {
      formulario.value = {
        id: rol.id,
        codigo: rol.codigo,
        nombre: rol.nombre,
        descripcion: rol.descripcion || '',
        activo: rol.activo !== false,
        es_sistema: rol.es_sistema === true,
      };
      errorFormulario.value = '';
      modalAbierto.value = true;
    }

    function cerrarModal() {
      modalAbierto.value = false;
      errorFormulario.value = '';
    }

    async function confirmarGuardado() {
      errorFormulario.value = '';
      const resultado = await guardarRol(formulario.value);
      if (!resultado.ok) { errorFormulario.value = resultado.error; return; }

      cerrarModal();
      avisar('ok', formulario.value.id ? 'Rol actualizado.' : 'Rol creado.');
      // Tras crear, se abre el nuevo rol: lo siguiente que se quiere hacer
      // siempre es asignarle permisos.
      if (resultado.rol) {
        rolSeleccionado.value = roles.value.find((r) => r.id === resultado.rol.id) || rolSeleccionado.value;
      }
    }

    // ── Baja ────────────────────────────────────────────────────────────────
    function pedirBorrado(rol) {
      rolABorrar.value = rol;
    }

    async function confirmarBorrado() {
      const rol = rolABorrar.value;
      if (!rol) return;
      const resultado = await eliminarRol(rol.id);
      rolABorrar.value = null;

      if (!resultado.ok) { avisar('error', resultado.error); return; }
      if (rolSeleccionado.value?.id === rol.id) {
        rolSeleccionado.value = roles.value[0] || null;
      }
      avisar('ok', `Rol "${rol.nombre}" eliminado.`);
    }

    // ── Matriz ──────────────────────────────────────────────────────────────
    async function alternar(modulo, accion) {
      if (!puedeGestionar.value || !rolSeleccionado.value) return;

      const rolId = rolSeleccionado.value.id;
      const valor = !tienePermiso(rolId, modulo.dbId, accion);
      casillaEnCurso.value = `${modulo.dbId}-${accion}`;

      const resultado = await fijarPermiso(rolId, modulo.dbId, accion, valor);
      casillaEnCurso.value = '';

      if (!resultado.ok) avisar('error', resultado.error);
      else if (mensaje.value.tipo === 'error') mensaje.value = { tipo: '', texto: '' };
    }

    const enCurso = (modulo, accion) => casillaEnCurso.value === `${modulo.dbId}-${accion}`;

    const marcado = (modulo, accion) =>
      rolSeleccionado.value ? tienePermiso(rolSeleccionado.value.id, modulo.dbId, accion) : false;

    onMounted(async () => {
      await cargarTodo();
      if (roles.value.length) rolSeleccionado.value = roles.value[0];
    });

    return {
      roles, modulos, cargando, guardando, error,
      rolSeleccionado, seleccionarRol, ACCIONES,
      puedeGestionar, colorDe, etiquetaDe, conteoDeRol, mensaje,
      modalAbierto, formulario, errorFormulario, abrirNuevo, abrirEdicion, cerrarModal, confirmarGuardado,
      rolABorrar, pedirBorrado, confirmarBorrado,
      alternar, marcado, enCurso,
    };
  },
};
