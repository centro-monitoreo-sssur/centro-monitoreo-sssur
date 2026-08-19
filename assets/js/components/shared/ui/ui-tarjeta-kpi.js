// ============================================================
// PRIMITIVA: tarjeta de indicador
//
// Extraída LITERALMENTE de la tarjeta del tablero que Richard aprobó, no
// rediseñada: icono en caja redondeada, etiqueta, valor grande en monoespacio.
// En teléfono el icono va en línea con el texto para que la tarjeta mida
// ~135 px y no ~220; desde `sm:` el icono sube y el bloque respira, que es la
// composición de TailAdmin (`metric-group-01.html`).
//
// ── REGLA CRÍTICA: EL COLOR ES UN TOKEN, NO UNA CLASE DE TAILWIND ───────────
// La prop `estado` resuelve a `kpi-color--*` / `kpi-fondo--*` de
// `assets/css/tokens.css`. Esa paleta la configura el administrador en tiempo
// de ejecución (Configuración → Apariencia): un `text-blue-600` se vería
// idéntico hoy e ignoraría en silencio cada cambio hecho desde el panel. El
// banco visual inyecta un magenta imposible en `--kpi-pendiente` precisamente
// para detectar esa regresión.
// ============================================================
import { computed } from '../../../core/vue.js';

/* Mapas con la clase completa escrita: el proyecto no concatena nombres de
   clase, y aunque estas vienen de tokens.css y no de Tailwind, se mantiene la
   misma disciplina para que se puedan buscar con grep. */
const FONDOS = {
  total:      'kpi-fondo--total',
  pendiente:  'kpi-fondo--pendiente',
  'en-curso': 'kpi-fondo--en-curso',
  resuelta:   'kpi-fondo--resuelta',
  vencida:    'kpi-fondo--vencida',
  neutro:     'kpi-fondo--neutro',
};

const COLORES = {
  total:      'kpi-color--total',
  pendiente:  'kpi-color--pendiente',
  'en-curso': 'kpi-color--en-curso',
  resuelta:   'kpi-color--resuelta',
  vencida:    'kpi-color--vencida',
  neutro:     'kpi-color',
};

export default {
  props: {
    etiqueta: { type: String, required: true },
    valor:    { type: [String, Number], default: '—' },
    icono:    { type: String, required: true },      // clase Font Awesome
    estado:   { type: String, default: 'neutro' },   // clave de la paleta operativa
    cargando: { type: Boolean, default: false },
  },
  setup(props) {
    const claseFondo = computed(() => FONDOS[props.estado] ?? FONDOS.neutro);
    const claseColor = computed(() => COLORES[props.estado] ?? COLORES.neutro);

    return { claseFondo, claseColor };
  },
};
