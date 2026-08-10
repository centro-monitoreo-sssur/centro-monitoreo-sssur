// ============================================================
// PRIMITIVA: tabla de datos
//
// Sustituye a las tablas escritas a mano de denuncias, bitácora, usuarios,
// población y departamentos. Lo que aporta y antes no había en ninguna:
//
//   · Orden por columna.
//   · Encabezado fijo al hacer scroll (`sticky`), que en una tabla de 50 filas
//     es la diferencia entre leerla y no leerla.
//   · Skeleton de carga con la forma de la tabla real, en vez de un salto de
//     tabla vacía a tabla llena.
//   · Paginación con ventana alrededor de la página actual. La anterior hacía
//     `v-for="p in Math.min(5, paginasTotales)"`: siempre pintaba 1–5, así que
//     a partir de la página 6 no quedaba ningún botón marcado como activo y no
//     había forma de saber dónde estabas.
//   · Selección múltiple para acciones en lote.
//
// El orden es local por defecto. `ordenExterno` lo delega al padre, que es lo
// que hará falta cuando la paginación pase a cursor contra Supabase.
// ============================================================
import { ref, computed } from '../../../core/vue.js';

export default {
  props: {
    // [{ clave, titulo, ancho, alineacion: 'izq'|'centro'|'der', ordenable, mono }]
    columnas:       { type: Array, required: true },
    filas:          { type: Array, default: () => [] },
    claveFila:      { type: String, default: 'id' },
    cargando:       { type: Boolean, default: false },
    seleccionables: { type: Boolean, default: false },
    seleccion:      { type: Array, default: () => [] },
    ordenExterno:  { type: Boolean, default: false },
    densidad:       { type: String, default: 'comoda' }, // comoda | compacta
    anchoMinimo:    { type: String, default: '800px' },
    // Estado vacío
    vacioIcono: { type: String, default: 'fa-solid fa-folder-open' },
    vacioTexto: { type: String, default: 'No se encontraron registros' },
    // Paginación (opcional: si `totalItems` es 0 no se muestra el pie)
    paginaActual:   { type: Number, default: 1 },
    itemsPorPagina: { type: Number, default: 20 },
    totalItems:     { type: Number, default: 0 },
    tamanosPagina:  { type: Array, default: () => [10, 20, 50] },
  },
  emits: ['update:seleccion', 'cambiar-pagina', 'cambiar-tamano', 'ordenar', 'fila-click'],
  setup(props, { emit }) {
    const ordenPor = ref('');
    const ordenAsc = ref(true);

    const clasesCelda = computed(() =>
      props.densidad === 'compacta' ? 'px-3 py-1.5' : 'px-5 py-3'
    );

    const alineacion = (col) => ({
      centro: 'text-center',
      der: 'text-right',
    }[col.alineacion] || 'text-left');

    // ── Orden ────────────────────────────────────────────────────────────────
    function ordenarPor(col) {
      if (!col.ordenable) return;
      if (ordenPor.value === col.clave) ordenAsc.value = !ordenAsc.value;
      else { ordenPor.value = col.clave; ordenAsc.value = true; }
      if (props.ordenExterno) emit('ordenar', { clave: ordenPor.value, asc: ordenAsc.value });
    }

    const filasOrdenadas = computed(() => {
      if (props.ordenExterno || !ordenPor.value) return props.filas;
      const clave = ordenPor.value;
      const signo = ordenAsc.value ? 1 : -1;
      // Copia antes de ordenar: `sort` muta, y mutar el array del store haría
      // que el orden visual de una tabla se propagara a las demás vistas.
      return [...props.filas].sort((a, b) => {
        const x = a[clave], y = b[clave];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        // Numérico si ambos lo son; si no, comparación local (respeta tildes y ñ).
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo;
        return String(x).localeCompare(String(y), 'es', { numeric: true }) * signo;
      });
    });

    // ── Selección ────────────────────────────────────────────────────────────
    const idsPagina = computed(() => filasOrdenadas.value.map((f) => f[props.claveFila]));
    const todasSeleccionadas = computed(() =>
      idsPagina.value.length > 0 && idsPagina.value.every((id) => props.seleccion.includes(id))
    );
    const algunaSeleccionada = computed(() =>
      !todasSeleccionadas.value && idsPagina.value.some((id) => props.seleccion.includes(id))
    );

    function alternarTodas() {
      emit('update:seleccion', todasSeleccionadas.value
        ? props.seleccion.filter((id) => !idsPagina.value.includes(id))
        : [...new Set([...props.seleccion, ...idsPagina.value])]);
    }

    function alternarFila(fila) {
      const id = fila[props.claveFila];
      emit('update:seleccion', props.seleccion.includes(id)
        ? props.seleccion.filter((x) => x !== id)
        : [...props.seleccion, id]);
    }

    const estaSeleccionada = (fila) => props.seleccion.includes(fila[props.claveFila]);

    // ── Paginación ───────────────────────────────────────────────────────────
    const paginasTotales = computed(() =>
      Math.max(1, Math.ceil(props.totalItems / props.itemsPorPagina))
    );

    /**
     * Ventana de páginas alrededor de la actual, con elipsis. Devuelve, p. ej.,
     * [1, '…', 7, 8, 9, '…', 42] — de modo que la página en curso SIEMPRE está
     * en la lista, que es justo lo que fallaba antes.
     */
    const paginasVisibles = computed(() => {
      const total = paginasTotales.value;
      const actual = props.paginaActual;
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

      const paginas = [1];
      const desde = Math.max(2, actual - 1);
      const hasta = Math.min(total - 1, actual + 1);
      if (desde > 2) paginas.push('…');
      for (let p = desde; p <= hasta; p++) paginas.push(p);
      if (hasta < total - 1) paginas.push('…');
      paginas.push(total);
      return paginas;
    });

    const rangoMostrado = computed(() => {
      if (!props.totalItems) return { desde: 0, hasta: 0 };
      const desde = (props.paginaActual - 1) * props.itemsPorPagina + 1;
      return { desde, hasta: Math.min(desde + filasOrdenadas.value.length - 1, props.totalItems) };
    });

    function irAPagina(p) {
      if (p === '…' || p === props.paginaActual || p < 1 || p > paginasTotales.value) return;
      emit('cambiar-pagina', p);
    }

    const filasSkeleton = computed(() => Math.min(props.itemsPorPagina, 8));

    return {
      ordenPor, ordenAsc, ordenarPor, filasOrdenadas,
      clasesCelda, alineacion,
      todasSeleccionadas, algunaSeleccionada, alternarTodas, alternarFila, estaSeleccionada,
      paginasTotales, paginasVisibles, rangoMostrado, irAPagina, filasSkeleton,
    };
  },
};
