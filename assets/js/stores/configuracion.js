// ============================================================
// STORE: configuración global del sistema
// Persiste en localStorage bajo la clave 'cm_config'. Expone
// grupos de ajustes reactivos y un helper para guardar/resetear.
// ============================================================
import { ref, watch } from '../core/vue.js';
import { db } from '../services/supabase-api.js';

const LS_KEY = 'cm_config';

const DEFAULTS = {
  // Mapa
  mapa: {
    lat: 13.7035, lng: -89.2, zoom: 15,
    estilo: 'google',   // google | satellite | cartomap | darkmap | osm
    tamanoMarcador: 18, // px del diámetro base
    radioCluster: 40,
  },
  // Notificaciones
  notificaciones: {
    sonidoActivo: true,
    volumen: 70,           // 0-100
    tono: 'chime',         // chime | beep | ding | pulse | none
    browserPush: false,
    intervaloActualizacion: 30, // segundos
  },
  // Apariencia
  apariencia: {
    tema: 'light',         // light | dark | auto
    densidad: 'normal',    // compact | normal | comfortable
    animaciones: true,
  },
  // Sistema
  sistema: {
    maxDenunciasVisibles: 200,
    timeoutSesionMin: 30,
    organizacion: 'Municipalidad de San Salvador Sur',
    version: '2.1.0',
  },
  // Categorías (colores personalizados — si se vacía, usa demo-data)
  categorias: null, // null = usa defaults de BD / demo-data
  // Kill switches de acceso por contexto URL
  accesoContextos: {
    poblacion: true,   // ?contexto=poblacion activo/inactivo
    empleados: true,   // ?contexto=empleados activo/inactivo
  },
};


const KEY = 'global';

async function cargarDesdeDB() {
  try {
    if (db) {
      const { data, error } = await db.from('configuracion').select('valor').eq('clave', KEY).single();
      if (!error && data) {
        return {
          mapa: { ...DEFAULTS.mapa, ...data.valor.mapa },
          notificaciones: { ...DEFAULTS.notificaciones, ...data.valor.notificaciones },
          apariencia: { ...DEFAULTS.apariencia, ...data.valor.apariencia },
          sistema: { ...DEFAULTS.sistema, ...data.valor.sistema },
          categorias: data.valor.categorias ?? null,
          accesoContextos: { ...DEFAULTS.accesoContextos, ...data.valor.accesoContextos },
        };
      }
    }
  } catch (e) {
    console.warn('Usando configuración local:', e.message);
  }
  // Fallback to local storage if DB fails or is empty
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
  } catch {}
  return structuredClone(DEFAULTS);
}

const config = ref(structuredClone(DEFAULTS));
const guardado = ref(false); // feedback visual de guardado

// Cargar inicial async
cargarDesdeDB().then(c => { config.value = c; });

// Auto-persistir cuando config cambia
watch(config, (val) => {
  localStorage.setItem(LS_KEY, JSON.stringify(val));
}, { deep: true });

async function guardar() {
  localStorage.setItem(LS_KEY, JSON.stringify(config.value));
  try {
    if (db) {
      await db.from('configuracion').upsert({ clave: KEY, valor: config.value });
    }
  } catch (e) {
    console.error('Error guardando en BD:', e.message);
  }
  guardado.value = true;
  setTimeout(() => { guardado.value = false; }, 2000);
}

async function resetear() {
  config.value = structuredClone(DEFAULTS);
  localStorage.removeItem(LS_KEY);
  try {
    if (db) {
      await db.from('configuracion').upsert({ clave: KEY, valor: config.value });
    }
  } catch(e) {}
  guardado.value = true;
  setTimeout(() => { guardado.value = false; }, 2000);
}

function exportarJSON() {
  const blob = new Blob([JSON.stringify(config.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cm-config-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importarJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        config.value = { ...structuredClone(DEFAULTS), ...parsed };
        await guardar();
        resolve();
      } catch {
        reject(new Error('Archivo JSON inválido'));
      }
    };
    reader.readAsText(file);
  });
}

// Tones de notificación (Web Audio API)
const TONOS = {
  chime:  { freqs: [523, 659, 784],  durations: [0.45, 0.45, 0.45], type: 'sine' },
  beep:   { freqs: [880],            durations: [0.15],              type: 'square' },
  ding:   { freqs: [1047],           durations: [0.6],               type: 'sine' },
  pulse:  { freqs: [440, 440],       durations: [0.12, 0.12],        type: 'sine', gap: 0.14 },
  none:   null,
};

let _audioCtx = null;
function probarTono(tono) {
  const def = TONOS[tono];
  if (!def) return;
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const vol = config.value.notificaciones.volumen / 100;
    let t = ctx.currentTime;
    def.freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = def.type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + def.durations[i]);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + def.durations[i]);
      t += def.durations[i] + (def.gap || 0.13);
    });
  } catch(e) {
    console.warn('[Audio] No se pudo reproducir:', e.message);
  }
}

export function useConfiguracion() {
  return {
    config,
    guardado,
    DEFAULTS,
    TONOS,
    guardar,
    resetear,
    exportarJSON,
    importarJSON,
    probarTono,
  };
}
