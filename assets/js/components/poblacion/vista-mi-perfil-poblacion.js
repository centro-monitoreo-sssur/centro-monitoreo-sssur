// Vista: Mi Perfil (Población)
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
      direccion: '',
      distrito: ''
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
    
    // Obtener datos del ciudadano del localStorage
    const ciudadanoDatos = computed(() => {
      const datos = localStorage.getItem('ciudadano_datos');
      return datos ? JSON.parse(datos) : null;
    });
    
    // Nombre completo del usuario
    const nombreCompleto = computed(() => {
      if (ciudadanoDatos.value) {
        return `${ciudadanoDatos.value.nombres} ${ciudadanoDatos.value.apellidos}`;
      }
      return 'Ciudadano';
    });
    
    // Correo del usuario (solo lectura)
    const correoUsuario = computed(() => {
      return ciudadanoDatos.value?.correo || 'No especificado';
    });
    
    // Inicializar formulario con datos actuales
    const inicializarFormulario = () => {
      if (ciudadanoDatos.value) {
        formulario.value = {
          nombres: ciudadanoDatos.value.nombres || '',
          apellidos: ciudadanoDatos.value.apellidos || '',
          telefono: ciudadanoDatos.value.telefono || '',
          direccion: ciudadanoDatos.value.direccion || '',
          distrito: ciudadanoDatos.value.distrito || ''
        };
        formularioCorreo.value.correoActual = ciudadanoDatos.value.correo || '';
      }
    };
    
    // Guardar cambios en el perfil
    const guardarPerfil = () => {
      guardandoPerfil.value = true;
      
      // DEMO: Simular guardado
      setTimeout(() => {
        const datosActualizados = {
          ...ciudadanoDatos.value,
          nombres: formulario.value.nombres,
          apellidos: formulario.value.apellidos,
          telefono: formulario.value.telefono,
          direccion: formulario.value.direccion,
          distrito: formulario.value.distrito
        };
        
        localStorage.setItem('ciudadano_datos', JSON.stringify(datosActualizados));
        
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
          ...ciudadanoDatos.value,
          eliminado: true,
          fecha_eliminacion: new Date().toISOString(),
          razon_eliminacion: 'Solicitud del usuario'
        };
        
        localStorage.setItem('ciudadano_datos_eliminado', JSON.stringify(datosEliminados));
        localStorage.removeItem('ciudadano_datos');
        localStorage.removeItem('ciudadano_autenticado');
        
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
