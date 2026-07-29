// Vista: Cierre de Incidente (Empleados)
import { ref, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    
    const incidenteSeleccionado = ref('');
    const incidenteActivo = ref(null);
    const observaciones = ref('');
    const incidentesPendientes = ref([]);
    
    const cargarIncidentes = () => {
      const intervenciones = localStorage.getItem('intervenciones_empleado');
      if (intervenciones) {
        incidentesPendientes.value = JSON.parse(intervenciones).filter(i => i.estado === 'pendiente' || i.estado === 'en_proceso');
      }
      
      const intervencionActiva = localStorage.getItem('intervencion_activa');
      if (intervencionActiva) {
        try {
          const act = JSON.parse(intervencionActiva);
          incidenteActivo.value = act;
          incidenteSeleccionado.value = act.id;
        } catch(e) {}
      } else {
        irA('mis-intervenciones');
      }
    };
    
    const guardarCierre = () => {
      if (!incidenteSeleccionado.value) {
        alert('Por favor selecciona un incidente');
        return;
      }
      
      alert('Cierre de incidente registrado exitosamente');
      irA('mis-intervenciones');
    };
    
    onMounted(() => {
      cargarIncidentes();
    });
    
    return {
      incidenteSeleccionado,
      incidenteActivo,
      observaciones,
      incidentesPendientes,
      irA,
      guardarCierre
    };
  }
};
