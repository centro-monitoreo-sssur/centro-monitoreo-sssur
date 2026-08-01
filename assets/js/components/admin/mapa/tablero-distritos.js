// ============================================================
// COMPONENTE: tablero comparativo entre distritos
//
// Responde la pregunta que un tomador de decisiones se hace al abrir la
// consola: ¿dónde está el problema hoy? Muestra los distritos del ámbito lado
// a lado, ordenables, con semáforo por incumplimiento del tiempo objetivo.
//
// Se sirve de `v_kpis_distrito`, agregada en la base de datos. Los KPIs que la
// consola calculaba antes sobre el array de casos cargado estaban limitados a
// 200 filas, así que mentían en cuanto el municipio superaba ese volumen.
// ============================================================
import { ref, computed } from '../../../core/vue.js';
import { useTerritorio } from '../../../stores/territorio.js';

// Columnas del tablero. `clave` debe existir en v_kpis_distrito.
const COLUMNAS = [
  { clave: 'total',             etiqueta: 'Total',        titulo: 'Casos registrados' },
  { clave: 'pendientes',        etiqueta: 'Pendientes',   titulo: 'Sin asignar todavía' },
  { clave: 'en_curso',          etiqueta: 'En curso',     titulo: 'En revisión o en obra' },
  { clave: 'fuera_de_objetivo', etiqueta: 'Fuera de SLA', titulo: 'Abiertos que superaron el tiempo objetivo de su prioridad' },
  { clave: 'criticas_abiertas', etiqueta: 'Críticas',     titulo: 'Prioridad crítica sin resolver' },
  { clave: 'resueltas',         etiqueta: 'Resueltas',    titulo: 'Casos cerrados' },
];

export default {
  props: {
    distritoActivo: { type: [String, Number], default: '' },
  },
  emits: ['seleccionar', 'cerrar'],

  setup(props, { emit }) {
    const { distritosDelAmbito, cargandoKpis, errorKpis, semaforo,
            cargarKpisDistrito } = useTerritorio();

    // Por defecto se ordena por lo que más duele, no alfabéticamente.
    const ordenPor  = ref('fuera_de_objetivo');
    const ordenDesc = ref(true);

    const filas = computed(() => {
      const copia = [...distritosDelAmbito.value];
      copia.sort((a, b) => {
        const va = a[ordenPor.value] ?? 0;
        const vb = b[ordenPor.value] ?? 0;
        if (va !== vb) return ordenDesc.value ? vb - va : va - vb;
        // Desempate estable por nombre, para que el orden no baile entre
        // recargas cuando varios distritos empatan a cero.
        return String(a.distrito_nombre).localeCompare(String(b.distrito_nombre), 'es');
      });
      return copia;
    });

    const ordenar = (clave) => {
      if (ordenPor.value === clave) {
        ordenDesc.value = !ordenDesc.value;
      } else {
        ordenPor.value = clave;
        ordenDesc.value = true;
      }
    };

    // Máximo de la columna activa, para dimensionar la barra de cada tarjeta.
    const maximoColumna = computed(() =>
      Math.max(1, ...filas.value.map((f) => f[ordenPor.value] ?? 0))
    );

    const proporcion = (fila) => {
      const v = fila[ordenPor.value] ?? 0;
      return Math.round((v / maximoColumna.value) * 100);
    };

    const formatoHoras = (h) => {
      if (h === null || h === undefined) return '—';
      if (h < 24) return h.toFixed(1) + ' h';
      return (h / 24).toFixed(1) + ' d';
    };

    const esActivo = (fila) => String(props.distritoActivo) === String(fila.distrito_id);

    const seleccionar = (fila) => {
      // Volver a pulsar el distrito activo lo deselecciona y vuelve a "Todos".
      emit('seleccionar', esActivo(fila) ? '' : String(fila.distrito_id));
    };

    return {
      COLUMNAS,
      filas,
      ordenPor,
      ordenDesc,
      ordenar,
      proporcion,
      formatoHoras,
      esActivo,
      seleccionar,
      semaforo,
      cargandoKpis,
      errorKpis,
      cargarKpisDistrito,
    };
  },
};
