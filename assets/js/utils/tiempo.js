// Reloj institucional (fecha y hora en formato local de El Salvador).
export const ahoraTexto = () =>
  new Date().toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' });
