// Reloj institucional (fecha y hora en formato local de El Salvador).
export const ahoraTexto = () =>
  new Date().toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Antigüedad en lenguaje corto: "ahora", "12 min", "3 h", "5 días".
 *
 * Vive aquí y no en cada vista porque ya existían tres copias con umbrales
 * distintos: una pasaba a horas a los 60 min, otra a los 90, y el listado de
 * intervenciones nunca llegaba a mostrar días. Para un operador que compara
 * dos pantallas, el mismo caso parecía tener dos antigüedades.
 */
export const tiempoRelativo = (fecha) => {
  if (!fecha) return '';
  const ms = Date.now() - new Date(fecha).getTime();
  if (Number.isNaN(ms)) return '';
  // Fechas futuras (reloj del dispositivo desajustado, algo habitual en los
  // móviles de campo) no se muestran como "hace -3 h".
  if (ms < 0) return 'ahora';

  const minutos = Math.floor(ms / 60000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(ms / 3600000);
  if (horas < 24) return `${horas} h`;

  const dias = Math.floor(ms / 86400000);
  if (dias < 30) return `${dias} día${dias === 1 ? '' : 's'}`;

  const meses = Math.floor(dias / 30);
  return `${meses} mes${meses === 1 ? '' : 'es'}`;
};

/** Fecha y hora absolutas, para tooltips y detalle. */
export const fechaHoraTexto = (fecha) => {
  if (!fecha) return '';
  const d = new Date(fecha);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' });
};
