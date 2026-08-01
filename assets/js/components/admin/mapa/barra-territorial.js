// ============================================================
// COMPONENTE: barra de contexto territorial de la consola de monitoreo
//
// Es el control principal de la vista. Se adapta al alcance del usuario:
//   · Alcalde / Director / Admin  → selector de los 5 distritos + "Todos"
//   · Jefatura de Distrito        → etiqueta fija con su distrito, sin selector
//   · Delegación temporal vigente → selector con los distritos concedidos
//
// El componente NO decide qué puede ver nadie: solo evita ofrecer controles
// que no llevan a ninguna parte. El filtrado real lo impone la RLS.
// ============================================================
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from '../../../core/vue.js';
import { useCatalogos } from '../../../stores/catalogos.js';
import { usePermisos } from '../../../stores/permisos.js';
import { useTerritorio } from '../../../stores/territorio.js';

export default {
  props: {
    // id del distrito activo, o '' para "todos". v-model:distrito
    distrito: { type: [String, Number], default: '' },
    comparativoAbierto: { type: Boolean, default: false },
  },
  emits: ['update:distrito', 'toggle-comparativo'],

  setup(props, { emit }) {
    const { distritos } = useCatalogos();
    const { alcance, veTodoElMunicipio, distritosVisibles,
            puedeCompararDistritos, alcanceResuelto } = usePermisos();
    const { distritosDelAmbito, cargandoKpis, actualizadoEn } = useTerritorio();

    // Distritos que se ofrecen en el selector, en el orden del catálogo.
    const distritosOfrecidos = computed(() => {
      const todos = distritos.value || [];
      if (veTodoElMunicipio.value) return todos;
      const permitidos = distritosVisibles.value.map(Number);
      return todos.filter((d) => permitidos.includes(Number(d.id)));
    });

    // Con un solo distrito no hay nada que elegir: se muestra como etiqueta.
    const esAmbitoUnico = computed(
      () => alcanceResuelto.value && distritosOfrecidos.value.length === 1
    );

    const nombreDistritoActivo = computed(() => {
      if (!props.distrito) return 'Todo el municipio';
      const d = distritosOfrecidos.value.find((x) => String(x.id) === String(props.distrito));
      return d ? d.nombre : 'Distrito';
    });

    // Etiqueta del alcance, para que el usuario sepa por qué ve lo que ve.
    const etiquetaAlcance = computed(() => {
      if (!alcanceResuelto.value) return '';
      if (veTodoElMunicipio.value) return 'Visión municipal';
      switch (alcance.value.alcance_territorial) {
        case 'distrito_propio':      return 'Alcance distrital';
        case 'distritos_asignados':  return 'Distritos asignados';
        case 'ninguno':              return 'Sin alcance territorial';
        default:                     return 'Alcance por departamento';
      }
    });

    // Delegación: se ven más distritos de los que da el rol por sí solo.
    const tieneDelegacion = computed(() =>
      alcance.value.alcance_territorial === 'distrito_propio' &&
      distritosVisibles.value.length > 1
    );

    const horaActualizacion = computed(() => {
      if (!actualizadoEn.value) return '';
      return actualizadoEn.value.toLocaleTimeString('es-SV', {
        hour: '2-digit', minute: '2-digit',
      });
    });

    const seleccionar = (id) => emit('update:distrito', id === null ? '' : String(id));

    /* ─── Comportamiento del selector en móvil ───────────────────────────────
       En pantalla estrecha el selector es una tira con scroll horizontal. Eso
       trae dos problemas que en escritorio no existen:

       1. El distrito activo puede quedar fuera de vista al entrar, y entonces
          la barra parece decir que no hay ninguno seleccionado.
       2. Con la barra de scroll oculta, nada indica que haya más distritos a la
          derecha. El desvanecido del borde lo resuelve, pero debe desaparecer
          al llegar al final para no simular contenido que ya no existe. */
    const selectorRef = ref(null);
    const enElFinal = ref(false);

    function revisarFin() {
      const el = selectorRef.value;
      if (!el) return;
      // 2 px de tolerancia: el scroll fraccionario de los navegadores rara vez
      // alcanza el valor exacto y el desvanecido se quedaría pegado.
      enElFinal.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    }

    function centrarActivo() {
      const el = selectorRef.value;
      if (!el) return;
      const activo = el.querySelector('.is-activa');
      // `nearest` y no `center`: con el primer distrito seleccionado, `center`
      // desplazaría la tira dejando un hueco vacío a su izquierda.
      if (activo) activo.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      revisarFin();
    }

    onMounted(() => {
      nextTick(centrarActivo);
      window.addEventListener('resize', revisarFin, { passive: true });
    });
    onUnmounted(() => window.removeEventListener('resize', revisarFin));

    // El catálogo de distritos llega asíncrono: sin esto, al montar todavía no
    // hay botones que centrar.
    watch([() => props.distrito, distritosOfrecidos], () => nextTick(centrarActivo));

    return {
      distritosOfrecidos,
      esAmbitoUnico,
      nombreDistritoActivo,
      etiquetaAlcance,
      tieneDelegacion,
      puedeCompararDistritos,
      distritosDelAmbito,
      cargandoKpis,
      horaActualizacion,
      seleccionar,
      selectorRef,
      enElFinal,
      revisarFin,
    };
  },
};
