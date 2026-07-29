// Acceso a librerías de terceros servidas por CDN como scripts clásicos
// (no son módulos ES, por eso no se pueden `import` directamente).
// Se leen desde el objeto global `window` en el momento de la evaluación
// del módulo, que ocurre después de que los <script> clásicos del <head>
// ya se ejecutaron.
export const L = window.L;
export const Chart = window.Chart;
