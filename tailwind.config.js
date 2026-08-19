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

        /* Paleta semántica de TailAdmin. NO sustituye a los tokens operativos
           de `tokens.css` —`--kpi-pendiente`, el semáforo del tablero— que son
           configurables desde el panel y significan estados del MUNICIPIO.
           Estos son los de la interfaz: un aviso de guardado, un campo con
           error, una variación al alza. Confundirlos es como acabas con
           «pendiente» en dos rojos distintos según la pantalla. */
        success: {
          50: '#ecfdf3', 100: '#d1fadf', 500: '#12b76a', 600: '#039855', 700: '#027a48',
        },
        error: {
          50: '#fef3f2', 100: '#fee4e2', 500: '#f04438', 600: '#d92d20', 700: '#b42318',
        },
        warning: {
          50: '#fffaeb', 100: '#fef0c7', 500: '#f79009', 600: '#dc6803', 700: '#b54708',
        },
      },
      boxShadow: {
        card:        '0 1px 3px 0 rgb(16 24 40 / 0.08), 0 1px 2px -1px rgb(16 24 40 / 0.06)',
        'card-hover':'0 8px 24px -4px rgb(16 24 40 / 0.12), 0 2px 6px -2px rgb(16 24 40 / 0.07)',
        popover:     '0 12px 32px -8px rgb(16 24 40 / 0.20)',
        /* La escala de TailAdmin, copiada de su `src/css/style.css` y no
           deducida de capturas. Casi imperceptibles a propósito: su interfaz
           separa por BORDE, no por sombra, y estas solo despegan el elemento
           del fondo. `theme-xs` ya estaba y su valor coincide exactamente. */
        'theme-xs':  '0px 1px 2px 0px rgba(16, 24, 40, 0.05)',
        'theme-sm':  '0px 1px 3px 0px rgba(16, 24, 40, 0.1), 0px 1px 2px 0px rgba(16, 24, 40, 0.06)',
        'theme-md':  '0px 4px 8px -2px rgba(16, 24, 40, 0.1), 0px 2px 4px -2px rgba(16, 24, 40, 0.06)',
        'theme-lg':  '0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)',
        'theme-xl':  '0px 20px 24px -4px rgba(16, 24, 40, 0.08), 0px 8px 8px -4px rgba(16, 24, 40, 0.03)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        /* ── OJO: nuestra escala `title-*` NO es la de TailAdmin ──────────
           TailAdmin:  title-sm 30px · title-md 36px · title-lg 48px
           Nosotros:   title-sm 18px · title-md 24px · title-lg 30px

           Estamos dos escalones por debajo. No se remapea, por lo mismo que no
           se remapea `brand-500`: hay 16 usos vivos y cambiar el valor de un
           nombre en uso repinta la interfaz en silencio, que es justo el fallo
           que esta migración intenta dejar de cometer. Nuestro `title-lg`
           (30px) equivale a su `title-sm`; al pegar marcado suyo hay que
           traducir, y el linter de la Fase 4 lo vigila. */
        'title-sm': ['1.125rem', { lineHeight: '1.6rem',   fontWeight: '600' }],
        'title-md': ['1.5rem',   { lineHeight: '2rem',     fontWeight: '700' }],
        'title-lg': ['1.875rem', { lineHeight: '2.375rem', fontWeight: '700' }],

        /* La escala de CUERPO de TailAdmin, con sus valores exactos. Nombres
           nuevos: cero usos hoy, así que añadirlos no cambia ningún píxel.
           Es donde aterriza el marcado que se pegue de su plantilla. */
        'theme-xs': ['12px', { lineHeight: '18px' }],
        'theme-sm': ['14px', { lineHeight: '20px' }],
        'theme-xl': ['20px', { lineHeight: '30px' }],
      },

      /* ── ringWidth: la clase muerta ────────────────────────────────────────
         Hay 68 usos de `focus:ring-3` en el proyecto y CERO reglas emitidas.
         Es una utilidad de Tailwind v4; en v3 la escala de `ringWidth` es
         0/1/2/4/8 y el 3 no existe. La pegué yo copiando marcado de TailAdmin,
         que la usa 43 veces junto a `focus:ring-brand-500/10`.

         Lo insidioso es que el COLOR del anillo sí compila. Así que durante
         meses hubo 68 controles con un anillo de foco de color perfectamente
         definido y grosor cero: invisible, sin un solo error en consola, sin
         que ninguna revisión de código lo pudiera ver. Solo se cae al
         comparar las clases usadas contra las emitidas, que es la regla
         estrella del linter de la Fase 4.

         Añadir el 3 es el único cambio VISIBLE de esta fase: 68 controles
         recuperan su anillo de foco. Por eso va sola y no mezclada con nada. */
      ringWidth: {
        3: '3px',
      },

      /* ── transitionDuration: el segundo ring-3 ─────────────────────────────
         El linter de conformidad encontró 18 usos de `duration-250` en la
         barra de pestañas de las PWA con CERO reglas emitidas: la escala de
         v3 salta de 200 a 300. Esas transiciones llevaban desde siempre el
         defecto de 150 ms. Se define el token —la intención del autor era
         250 ms— en vez de reescribir 18 usos a otro valor. */
      transitionDuration: {
        250: '250ms',
      },

      /* ── zIndex: nombres para un apilamiento que hoy se resuelve por azar ──
         Hoy conviven z-[36], z-[60], z-[70], z-[100], z-[200], z-[900],
         z-[1000], z-[9999], z-[10050] y z-[10060]. El problema no es la
         variedad, es el EMPATE: diez elementos comparten z-[9999], y entre
         ellos están el toast, el cajón del menú móvil y los modales escritos a
         mano de usuarios, población y departamentos. Cuando dos elementos
         empatan gana el orden del DOM, que aquí no lo garantiza nadie: un aviso
         de guardado puede quedar detrás del modal que lo produjo.

         Y el modal COMPARTIDO (`ui-modal`) está a 10050, por encima de los
         escritos a mano. O sea que el aspecto de la pila depende de si la
         pantalla usó la primitiva o no.

         Esta escala solo se DEFINE aquí. Migrar los usos toca 20 plantillas y
         pertenece a las fases 3 a 5: una fase, un merge, una unidad de
         reversión. Definirla ahora es lo que le da al linter algo a lo que
         apuntar cuando aparezca el siguiente z-[9999]. */
      zIndex: {
        cabecera: '30',    // topbar pegajosa
        cajon:    '40',    // menú lateral móvil y su velo
        mapa:     '900',   // controles POR ENCIMA de un lienzo Leaflet
                           // (sus paneles internos van de 200 a 800)
        modal:    '10050',
        galeria:  '10060', // visor de fotos, que se abre DESDE un modal
        aviso:    '10070', // toasts: por encima de todo, siempre
      },
    },
  },
  plugins: [],
};
