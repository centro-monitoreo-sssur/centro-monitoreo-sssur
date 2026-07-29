// ============================================================
// SERVICE: popups de la consola de monitoreo.
// Solo recibe datos ya mapeados (categoría/denuncia); no conoce el store.
// Los marcadores viven en services/marcadores.js (fuente única de estilos).
// ============================================================
import { etiquetaEstado } from '../utils/badge.js';

// Popup de denuncia (respeta la paleta municipal; estado con los 5 fijos).
export function popupDenuncia(pt, cat) {
  const stc = estadoColorPopup(pt.estado);
  const label = etiquetaEstado(pt.estado);
  return `<div style="min-width:210px;font-family:'Inter',sans-serif;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;">
      <div style="width:7px;height:7px;border-radius:50%;background:${cat.color};flex-shrink:0;"></div>
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;color:${cat.color};text-transform:uppercase;">${cat.shortName}</span>
      <span style="margin-left:auto;display:inline-block;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;${stc}">${label}</span>
    </div>
    <div style="font-size:13px;font-weight:600;line-height:1.35;margin-bottom:7px;">${pt.title}</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:2px;"><i class="fa-solid fa-location-dot" style="width:13px;color:${cat.color};"></i> ${pt.address}</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:5px;"><i class="fa-regular fa-clock" style="width:13px;color:${cat.color};"></i> ${pt.time}</div>
    <div style="font-size:11px;color:#6b7280;"><i class="fa-solid fa-building-columns" style="width:13px;color:${cat.color};"></i> ${cat.area}</div>
    <div style="font-size:11px;color:#9ca3af;margin-top:7px;padding-top:7px;border-top:1px solid #e5e7eb;line-height:1.5;">${pt.desc || ''}</div>
  </div>`;
}

export function popupIntervencion(iv) {
  return `<div style="min-width:200px;font-family:'Inter',sans-serif;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;">
      <div style="width:8px;height:8px;transform:rotate(45deg);background:#c0392b;border-radius:1px;flex-shrink:0;"></div>
      <span style="font-size:10px;font-weight:700;letter-spacing:.1em;color:#c0392b;text-transform:uppercase;">Intervención Activa</span>
    </div>
    <div style="font-size:13px;font-weight:600;line-height:1.35;margin-bottom:7px;">${iv.name}</div>
    <div style="font-size:11px;color:#6b728f;margin-bottom:2px;"><i class="fa-solid fa-building" style="width:13px;color:${iv.color};"></i> ${iv.area}</div>
    <div style="margin-top:6px;display:inline-block;padding:1px 8px;border-radius:4px;font-size:10px;font-weight:600;background:rgba(192,57,43,.14);color:#c0392b;border:1px solid rgba(192,57,43,.35);">${iv.status}</div>
  </div>`;
}

// Color de fondo/texto del badge de estado dentro del popup (5 estados fijos).
function estadoColorPopup(estado) {
  switch (estado) {
    case 'pendiente':   return 'background:rgba(220,38,38,.14);color:#f87171;border:1px solid rgba(220,38,38,.35);';
    case 'en_revision': return 'background:rgba(37,99,235,.14);color:#93b4fb;border:1px solid rgba(37,99,235,.35);';
    case 'en_obra':     return 'background:rgba(217,119,6,.14);color:#fbbf24;border:1px solid rgba(217,119,6,.35);';
    case 'resuelta':    return 'background:rgba(16,185,129,.14);color:#34d399;border:1px solid rgba(16,185,129,.35);';
    case 'rechazada':   return 'background:rgba(107,114,128,.16);color:#9ca3af;border:1px solid rgba(107,114,128,.4);';
    default:            return 'background:rgba(107,114,128,.16);color:#9ca3af;border:1px solid rgba(107,114,128,.4);';
  }
}
