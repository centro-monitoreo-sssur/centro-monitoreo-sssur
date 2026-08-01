// ============================================================================
// VISTA: cierre de incidente (PWA de empleado)
//
// El cierre pasa por el RPC `cerrar_caso_campo` (migration_v20). Antes era un
// `update` suelto desde el navegador con `estado_codigo: 'resuelta'` fijo y sin
// escribir historial: si la actualización pasaba pero el registro de auditoría
// no, el caso quedaba cerrado sin rastro de quién ni cuándo.
//
// Además el caso se leía de una copia en localStorage, así que se podía cerrar
// un caso basándose en un estado que ya no era el vigente.
// ============================================================================
import { ref, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useMisCasos } from '../../stores/mis-casos.js';
import { useOfflineQueue } from '../../stores/offline-queue.js';
import { useConexion } from '../../services/conexion.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { casoSeleccionado, cerrarCaso, refrescarCaso } = useMisCasos();
    const { agregarOperacion, TIPOS_OPERACION } = useOfflineQueue();
    const { estaOnline } = useConexion();

    const observaciones = ref('');
    const resolucion = ref('');
    const guardando = ref(false);
    const resultado = ref(null);   // { tipo: 'ok'|'error'|'encolado', texto }

    const incidenteActivo = casoSeleccionado;
    // La plantilla lo usa para el `v-if` del formulario y como valor del id.
    const incidenteSeleccionado = computed(() => incidenteActivo.value?.id || '');

    const puedeGuardar = computed(() =>
      !guardando.value &&
      Boolean(incidenteActivo.value) &&
      resolucion.value.trim().length >= 10
    );

    const guardarCierre = async () => {
      resultado.value = null;

      if (!incidenteActivo.value) {
        resultado.value = { tipo: 'error', texto: 'No hay ningún incidente seleccionado.' };
        return;
      }
      // Mismo mínimo que exige el RPC. Se comprueba aquí para no gastar un
      // viaje de red ni encolar algo que se sabe que la base va a rechazar.
      if (resolucion.value.trim().length < 10) {
        resultado.value = {
          tipo: 'error',
          texto: 'Describe la resolución con al menos 10 caracteres.',
        };
        return;
      }

      const datosCierre = {
        casoId: incidenteActivo.value.id,
        resolucion: resolucion.value.trim(),
        observaciones: observaciones.value.trim(),
        // Las evidencias fotográficas se subirán a cPanel y viajarán como URL.
        // Mientras ese endpoint no exista, se cierra sin ellas: es preferible
        // un cierre registrado sin foto a un cierre que no se registra.
        adjuntos: [],
      };

      guardando.value = true;
      try {
        if (estaOnline.value) {
          const r = await cerrarCaso(datosCierre);

          if (r.ok) {
            resultado.value = {
              // Un caso ya cerrado no es un fallo: es el reintento del buzón, o
              // que alguien lo cerró desde el Centro de Monitoreo mientras
              // tanto. Se avisa en ámbar para que el empleado lo sepa.
              tipo: r.yaCerrado ? 'encolado' : 'ok',
              texto: r.mensaje,
            };
            setTimeout(() => irA('mis-intervenciones'), 1600);
            return;
          }

          // Rechazo del servidor: encolar solo repetiría el mismo error hasta
          // agotar los reintentos, y el empleado se iría creyendo que quedó
          // cerrado. Se le dice ahora, que es cuando puede corregirlo.
          if (!r.esDeRed) {
            resultado.value = { tipo: 'error', texto: r.mensaje };
            return;
          }
        }

        // Sin conexión, o el envío no llegó a salir del teléfono.
        const encolado = agregarOperacion({
          tipo: TIPOS_OPERACION.CERRAR_INCIDENTE,
          datos: datosCierre,
          prioridad: 'alta',
        });

        if (!encolado.ok) {
          resultado.value = { tipo: 'error', texto: encolado.mensaje };
          return;
        }

        resultado.value = {
          tipo: 'encolado',
          texto: 'Sin señal. El cierre quedó en el buzón y se enviará solo al recuperar cobertura.',
        };
        setTimeout(() => irA('mis-intervenciones'), 2200);
      } finally {
        guardando.value = false;
      }
    };

    onMounted(async () => {
      if (!incidenteActivo.value) {
        irA('mis-intervenciones');
        return;
      }
      // Releer antes de cerrar: puede haberse cerrado o reasignado desde el
      // Centro de Monitoreo mientras el empleado llegaba al sitio.
      await refrescarCaso(incidenteActivo.value.id);

      if (incidenteActivo.value?.esFinal) {
        resultado.value = {
          tipo: 'encolado',
          texto: 'Este caso ya fue cerrado. No hay nada que registrar.',
        };
      }
    });

    return {
      incidenteActivo,
      incidenteSeleccionado,
      observaciones,
      resolucion,
      guardando,
      puedeGuardar,
      resultado,
      estaOnline,
      guardarCierre,
      irA,
    };
  },
};
