// ============================================================
// SERVICE: estilos de marcadores (ÚNICA FUENTE DE VERDAD).
// Tanto el Dashboard como el Mapa en Vivo usan estas funciones, de modo que
// los puntos se ven idénticos en ambas vistas. Reciben el color de categoría
// (desde la BD vía store) y no conocen la lógica de negocio.
// ============================================================
import { L } from '../core/libs.js';

// Marcador de denuncia: círculo sólido con borde blanco y sombra. Si `nuevo`
// es true, agrega un pulso de una sola ejecución para resaltar arrivos.
export function marcadorDenuncia(color, { nuevo = false } = {}) {
  const sz = nuevo ? 22 : 18;
  const pulso = nuevo
    ? `<div style="position:absolute;inset:-${Math.round(sz * 0.55)}px;border-radius:50%;border:1.5px solid ${color};animation:pulseRing 1.8s ease-out 1;"></div>
       <div style="position:absolute;inset:-${Math.round(sz * 1.1)}px;border-radius:50%;border:1px solid ${color};animation:pulseRing 1.8s .5s ease-out 1;"></div>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${sz}px;height:${sz}px;">
      <div style="width:${sz}px;height:${sz}px;background:${color};border-radius:50%;border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>
      ${pulso}
    </div>`,
    iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -(sz / 2) - 4],
  });
}

// Marcador de intervención: cuadrado rotado 45° (rojo institucional).
export function marcadorIntervencion() {
  const s = 18;
  return L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px;background:#c0392b;border:2px solid rgba(255,255,255,.9);transform:rotate(45deg);border-radius:2px;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
    iconSize: [s, s], iconAnchor: [s / 2, s / 2], popupAnchor: [0, -(s / 2) - 5],
  });
}
