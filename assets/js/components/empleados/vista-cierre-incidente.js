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
import { comprimirImagenDual } from '../../utils/image-compressor.js';
import { subirEvidencias, evidenciasConfiguradas } from '../../services/evidencias.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { casoSeleccionado, cerrarCaso, refrescarCaso } = useMisCasos();
    const { agregarOperacion, TIPOS_OPERACION } = useOfflineQueue();
    const { estaOnline } = useConexion();

    const observaciones = ref('');
    const resolucion = ref('');
    const guardando = ref(false);
    // Subir dos fotos por una conexión móvil tarda lo suficiente como para que,
    // sin aviso, el empleado crea que la aplicación se colgó.
    const subiendoFotos = ref(false);
    const resultado = ref(null);   // { tipo: 'ok'|'error'|'encolado'|'advertencia', texto }

    /* ─── Evidencia fotográfica del cierre ─────────────────────────────────
       Cada elemento guarda las DOS formas de la imagen: `vistaPrevia` es el
       DataURL que se pinta en la cuadrícula, y `archivo` el Blob que se sube.
       No son intercambiables: `FormData.append` con una cadena la manda como
       campo de texto y en el servidor `$_FILES` llega vacío. Ver el comentario
       de utils/image-compressor.js. */
    const MAX_FOTOS = 3;
    const fotos = ref([]);
    const fotoProcesando = ref(false);

    const procesarFotografia = async (evento) => {
      const seleccionados = Array.from(evento.target.files || []);
      evento.target.value = '';            // permite volver a elegir la misma foto
      if (!seleccionados.length) return;

      const espacio = MAX_FOTOS - fotos.value.length;
      if (espacio <= 0) {
        resultado.value = {
          tipo: 'advertencia',
          texto: `Puedes adjuntar como máximo ${MAX_FOTOS} fotografías al cierre.`,
        };
        return;
      }

      const imagenes = seleccionados.slice(0, espacio).filter((f) => /^image\//.test(f.type));
      if (!imagenes.length) {
        resultado.value = { tipo: 'error', texto: 'El archivo seleccionado no es una imagen.' };
        return;
      }

      fotoProcesando.value = true;
      try {
        for (const archivo of imagenes) {
          // 1024×1024 y calidad 0.6: los valores que fija
          // docs/arquitectura/CONTEXTO_CRITICO.md §3 para no agotar la cuota.
          fotos.value.push(await comprimirImagenDual(archivo, 1024, 1024, 0.6));
        }
      } catch (e) {
        resultado.value = { tipo: 'error', texto: 'No se pudo procesar la imagen: ' + e.message };
      } finally {
        fotoProcesando.value = false;
      }
    };

    const removerFotografia = (indice) => { fotos.value.splice(indice, 1); };

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
        // Las fotografías se suben a cPanel ANTES de cerrar y viajan como URL:
        // el RPC recibe enlaces, no archivos. Se rellena justo abajo.
        adjuntos: [],
      };

      guardando.value = true;
      try {
        if (estaOnline.value) {
          /* ── Evidencia del trabajo terminado ────────────────────────────
             Un fallo aquí NO cancela el cierre. La cuadrilla ya hizo el
             trabajo y muchas veces está en un sitio con mala cobertura:
             perder el cierre por una foto que no subió sería el peor de los
             dos resultados. Se cierra con las que hayan subido y se dice
             exactamente cuántas fueron. */
          let avisoFotos = '';
          if (fotos.value.length) {
            if (!evidenciasConfiguradas) {
              avisoFotos = ' Las fotografías NO se enviaron: falta configurar el ' +
                           'servidor de imágenes.';
            } else {
              subiendoFotos.value = true;
              const envio = await subirEvidencias(fotos.value.map((f) => f.archivo));
              subiendoFotos.value = false;
              datosCierre.adjuntos = envio.adjuntos;
              if (!envio.completo) {
                avisoFotos = ` Se enviaron ${envio.adjuntos.length} de ` +
                             `${fotos.value.length} fotografías.`;
              }
            }
          }

          const r = await cerrarCaso(datosCierre);

          if (r.ok) {
            resultado.value = {
              // Un caso ya cerrado no es un fallo: es el reintento del buzón, o
              // que alguien lo cerró desde el Centro de Monitoreo mientras
              // tanto. Se avisa en ámbar para que el empleado lo sepa.
              tipo: r.yaCerrado ? 'encolado' : (avisoFotos ? 'advertencia' : 'ok'),
              texto: r.mensaje + avisoFotos,
            };
            // Con aviso se deja más tiempo en pantalla: un mensaje que hay que
            // leer y desaparece en segundo y medio es un mensaje que no existe.
            setTimeout(() => irA('mis-intervenciones'), avisoFotos ? 4000 : 1600);
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

        // ⚠ Las fotografías NO viajan al buzón. Vive en localStorage, que solo
        // guarda texto: convertirlas a base64 ocuparía ~1,4 MB de los ~5 MB
        // disponibles y bastarían tres cierres encolados para llenarlo y hacer
        // que el siguiente se pierda. Entre perder las fotos y perder el
        // cierre, se pierden las fotos — y se dice.
        const perdioFotos = fotos.value.length > 0;
        resultado.value = {
          tipo: perdioFotos ? 'advertencia' : 'encolado',
          texto: 'Sin señal. El cierre quedó en el buzón y se enviará solo al recuperar cobertura.'
            + (perdioFotos
                ? ' Las fotografías NO se guardaron: vuelve a tomarlas cuando haya cobertura.'
                : ''),
        };
        setTimeout(() => irA('mis-intervenciones'), perdioFotos ? 4500 : 2200);
      } finally {
        guardando.value = false;
        subiendoFotos.value = false;
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
      subiendoFotos,
      puedeGuardar,
      resultado,
      estaOnline,
      guardarCierre,
      irA,
      // Evidencia fotográfica
      fotos, fotoProcesando, MAX_FOTOS,
      procesarFotografia, removerFotografia,
    };
  },
};
