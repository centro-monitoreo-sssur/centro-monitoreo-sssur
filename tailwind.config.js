/**
 * Configuración de Tailwind.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 * Hasta ahora esto vivía dentro de un `<script>` en `index.html` y lo consumía
 * `cdn.tailwindcss.com`, que compila las clases en el navegador leyendo el DOM.
 * Eso tenía tres consecuencias:
 *
 *   · La PWA de campo NO podía funcionar sin señal. Sin la CDN no hay CSS, y
 *     sin CSS la aplicación es una lista de textos sin formato.
 *   · Cada carga en cada dispositivo recompila toda la hoja. Es trabajo que se
 *     hace una vez en la máquina de desarrollo y se repetía miles de veces en
 *     los teléfonos de las cuadrillas.
 *   · No se pueden usar plugins ni `@apply`, que es lo que hace falta para
 *     apoyarse en un sistema de diseño como TailAdmin.
 *
 * ── EL PROYECTO SIGUE SIENDO «SIN BUILD», CON UN MATIZ ──────────────────────
 * La regla del proyecto es que el servidor solo copia archivos, y eso NO
 * cambia: `assets/css/tailwind.css` se compila aquí y se commitea. cPanel
 * despliega lo de siempre. Lo que aparece es un paso de desarrollo —`npm run
 * css`— que hay que ejecutar al tocar clases y que `npm run css:watch` deja
 * corriendo mientras se trabaja.
 *
 * Si alguien edita una plantilla y no recompila, la clase nueva no existirá en
 * la hoja. Es el precio, y es lo mismo que hace cualquier proyecto Tailwind que
 * no sea un prototipo.
 */
export default {
  darkMode: 'class',

  /* Dónde buscar clases. El escáner de Tailwind lee estos archivos como texto
     plano: cualquier clase que no aparezca literalmente aquí NO se compila.
     Por eso el proyecto no construye nombres de clase concatenando cadenas
     —se comprobó: no hay ninguno— y usa mapas con la clase completa escrita,
     como `getColorClass`. */
  content: [
    './index.html',
    './assets/templates/**/*.html',
    './assets/js/**/*.js',
  ],

  /* Clases que el escáner no puede ver por sí solo.
     Son las que inyecta Leaflet, Chart.js o el propio navegador en nodos que
     no existen en ningún archivo del proyecto. */
  safelist: [
    'leaflet-container', 'leaflet-popup-content', 'leaflet-tooltip',
    // Utilidades que se aplican desde JavaScript al vuelo.
    'hidden', 'block', 'flex', 'overflow-hidden',
  ],

  theme: {
    extend: {
      colors: {
        /* Identidad municipal. No es la paleta de TailAdmin ni de Tailwind: el
           600 es el azul institucional de San Salvador Sur y el oro es el
           acento de Protección Civil. Ver assets/css/tokens.css. */
        brand: {
          50:  '#eef2ff', 100: '#dde4ff', 200: '#bcc9ff', 300: '#93a5fb',
          400: '#6076ef', 500: '#3048d2', 600: '#001ba0', 700: '#001785',
          800: '#00126a', 900: '#0d1a5c', 950: '#0a1240',
        },
        gold: {
          50: '#fffbeb', 100: '#fff3c4', 200: '#ffe680', 300: '#ffd94d',
          400: '#ffcc00', 500: '#e6b800', 600: '#b38f00', 700: '#806600',
        },
        gray: {
          750: '#2a323f',
        },
      },
      boxShadow: {
        card:        '0 1px 3px 0 rgb(16 24 40 / 0.08), 0 1px 2px -1px rgb(16 24 40 / 0.06)',
        'card-hover':'0 8px 24px -4px rgb(16 24 40 / 0.12), 0 2px 6px -2px rgb(16 24 40 / 0.07)',
        popover:     '0 12px 32px -8px rgb(16 24 40 / 0.20)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'title-sm': ['1.125rem', { lineHeight: '1.6rem',   fontWeight: '600' }],
        'title-md': ['1.5rem',   { lineHeight: '2rem',     fontWeight: '700' }],
        'title-lg': ['1.875rem', { lineHeight: '2.375rem', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};
