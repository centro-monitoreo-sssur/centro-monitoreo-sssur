// Vista: Cierre de Incidente (Empleados)
// Offline-first: intenta actualizar en Supabase, encola si no hay conexión.
import { ref, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useIntervenciones } from '../../stores/intervenciones.js';
import { useOfflineQueue } from '../../stores/offline-queue.js';
import { useConexion } from '../../services/conexion.js';
import { db } from '../../services/supabase-api.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { intervenciones, cargarIntervenciones } = useIntervenciones();
    const { agregarOperacion, TIPOS_OPERACION } = useOfflineQueue();
    const { estaOnline } = useConexion();

    const incidenteSeleccionado = ref('');
    const incidenteActivo = ref(null);
    const observaciones = ref('');
    const resolucion = ref('');
    const guardando = ref(false);

    // Cargar intervención activa pre-seleccionada desde localStorage
    const cargarIncidenteActivo = () => {
      const raw = localStorage.getItem('intervencion_activa');
      if (!raw) {
        irA('mis-intervenciones');
        return;
      }
      try {
        const act = JSON.parse(raw);
        incidenteActivo.value = act;
        incidenteSeleccionado.value = act.id;
      } catch(e) {
        irA('mis-intervenciones');
      }
    };

    const guardarCierre = async () => {
      if (!incidenteSeleccionado.value) {
        alert('No hay incidente activo seleccionado.');
        return;
      }
      if (!resolucion.value.trim()) {
        alert('Por favor describe la resolución del incidente.');
        return;
      }

      guardando.value = true;

      const payload = {
        id: incidenteSeleccionado.value,
        estado_codigo: 'resuelta',
        resolucion: resolucion.value,
        observaciones: observaciones.value,
      };

      // --- Offline-first ---
      if (estaOnline.value && db) {
        try {
          const { error } = await db.from('casos').update({
            estado_codigo: 'resuelta',
            resolucion: resolucion.value,
            fecha_cierre: new Date().toISOString()
          }).eq('id', incidenteSeleccionado.value);

          if (error) throw error;

          localStorage.removeItem('intervencion_activa');
          guardando.value = false;
          alert('✅ Cierre registrado exitosamente.');
          irA('mis-intervenciones');
          return;
        } catch(e) {
          console.warn('[CierreIncidente] Error DB, encolando...', e.message);
        }
      }

      // Sin conexión o fallo → encolar
      agregarOperacion({
        tipo: TIPOS_OPERACION.CERRAR_INCIDENTE,
        datos: payload,
        prioridad: 'alta'
      });

      localStorage.removeItem('intervencion_activa');
      guardando.value = false;
      alert('📥 Sin conexión. El cierre fue guardado en el buzón offline y se sincronizará automáticamente.');
      irA('mis-intervenciones');
    };

    onMounted(() => {
      cargarIncidenteActivo();
      if (typeof cargarIntervenciones === 'function') cargarIntervenciones();
    });

    return {
      incidenteActivo,
      incidenteSeleccionado,
      observaciones,
      resolucion,
      guardando,
      estaOnline,
      guardarCierre,
      irA
    };
  }
};
