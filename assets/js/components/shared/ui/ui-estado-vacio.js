// ============================================================
// PRIMITIVA: estado vacío
//
// «No hay resultados», «Sin denuncias en este periodo», «Aún no hay
// cuadrillas». Hay 28 instancias a mano con cinco rellenos distintos, y en
// varias el texto está sin icono o el icono sin texto. Un estado vacío
// inconsistente hace dudar de si la pantalla terminó de cargar.
//
// No trae botón propio: la acción («Crear la primera», «Limpiar filtros») va
// en el slot, porque su permiso y su manejador son de la vista.
// ============================================================
export default {
  props: {
    icono:       { type: String, default: 'fa-solid fa-inbox' },
    titulo:      { type: String, required: true },
    descripcion: { type: String, default: '' },
    // Para celdas de tabla o paneles bajos donde el relleno grande descuadra.
    compacto:    { type: Boolean, default: false },
  },
};
