// ============================================================
// COMPONENTE: editor de texto con formato
//
// Para el cuerpo de los comunicados. Un `<textarea>` no basta cuando lo que se
// publica es un aviso institucional: hace falta poder destacar una fecha, o
// enumerar los pasos de un trámite.
//
// ── POR QUÉ NO SE USA UNA LIBRERÍA ──────────────────────────────────────────
// El proyecto es sin compilación y ya carga trece dependencias por CDN. Un
// editor completo —Quill, TipTap— añadiría entre 100 y 300 KB y otra
// dependencia externa que puede caerse, para un formulario que la gerencia usa
// unas pocas veces al mes.
//
// Con `contenteditable` y `document.execCommand` se cubren los seis formatos
// que hacen falta en unas doscientas líneas.
//
// ⚠ `execCommand` está marcado como obsoleto. Se usa a sabiendas: sigue
// funcionando en todos los navegadores actuales y no hay sustituto estándar
// —la propuesta que iba a reemplazarlo se abandonó—. Si algún día deja de
// funcionar, el contenido ya guardado se sigue viendo: es HTML normal.
//
// ── LO QUE SALE DE AQUÍ ES HTML, Y SE SANEA ─────────────────────────────────
// Al pegar desde Word o desde una página web viene un amasijo de etiquetas y
// estilos en línea. Se limpia al pegar y otra vez al leer, dejando solo la
// lista blanca de abajo. Es también lo que impide que un `<script>` pegado
// acabe guardado en la base.
// ============================================================
import { ref, watch, onMounted } from '../../../core/vue.js';

/* Etiquetas admitidas. Deliberadamente corta: cada una que se añada hay que
   poder pintarla también en las dos PWA, y un comunicado municipal no necesita
   tablas ni tipografías. */
const ETIQUETAS_PERMITIDAS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U',
  'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'DIV',
]);

/**
 * Devuelve HTML con solo lo permitido.
 *
 * Recorre el árbol en vez de usar expresiones regulares: con HTML, una
 * expresión regular siempre deja un caso sin cubrir, y ese caso es justo por
 * donde entra un `<script>`.
 */
export function sanearHtml(sucio) {
  if (!sucio) return '';
  const plantilla = document.createElement('div');
  plantilla.innerHTML = sucio;

  const limpiar = (nodo) => {
    // Se copia la lista: quitar hijos mientras se recorre la salta elementos.
    for (const hijo of Array.from(nodo.childNodes)) {
      if (hijo.nodeType === Node.TEXT_NODE) continue;

      if (hijo.nodeType !== Node.ELEMENT_NODE) { hijo.remove(); continue; }

      if (!ETIQUETAS_PERMITIDAS.has(hijo.tagName)) {
        // Se conserva el TEXTO y se tira la etiqueta: al pegar desde Word, el
        // contenido viene envuelto en <span> y <font>, y borrarlos enteros
        // dejaría el comunicado vacío.
        const texto = document.createTextNode(hijo.textContent || '');
        hijo.replaceWith(texto);
        continue;
      }

      // Fuera todos los atributos —estilos en línea, clases, `onclick`— salvo
      // el destino de un enlace.
      for (const attr of Array.from(hijo.attributes)) {
        if (hijo.tagName === 'A' && attr.name === 'href') continue;
        hijo.removeAttribute(attr.name);
      }

      if (hijo.tagName === 'A') {
        const destino = hijo.getAttribute('href') || '';
        // Solo http y https. `javascript:` en un href es ejecución de código.
        if (!/^https?:\/\//i.test(destino)) {
          hijo.replaceWith(document.createTextNode(hijo.textContent || ''));
          continue;
        }
        hijo.setAttribute('target', '_blank');
        hijo.setAttribute('rel', 'noopener noreferrer');
      }

      limpiar(hijo);
    }
  };

  limpiar(plantilla);
  return plantilla.innerHTML;
}

const HERRAMIENTAS = [
  { id: 'h2',      icono: 'fa-heading',      titulo: 'Título',        comando: 'formatBlock', valor: 'H2' },
  { id: 'h3',      icono: 'fa-heading',      titulo: 'Subtítulo',     comando: 'formatBlock', valor: 'H3', pequeno: true },
  { id: 'p',       icono: 'fa-paragraph',    titulo: 'Texto normal',  comando: 'formatBlock', valor: 'P' },
  { id: 'sep1',    separador: true },
  { id: 'bold',    icono: 'fa-bold',         titulo: 'Negrita',       comando: 'bold' },
  { id: 'italic',  icono: 'fa-italic',       titulo: 'Cursiva',       comando: 'italic' },
  { id: 'sep2',    separador: true },
  { id: 'ul',      icono: 'fa-list-ul',      titulo: 'Lista',         comando: 'insertUnorderedList' },
  { id: 'ol',      icono: 'fa-list-ol',      titulo: 'Lista numerada', comando: 'insertOrderedList' },
];

export default {
  name: 'ui-editor-texto',
  props: {
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: 'Escribe aquí…' },
    // Alto mínimo del área editable, en píxeles.
    alto: { type: Number, default: 220 },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const areaEditable = ref(null);
    // Evita el bucle: al emitir un cambio, el padre devuelve el mismo valor y
    // reescribir el innerHTML colocaría el cursor al principio en cada tecla.
    let escribiendoDesdeDentro = false;

    const emitir = () => {
      if (!areaEditable.value) return;
      escribiendoDesdeDentro = true;
      emit('update:modelValue', sanearHtml(areaEditable.value.innerHTML));
      // Se libera en la siguiente vuelta del bucle de eventos, cuando el padre
      // ya propagó el valor.
      setTimeout(() => { escribiendoDesdeDentro = false; }, 0);
    };

    const aplicar = (h) => {
      if (h.separador || !areaEditable.value) return;
      // El foco tiene que estar en el área o el comando se pierde: pulsar un
      // botón de la barra se lo lleva.
      areaEditable.value.focus();
      document.execCommand(h.comando, false, h.valor || null);
      emitir();
    };

    /* Al pegar se toma el HTML del portapapeles, se sanea y se inserta.
       Sin esto entra el marcado de Word con sus estilos en línea, sus
       `mso-` y, en el peor caso, contenido ejecutable. */
    const alPegar = (evento) => {
      evento.preventDefault();
      const datos = evento.clipboardData;
      const html = datos?.getData('text/html');
      const texto = datos?.getData('text/plain') || '';
      const limpio = html ? sanearHtml(html) : texto.replace(/[<>&]/g, (c) =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      document.execCommand('insertHTML', false, limpio);
      emitir();
    };

    // El valor externo solo se vuelca cuando NO viene de escribir aquí.
    watch(() => props.modelValue, (nuevo) => {
      if (escribiendoDesdeDentro || !areaEditable.value) return;
      if (areaEditable.value.innerHTML === nuevo) return;
      areaEditable.value.innerHTML = nuevo || '';
    });

    onMounted(() => {
      if (areaEditable.value) areaEditable.value.innerHTML = props.modelValue || '';
      // Los saltos de línea generan <div> por defecto en Chrome y <br> en otros.
      // Se fuerza <p>, que es lo que espera el saneador y lo que se pinta bien.
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* da igual */ }
    });

    return { areaEditable, HERRAMIENTAS, aplicar, emitir, alPegar };
  },
};
