// Componente: Bottom Tab Bar Reutilizable
import { ref, computed } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useComunicados } from '../../stores/comunicados.js';
import { useOfflineQueue } from '../../stores/offline-queue.js';

// Vistas donde el menú inferior NO debe mostrarse (formularios / registro)
const VISTAS_SIN_MENU = new Set([
  'crear-denuncia',
  'levantar-denuncia',
  'registro-poblacion',
  'registro-empleado',
  'vista-registro',
]);

export default {
  props: {
    tipo: {
      type: String,
      required: true,
      validator: (value) => ['poblacion', 'empleado'].includes(value)
    }
  },
  setup(props) {
    const { irA, vistaActual } = useNavegacion();

    // Ocultar el menú automáticamente en vistas de formulario
    const menuVisible = computed(() => !VISTAS_SIN_MENU.has(vistaActual.value));

    // Estado del submenú hamburguesa
    const menuMasAbierto = ref(false);
    const toggleMenuMas = () => {
      menuMasAbierto.value = !menuMasAbierto.value;
    };

    /* Contador de comunicados sin leer.
       Contaba sobre `noticiasDemo`: cuatro avisos escritos a mano, dos de ellos
       con `leida: false`. Por eso el distintivo decía SIEMPRE 2, hubiera lo que
       hubiera publicado la Alcaldía y hubiera leído lo que hubiera leído el
       vecino. Ahora sale del store, que cuenta lo que la RLS deja ver y
       descuenta lo ya abierto.

       La carga la hace `app-root` una vez al arrancar: este componente está
       montado siempre y pedirla aquí la repetiría en cada cambio de pantalla. */
    const { sinLeer: noLeidasNoticias } = useComunicados();

    const { contadorPendientes } = useOfflineQueue();

    return {
      vistaActual,
      menuVisible,
      menuMasAbierto,
      noLeidasNoticias,
      contadorPendientes,
      toggleMenuMas,
      irA
    };
  }
};
