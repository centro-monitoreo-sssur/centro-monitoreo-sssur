// ============================================================
// BOOTSTRAP de la aplicación.
// 1) Carga las plantillas HTML puras de cada componente.
// 2) Registra los componentes globalmente con su plantilla.
// 3) Monta la app sobre #app usando `app-root` como raíz.
// ============================================================
import { createApp, watch, nextTick } from './core/vue.js';
import { componentes } from './components/index.js';
import { cargarTodasLasPlantillas } from './core/template-loader.js';
import { useNavegacion } from './stores/navegacion.js';

// AOS se carga como global vía CDN (ver index.html). No usar import bare.

async function initApp() {
  const plantillas = await cargarTodasLasPlantillas(componentes);

  const app = createApp({
    template: '<app-root></app-root>',
    mounted() {
      // Aplicación inicializada
    },
  });

  // Registrar plugin de virtual scroller si está disponible
  if (window.VueVirtualScroller) {
    app.use(window.VueVirtualScroller);
  }

  // Registrar cada componente globalmente inyectándole su plantilla HTML.
  for (const [nombre, info] of Object.entries(componentes)) {
    const tpl = plantillas[info.tpl] || '';
    app.component(nombre, { ...info.comp, template: tpl });
  }

  app.mount('#app');

  // Recalcular AOS cada vez que cambia la vista (componentes se renderizan luego)
  const { vistaActual } = useNavegacion();
  watch(vistaActual, async () => {
    await nextTick();
    if (window.AOS) window.AOS.refreshHard();
  });
}

initApp();
