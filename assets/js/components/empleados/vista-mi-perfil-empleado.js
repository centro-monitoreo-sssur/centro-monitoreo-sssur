// Vista: Mi Perfil (Empleado)
// DEMO: Funcionalidad simulada - reemplazar con API real
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    
    // Estado del formulario de perfil
    const formulario = ref({
      nombres: '',
      apellidos: '',
      telefono: '',
      cargo: '',
      departamento: ''
    });
    
    // Estado del formulario de cambio de correo
    const formularioCorreo = ref({
      correoActual: '',
      correoNuevo: '',
      confirmarCorreo: ''
    });
    
    // Estado de modales
    const mostrarModalEditarPerfil = ref(false);
    const mostrarModalCambiarCorreo = ref(false);
    const mostrarModalEliminarCuenta = ref(false);
    const mostrarModalConfirmacionEliminar = ref(false);
    
    // Estado de carga
    const guardandoPerfil = ref(false);
    const enviandoCorreo = ref(false);
    const eliminandoCuenta = ref(false);
    
    // Obtener datos del empleado del localStorage
    const empleadoDatos = computed(() => {
      const datos = localStorage.getItem('empleado_datos');
      return datos ? JSON.parse(datos) : null;
    });
    
    // Nombre completo del usuario
    const nombreCompleto = computed(() => {
      if (empleadoDatos.value) {
        return `${empleadoDatos.value.nombres} ${empleadoDatos.value.apellidos}`;
      }
      return 'Empleado';
    });
    
    // Correo del usuario (solo lectura)
    const correoUsuario = computed(() => {
      return empleadoDatos.value?.correo || 'No especificado';
    });
    
    // Inicializar formulario con datos actuales
    const inicializarFormulario = () => {
      if (empleadoDatos.value) {
        formulario.value = {
          nombres: empleadoDatos.value.nombres || '',
          apellidos: empleadoDatos.value.apellidos || '',
          telefono: empleadoDatos.value.telefono || '',
          cargo: empleadoDatos.value.cargo || '',
          departamento: empleadoDatos.value.departamento || ''
        };
        formularioCorreo.value.correoActual = empleadoDatos.value.correo || '';
      }
    };
    
    // Guardar cambios en el perfil
    const guardarPerfil = () => {
      guardandoPerfil.value = true;
      
      // DEMO: Simular guardado
      setTimeout(() => {
        const datosActualizados = {
          ...empleadoDatos.value,
          nombres: formulario.value.nombres,
          apellidos: formulario.value.apellidos,
          telefono: formulario.value.telefono,
          cargo: formulario.value.cargo,
          departamento: formulario.value.departamento
        };
        
        localStorage.setItem('empleado_datos', JSON.stringify(datosActualizados));
        
        guardandoPerfil.value = false;
        mostrarModalEditarPerfil.value = false;
        
        alert('Perfil actualizado exitosamente');
      }, 1000);
    };
    
    // Enviar solicitud de cambio de correo
    const enviarSolicitudCorreo = () => {
      if (!formularioCorreo.value.correoNuevo || !formularioCorreo.value.confirmarCorreo) {
        alert('Por favor completa todos los campos');
        return;
      }
      
      if (formularioCorreo.value.correoNuevo !== formularioCorreo.value.confirmarCorreo) {
        alert('Los correos no coinciden');
        return;
      }
      
      if (formularioCorreo.value.correoNuevo === formularioCorreo.value.correoActual) {
        alert('El nuevo correo debe ser diferente al actual');
        return;
      }
      
      enviandoCorreo.value = true;
      
      // DEMO: Simular envío de solicitud
      setTimeout(() => {
        enviandoCorreo.value = false;
        mostrarModalCambiarCorreo.value = false;
        
        // Limpiar formulario
        formularioCorreo.value.correoNuevo = '';
        formularioCorreo.value.confirmarCorreo = '';
        
        alert('Solicitud de cambio de correo enviada. Revisa tu correo actual para confirmar.');
      }, 1500);
    };
    
    // Eliminar cuenta
    const eliminarCuenta = () => {
      eliminandoCuenta.value = true;
      
      // DEMO: Simular soft delete
      setTimeout(() => {
        // Marcar cuenta como eliminada (soft delete)
        const datosEliminados = {
          ...empleadoDatos.value,
          eliminado: true,
          fecha_eliminacion: new Date().toISOString(),
          razon_eliminacion: 'Solicitud del usuario'
        };
        
        localStorage.setItem('empleado_datos_eliminado', JSON.stringify(datosEliminados));
        localStorage.removeItem('empleado_datos');
        localStorage.removeItem('empleado_autenticado');
        
        eliminandoCuenta.value = false;
        mostrarModalEliminarCuenta.value = false;
        mostrarModalConfirmacionEliminar.value = false;
        
        irA('login');
      }, 1500);
    };
    
    // Cancelar edición de perfil
    const cancelarEdicion = () => {
      inicializarFormulario();
      mostrarModalEditarPerfil.value = false;
    };
    
    // Cancelar cambio de correo
    const cancelarCambioCorreo = () => {
      formularioCorreo.value.correoNuevo = '';
      formularioCorreo.value.confirmarCorreo = '';
      mostrarModalCambiarCorreo.value = false;
    };
    
    onMounted(() => {
      inicializarFormulario();
    });
    
    return {
      formulario,
      formularioCorreo,
      nombreCompleto,
      correoUsuario,
      mostrarModalEditarPerfil,
      mostrarModalCambiarCorreo,
      mostrarModalEliminarCuenta,
      mostrarModalConfirmacionEliminar,
      guardandoPerfil,
      enviandoCorreo,
      eliminandoCuenta,
      guardarPerfil,
      enviarSolicitudCorreo,
      eliminarCuenta,
      cancelarEdicion,
      cancelarCambioCorreo,
      irA
    };
  }
};
