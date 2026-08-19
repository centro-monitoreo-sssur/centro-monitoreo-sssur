// ============================================================
// PRIMITIVA: lista con estados
//
// El contenedor `divide-y` que se repite en quince listas, unido a la decisión
// que cada vista toma por su cuenta y a veces olvida: ¿qué se muestra mientras
// carga, y qué cuando no hay nada? Aquí la secuencia es una sola:
// cargando → carga · vacío → estado vacío · con datos → el slot.
//
// La vista decide QUÉ es «vacío» (su array filtrado); la primitiva decide CÓMO
// se ve. Los textos del vacío se pasan como props para no anidar slots.
// ============================================================
export default {
  props: {
    cargando:         { type: Boolean, default: false },
    vacio:            { type: Boolean, default: false },
    tituloVacio:      { type: String, default: 'Sin resultados' },
    descripcionVacio: { type: String, default: '' },
    iconoVacio:       { type: String, default: 'fa-solid fa-inbox' },
    // Sin divisores, para listas de tarjetas sueltas con `space-y`.
    sinDivisores:     { type: Boolean, default: false },
  },
};
