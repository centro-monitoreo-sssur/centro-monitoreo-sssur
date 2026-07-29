// Componente: Bottom Tab Bar Reutilizable
import { ref, computed } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { noticiasDemo } from '../../utils/noticias-demo.js';
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

    // DEMO: badge de noticias no leídas — reemplazar con store real
    const noLeidasNoticias = computed(() =>
      noticiasDemo.filter(n => !n.leida).length
    );

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
