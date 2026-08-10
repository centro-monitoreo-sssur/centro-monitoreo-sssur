// ============================================================
// PRIMITIVA: modal accesible
//
// Los modales del proyecto eran `<div v-if="...">` sueltos dentro de la vista.
// Eso trae cuatro problemas que no se ven hasta que alguien los sufre:
//
//   1. Sin `Teleport`, el modal hereda el contexto de apilamiento de su padre.
//      En el Mapa en Vivo, donde `.mapa-vista.is-fullscreen` crea uno propio con
//      `z-index: 10000`, un modal declarado dentro del grid queda por debajo del
//      mapa por mucho z-index que se le ponga.
//   2. Sin tecla Escape, en móvil no hay forma evidente de salir.
//   3. Sin bloqueo de scroll, el fondo se desplaza bajo el modal — y en la PWA
//      de campo eso deja al usuario perdido al cerrarlo.
//   4. Sin foco atrapado, el tabulador se escapa al contenido de detrás: quien
//      navega con teclado o lector de pantalla queda escribiendo en un
//      formulario que no ve.
//
// El foco se devuelve al elemento que abrió el modal. Sin eso, al cerrar, el
// foco vuelve al principio del documento y hay que recorrer el menú entero.
// ============================================================
import { ref, watch, onUnmounted, nextTick, computed } from '../../../core/vue.js';

const FOCALIZABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

const ANCHOS = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

let contador = 0;
// Los modales se pueden anidar (detalle → confirmación). Un contador global
// evita que al cerrar el de arriba se desbloquee el scroll con el de abajo aún
// abierto.
let abiertos = 0;

export default {
  props: {
    mostrar:      { type: Boolean, default: false },
    titulo:       { type: String, default: '' },
    subtitulo:    { type: String, default: '' },
    icono:        { type: String, default: '' },
    colorIcono:   { type: String, default: '' },   // hex de la BD
    tamano:       { type: String, default: 'md' },
    cerrarAlTocarFuera: { type: Boolean, default: true },
  },
  emits: ['cerrar'],
  setup(props, { emit }) {
    const dialogo = ref(null);
    const idTitulo = `modal-titulo-${++contador}`;
    let focoPrevio = null;

    const clasesAncho = computed(() => ANCHOS[props.tamano] || ANCHOS.md);

    const cerrar = () => emit('cerrar');

    const alPulsarTecla = (evento) => {
      if (evento.key === 'Escape') {
        evento.stopPropagation();
        cerrar();
        return;
      }
      if (evento.key !== 'Tab' || !dialogo.value) return;

      const focos = [...dialogo.value.querySelectorAll(FOCALIZABLES)]
        .filter((el) => el.offsetParent !== null);
      if (!focos.length) return;

      const primero = focos[0];
      const ultimo = focos[focos.length - 1];

      // El ciclo se cierra a mano: el navegador, por sí solo, saltaría al
      // contenido de detrás del modal.
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    };

    const alTocarFondo = (evento) => {
      // Solo si el clic nace y muere en el fondo. Sin esta comprobación, soltar
      // el ratón fuera tras seleccionar texto dentro del modal lo cerraba.
      if (!props.cerrarAlTocarFuera) return;
      if (evento.target === evento.currentTarget) cerrar();
    };

    watch(() => props.mostrar, (visible) => {
      if (visible) {
        focoPrevio = document.activeElement;
        abiertos++;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', alPulsarTecla, true);
        nextTick(() => {
          const primero = dialogo.value?.querySelector(FOCALIZABLES);
          (primero || dialogo.value)?.focus();
        });
      } else {
        abiertos = Math.max(0, abiertos - 1);
        if (abiertos === 0) document.body.style.overflow = '';
        document.removeEventListener('keydown', alPulsarTecla, true);
        focoPrevio?.focus?.();
        focoPrevio = null;
      }
    });

    // Si la vista se destruye con el modal abierto —navegar mientras está
    // abierto— el listener y el scroll bloqueado sobrevivirían a la vista.
    onUnmounted(() => {
      document.removeEventListener('keydown', alPulsarTecla, true);
      if (props.mostrar) {
        abiertos = Math.max(0, abiertos - 1);
        if (abiertos === 0) document.body.style.overflow = '';
      }
    });

    return { dialogo, idTitulo, clasesAncho, cerrar, alTocarFondo };
  },
};
