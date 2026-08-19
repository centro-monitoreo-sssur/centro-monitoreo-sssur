// ============================================================
// PRIMITIVA: estado de carga
//
// El «Cargando…» de paneles y listas. Hoy conviven tres variantes de spinner
// (un `fa-spin`, un `animate-spin` sobre un div con borde, y un esqueleto
// improvisado) y cada una con su color. Una sola forma, con el azul
// institucional, para que «esto está trabajando» se lea igual en todo el
// sistema.
//
// Para el esqueleto de contenido (barras grises que imitan la maqueta) ya
// existe `skeleton.css`; esta primitiva es para cuando no se conoce la forma
// del contenido que viene.
// ============================================================
export default {
  props: {
    texto:    { type: String, default: 'Cargando…' },
    compacto: { type: Boolean, default: false },
  },
};
