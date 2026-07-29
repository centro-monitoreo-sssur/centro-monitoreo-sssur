// Envoltorio sobre la build global de Vue (CDN, sin compilador).
// Re-exportamos la API de Composition API para que los módulos puedan
// importarla sin depender del objeto global `Vue`.
export const {
  createApp, ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, shallowRef,
} = window.Vue;
