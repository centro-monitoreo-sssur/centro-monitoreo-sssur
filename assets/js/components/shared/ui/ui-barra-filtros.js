// ============================================================
// PRIMITIVA: barra de filtros
//
// La fila de búsqueda + selects que encabeza doce vistas de lista, incluida la
// copia LITERAL entre usuarios y población. No aporta lógica: aporta el layout
// que hoy cada vista resuelve distinto —y que en teléfono suele salir mal,
// con los selects desbordando en fila—.
//
// En teléfono los controles se apilan a ancho completo; desde `sm:` se
// alinean en fila y envuelven. Es el patrón de TailAdmin: la densidad se
// resuelve con relleno, no encogiendo los controles.
// ============================================================
export default {
  props: {
    // Sin tarjeta propia, para cuando la barra ya vive dentro de una ui-card.
    desnuda: { type: Boolean, default: false },
  },
};
