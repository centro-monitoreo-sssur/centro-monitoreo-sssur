// ============================================================
// SERVICE: construcción de gráficas Chart.js (doughnut, bar, line).
// Solo recibe datos ya calculados; no conoce el origen de los mismos.
// ============================================================
import { Chart } from '../core/libs.js';

export function graficarBarrasHorizontales(canvas, labels, datos, colores, isDark = false) {
  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: datos, backgroundColor: colores, borderRadius: 4, maxBarThickness: 32 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        x: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0, color: textColor } },
        y: { grid: { display: false }, ticks: { color: textColor } }
      },
    },
  });
}

export function graficarDistribucion(canvas, labels, datos, colores, isDark = false) {
  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const borderColor = isDark ? '#1f2937' : '#ffffff';
  
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: datos, backgroundColor: colores, borderWidth: 2, borderColor: borderColor }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, boxWidth: 10 } } },
      cutout: '62%',
    },
  });
}

export function graficarFlujo(canvas, labels, datos, isDark = false) {
  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: datos, backgroundColor: '#001ba0', borderRadius: 6, maxBarThickness: 46 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0, color: textColor } },
        x: { grid: { display: false }, ticks: { color: textColor } }
      },
    },
  });
}

export function graficarLineaTiempo(canvas, labels, datos, isDark = false) {
  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{ 
        data: datos, 
        borderColor: '#3b82f6', 
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#3b82f6',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0, color: textColor } },
        x: { grid: { display: false }, ticks: { color: textColor, maxRotation: 45, minRotation: 45 } }
      },
    },
  });
}
