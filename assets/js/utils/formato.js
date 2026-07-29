// Formato de fechas y utilidades de presentación compartidas.

export const formatoFecha = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('es-SV', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const formatoFechaCorto = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Aplica color institucional a los chips activos vía estilo inline (evita
// generar clases dinámicas de Tailwind, que no se purgan bien en runtime CDN).
export const chipClase = (activo) => [
  'px-3 py-1 rounded-full text-xs font-semibold transition',
  activo ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
].join(' ');
