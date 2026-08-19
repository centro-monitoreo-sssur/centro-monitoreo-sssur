// ============================================================
// VISTA: galería de componentes (solo desarrollo)
//
// Renderiza cada primitiva en cada variante y estado, en una sola página que
// el banco visual fotografía a tres anchos y dos temas. Es la referencia
// contra la que se compara cualquier cambio de la librería: si un ajuste en
// `ui-boton` mueve un píxel, aparece aquí antes que en las catorce vistas.
//
// Solo existe en desarrollo: el ítem de menú que navega hasta aquí se añade
// bajo `enDesarrollo` en stores/navegacion.js. La plantilla viaja igualmente
// en producción —es texto muerto sin ese ítem— y eso es deliberado: mantener
// dos precache.json según entorno costaría más que estos 12 KB.
//
// Aquí NO hay datos reales ni permisos: todo es literal y estático a
// propósito, para que dos pasadas del banco produzcan bytes idénticos.
// ============================================================
import { ref } from '../../core/vue.js';

export default {
  setup() {
    // Estado mínimo para que los controles interactivos muestren sus dos
    // caras. Arranca fijo; el banco no interactúa, solo fotografía.
    const busqueda = ref('');
    const busquedaConTexto = ref('bache en calle principal');
    const interruptorApagado = ref(false);
    const interruptorEncendido = ref(true);
    const casillaApagada = ref(false);
    const casillaEncendida = ref(true);
    const segmento = ref('7d');
    const area = ref('');
    const areaConTexto = ref('Se derivó a la unidad de alumbrado por competencia declarada.');

    const OPCIONES_SEGMENTO = [
      { valor: 'hoy', etiqueta: 'Hoy' },
      { valor: '7d',  etiqueta: '7 días' },
      { valor: '30d', etiqueta: '30 días' },
    ];
    const OPCIONES_VISTA = [
      { valor: 'kanban', etiqueta: 'Kanban', icono: 'fa-solid fa-table-columns' },
      { valor: 'lista',  etiqueta: 'Lista',  icono: 'fa-solid fa-list' },
    ];
    const segmentoVista = ref('kanban');

    const RUTA_DEMO = [
      { etiqueta: 'Centro de Monitoreo', id: 'dashboard' },
      { etiqueta: 'Galería' },
    ];

    return {
      busqueda, busquedaConTexto,
      interruptorApagado, interruptorEncendido,
      casillaApagada, casillaEncendida,
      segmento, segmentoVista, OPCIONES_SEGMENTO, OPCIONES_VISTA,
      area, areaConTexto,
      RUTA_DEMO,
    };
  },
};
