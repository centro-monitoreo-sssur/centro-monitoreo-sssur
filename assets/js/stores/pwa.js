import { ref } from '../core/vue.js';
import { almacen } from '../core/almacen.js';

// El aplazamiento de la instalación es POR APLICACIÓN: quien pospone instalar
// la PWA de campo no está diciendo nada sobre el Centro de Monitoreo, que es
// otra app con otro icono y otro público.
const CLAVE_POSPUESTA = 'pwa_dismissed';

const versionApp = ref('v?.?.?');
const pwaInstalada = ref(false);
const mostrarModalInstalacion = ref(false);
let deferredPrompt = null;

// Detectar si la app ya está instalada (Standalone)
const esStandalone = () => {
  return (window.matchMedia('(display-mode: standalone)').matches) || 
         (window.navigator.standalone) || 
         document.referrer.includes('android-app://');
};

const registrarSW = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      console.log('[PWA] Service Worker registrado exitosamente', registration.scope);

      // Obtener la versión desde el SW
      if (registration.active) {
        pedirVersion(registration.active);
      }
      
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] Nuevo Service Worker activado.');
        if (navigator.serviceWorker.controller) {
          pedirVersion(navigator.serviceWorker.controller);
        }
      });
    } catch (error) {
      console.error('[PWA] Fallo al registrar el Service Worker:', error);
    }
  }
};

const pedirVersion = (worker) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    if (event.data && event.data.version) {
      versionApp.value = event.data.version;
      console.log(`[PWA] Versión activa detectada: ${versionApp.value}`);
    }
  };
  worker.postMessage('GET_VERSION', [channel.port2]);
};

// Escuchar el evento que permite instalar la PWA
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevenir que Chrome 67 o inferior muestre automáticamente el prompt
  e.preventDefault();
  // Guardar el evento para dispararlo luego
  deferredPrompt = e;
  
  // Si no está instalada, mostramos el modal (por ejemplo, en móviles)
  if (!esStandalone()) {
    // Comprobar si el usuario pospuso la instalación recientemente (últimas 24h)
    const pwaDismissedStr = almacen.leerTexto(CLAVE_POSPUESTA);
    let debeMostrarModal = true;
    
    if (pwaDismissedStr) {
      const pwaDismissedDate = parseInt(pwaDismissedStr, 10);
      const ahora = new Date().getTime();
      const horasTranscurridas = (ahora - pwaDismissedDate) / (1000 * 60 * 60);
      
      // Mostrar solo si han pasado más de 24 horas desde la última vez
      if (horasTranscurridas < 24) {
        debeMostrarModal = false;
      }
    }

    if (debeMostrarModal) {
      // Retrasar un poco el modal para que no interrumpa el inicio de inmediato
      setTimeout(() => {
        mostrarModalInstalacion.value = true;
      }, 2000);
    }
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] Aplicación instalada correctamente.');
  pwaInstalada.value = true;
  mostrarModalInstalacion.value = false;
  deferredPrompt = null;
  almacen.borrar(CLAVE_POSPUESTA); // Limpiar el estado
});

const instalarPWA = async () => {
  if (!deferredPrompt) {
    // Si no hay evento de instalación, podría ser iOS o ya estar instalada
    alert('Para instalar en iOS: presiona Compartir y luego "Agregar a inicio".');
    return;
  }
  
  // Mostrar el prompt nativo
  deferredPrompt.prompt();
  
  // Esperar a ver qué responde el usuario
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`[PWA] Resultado de instalación: ${outcome}`);
  
  if (outcome === 'dismissed') {
    posponerInstalacion();
  }
  
  deferredPrompt = null;
  mostrarModalInstalacion.value = false;
};

const posponerInstalacion = () => {
  mostrarModalInstalacion.value = false;
  // Guardar timestamp actual en milisegundos
  almacen.escribirTexto(CLAVE_POSPUESTA, new Date().getTime().toString());
};

// Auto-evaluar el estado inicial
if (esStandalone()) {
  pwaInstalada.value = true;
}

export const usePwa = () => {
  return {
    versionApp,
    pwaInstalada,
    mostrarModalInstalacion,
    registrarSW,
    instalarPWA,
    posponerInstalacion
  };
};
