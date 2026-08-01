// ============================================================
// STORE: configuración global del sistema
// Persiste en localStorage bajo la clave 'cm_config'. Expone
// grupos de ajustes reactivos y un helper para guardar/resetear.
// ============================================================
import { ref, watch } from '../core/vue.js';
import { db } from '../core/supabase.js';

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
    // Ver TONOS más abajo. 'chime', 'beep', 'ding' y 'pulse' desaparecieron al
    // rehacer la síntesis; `tonoValido()` reencamina las configuraciones
    // guardadas con esos nombres para que nadie se quede sin sonido.
    tono: 'aviso',
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
  // ── Paleta de indicadores y gráficos ───────────────────────
  // Presentación, no datos. Los colores de categorías, prioridades y estados
  // SÍ son datos y viven en la BD (`categorias_caso.color_hex`,
  // `prioridades.color_hex`, `categorias_caso.estados_flujo`): duplicarlos aquí
  // crearía un catálogo sombra que se desincroniza en silencio.
  //
  // Lo que sí es configuración es el color con el que cada VISTA representa un
  // concepto operativo, y la paleta de series de los gráficos.
  colores: {
    // Semántica compartida por Dashboard, Mapa en Vivo y Reportes. Se publican
    // como variables CSS (--kpi-*) para que las vistas las consuman sin que
    // cada una tenga que importar el store.
    kpi: {
      total:     '#3b82f6',
      pendiente: '#ef4444',
      enCurso:   '#f59e0b',
      resuelta:  '#10b981',
      vencida:   '#dc2626',
      neutro:    '#64748b',
    },
    // Series de gráficos, en orden de asignación. Chart.js las recorre.
    graficos: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
               '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'],
    // Semáforo del tablero territorial, por cumplimiento de SLA.
    semaforo: {
      ok:       '#10b981',
      atencion: '#f59e0b',
      alerta:   '#f97316',
      critico:  '#ef4444',
    },
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

// Equivalencias de los tonos de la síntesis anterior. Una configuración
// guardada con `tono: 'chime'` habría dejado al usuario sin sonido y sin
// ninguna opción marcada en el selector, sin explicación visible.
const TONOS_RENOMBRADOS = {
  chime: 'campana',
  ding: 'toque',
  beep: 'aviso',
  pulse: 'aviso',
  suspiro: 'susurro',
  intercom: 'megafonia',
  sirena: 'emergencia',
  urgente: 'critico',
};

function tonoValido(tono) {
  if (!tono) return DEFAULTS.notificaciones.tono;
  if (TONOS[tono]) return tono;
  return TONOS_RENOMBRADOS[tono] || DEFAULTS.notificaciones.tono;
}

async function cargarDesdeDB() {
  try {
    if (db) {
      // Solo consultar BD si hay sesión activa (evita 406 antes del login)
      const { data: sesionData } = await db.auth.getSession();
      if (!sesionData?.session) throw new Error('sin-sesion');

      const { data, error } = await db.from('configuracion').select('valor').eq('clave', KEY).single();
      if (!error && data) {
        return {
          mapa: { ...DEFAULTS.mapa, ...data.valor.mapa },
          notificaciones: {
            ...DEFAULTS.notificaciones,
            ...data.valor.notificaciones,
            tono: tonoValido(data.valor.notificaciones?.tono),
          },
          apariencia: { ...DEFAULTS.apariencia, ...data.valor.apariencia },
          sistema: { ...DEFAULTS.sistema, ...data.valor.sistema },
          // Fusión por nivel: una configuración guardada antes de que existiera
          // `colores` no tiene la clave, y sin estos defaults las vistas
          // recibirían `undefined` donde esperan un color.
          colores: {
            kpi:      { ...DEFAULTS.colores.kpi,      ...(data.valor.colores?.kpi || {}) },
            graficos: data.valor.colores?.graficos?.length
                        ? data.valor.colores.graficos : [...DEFAULTS.colores.graficos],
            semaforo: { ...DEFAULTS.colores.semaforo, ...(data.valor.colores?.semaforo || {}) },
          },
          categorias: data.valor.categorias ?? null,
          accesoContextos: { ...DEFAULTS.accesoContextos, ...data.valor.accesoContextos },
        };
      }
    }
  } catch (e) {
    if (e.message !== 'sin-sesion') {
      console.warn('Usando configuración local:', e.message);
    }
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

// Cargar inicial async.
//
// La normalización del tono se hace AQUÍ y no dentro de `cargarDesdeDB` porque
// esa función tiene una segunda salida —el respaldo de localStorage— que
// también puede traer un nombre antiguo. Un solo punto, sin duplicar la regla.
cargarDesdeDB().then((c) => {
  if (c?.notificaciones) c.notificaciones.tono = tonoValido(c.notificaciones.tono);
  config.value = c;
});

// Publica la paleta como variables CSS en :root.
//
// Es lo que permite que Dashboard, Mapa en Vivo y Reportes usen los colores
// configurados sin importar este store ni volver a renderizar: basta con que
// su CSS lea `var(--kpi-pendiente)`. Los gráficos, que necesitan el valor en
// JavaScript, lo leen de `config.colores.graficos` directamente.
function publicarVariablesCSS(colores) {
  if (typeof document === 'undefined' || !colores) return;
  const raiz = document.documentElement.style;
  const guiones = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

  for (const [clave, valor] of Object.entries(colores.kpi || {})) {
    raiz.setProperty(`--kpi-${guiones(clave)}`, valor);
  }
  for (const [clave, valor] of Object.entries(colores.semaforo || {})) {
    raiz.setProperty(`--semaforo-${guiones(clave)}`, valor);
  }
  (colores.graficos || []).forEach((color, i) => {
    raiz.setProperty(`--serie-${i + 1}`, color);
  });
}

// Auto-persistir cuando config cambia
watch(config, (val) => {
  localStorage.setItem(LS_KEY, JSON.stringify(val));
  publicarVariablesCSS(val.colores);
}, { deep: true, immediate: true });

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

// ============================================================
// Tonos de notificación — síntesis FM
//
// POR QUÉ NO SON OSCILADORES CRUDOS
// La versión anterior encadenaba osciladores `square`/`sawtooth` sin envolvente
// y con frecuencias que formaban acordes (523-659-784 es do-mi-sol). El
// resultado sonaba a música de zumbador, no a aviso: ondas con todos los
// armónicos a plena amplitud y notas sostenidas 450 ms a volumen constante.
//
// Se sustituye por síntesis FM, que es lo que usan los sistemas de
// notificación reales: un oscilador MODULA la frecuencia de otro, y el índice
// de modulación decae con el tiempo. Eso produce el brillo inicial que se
// apaga característico de una campana o una marimba — timbre percusivo y
// reconocible sin ser estridente.
//
// Cada tono se describe como receta, no como lista de frecuencias:
//   freq        Hz de la portadora
//   dur         duración total en segundos (incluye la cola del decaimiento)
//   ratio       relación modulador/portadora. Enteros → timbre armónico
//               (marimba, madera). No enteros → metálico (campana, alerta)
//   indice      profundidad de modulación. 0 = seno puro; >3 = metálico
//   tipo        onda de la portadora; sine y triangle salvo intención expresa
//   ataque      segundos hasta volumen máximo. <0.02 = percusivo
//   curva       'exp' decaimiento natural (campana) · 'plana' sostenido corto
//   bend        multiplicador de frecuencia al final (glissando)
//   corte       frecuencia del filtro paso-bajo, en Hz. Quita la aspereza
//   vol         peso relativo de la nota dentro del tono
//
// Ventaja frente a archivos de audio: cero peticiones de red, cero espacio, y
// suena idéntico sin conexión — que en una PWA de campo no es un detalle.
// ============================================================

const TONOS = {
  // ── Suaves: avisos rutinarios ──────────────────────────────
  campana: {
    etiqueta: 'Campana', descripcion: 'Suave · dos notas con cola larga',
    // ratio 3.5 (no entero) da el timbre inarmónico de una campana real.
    notas: [
      { freq: 880,  dur: 1.1, ratio: 3.5, indice: 2.2, ataque: 0.004, corte: 4200 },
      { freq: 1320, dur: 1.4, ratio: 3.5, indice: 1.8, ataque: 0.004, corte: 4200, retraso: 0.11, vol: 0.7 },
    ],
  },
  marimba: {
    etiqueta: 'Marimba', descripcion: 'Suave · percusivo y cálido',
    // ratio 4 entero → armónico, sensación de madera.
    notas: [
      { freq: 659, dur: 0.42, ratio: 4, indice: 1.6, ataque: 0.003, corte: 3000, tipo: 'triangle' },
      { freq: 988, dur: 0.55, ratio: 4, indice: 1.2, ataque: 0.003, corte: 3000, tipo: 'triangle', retraso: 0.1, vol: 0.75 },
    ],
  },
  gota: {
    etiqueta: 'Gota', descripcion: 'Suave · una nota discreta',
    // El `bend` descendente es lo que da la sensación de gota.
    notas: [{ freq: 1200, dur: 0.32, ratio: 2, indice: 1.0, ataque: 0.002, bend: 0.72, corte: 5000 }],
  },
  susurro: {
    etiqueta: 'Susurro', descripcion: 'Suave · el menos intrusivo',
    notas: [{ freq: 740, dur: 0.5, ratio: 1, indice: 0.4, ataque: 0.03, corte: 2200, vol: 0.7 }],
  },

  // ── Neutros: notificación estándar ─────────────────────────
  aviso: {
    etiqueta: 'Aviso', descripcion: 'Neutro · dos toques, el estándar',
    notas: [
      { freq: 987, dur: 0.16, ratio: 2, indice: 0.8, ataque: 0.004, curva: 'plana', corte: 4000 },
      { freq: 987, dur: 0.26, ratio: 2, indice: 0.8, ataque: 0.004, corte: 4000, retraso: 0.17 },
    ],
  },
  toque: {
    etiqueta: 'Toque', descripcion: 'Neutro · una nota corta y limpia',
    notas: [{ freq: 830, dur: 0.28, ratio: 3, indice: 1.4, ataque: 0.003, corte: 3600 }],
  },
  radio: {
    etiqueta: 'Radio', descripcion: 'Neutro · comunicación operativa',
    // Filtro bajo y ratio no entero imitan el ancho de banda de un walkie.
    notas: [
      { freq: 1400, dur: 0.09, ratio: 1.5, indice: 2.5, ataque: 0.002, curva: 'plana', corte: 2600 },
      { freq: 1050, dur: 0.14, ratio: 1.5, indice: 2.5, ataque: 0.002, corte: 2600, retraso: 0.1 },
    ],
  },
  megafonia: {
    etiqueta: 'Megafonía', descripcion: 'Neutro · dos tonos tipo anuncio',
    notas: [
      { freq: 660, dur: 0.34, ratio: 2, indice: 0.9, ataque: 0.012, curva: 'plana', corte: 3000 },
      { freq: 880, dur: 0.5,  ratio: 2, indice: 0.9, ataque: 0.012, corte: 3000, retraso: 0.3 },
    ],
  },

  // ── Urgentes: incidencias críticas ─────────────────────────
  alerta: {
    etiqueta: 'Alerta', descripcion: 'Urgente · triple repique agudo',
    // Repetición rápida: el patrón temporal comunica urgencia mejor que subir
    // el volumen o la frecuencia, y cansa mucho menos en una jornada larga.
    notas: [
      { freq: 1175, dur: 0.13, ratio: 2.7, indice: 3, ataque: 0.002, corte: 5200 },
      { freq: 1175, dur: 0.13, ratio: 2.7, indice: 3, ataque: 0.002, corte: 5200, retraso: 0.17 },
      { freq: 1175, dur: 0.34, ratio: 2.7, indice: 3, ataque: 0.002, corte: 5200, retraso: 0.34 },
    ],
  },
  emergencia: {
    etiqueta: 'Emergencia', descripcion: 'Urgente · alternancia tipo sirena',
    notas: [
      { freq: 784, dur: 0.2, ratio: 1, indice: 0.6, ataque: 0.008, curva: 'plana', corte: 2800 },
      { freq: 1046, dur: 0.2, ratio: 1, indice: 0.6, ataque: 0.008, curva: 'plana', corte: 2800, retraso: 0.2 },
      { freq: 784, dur: 0.2, ratio: 1, indice: 0.6, ataque: 0.008, curva: 'plana', corte: 2800, retraso: 0.4 },
      { freq: 1046, dur: 0.42, ratio: 1, indice: 0.6, ataque: 0.008, corte: 2800, retraso: 0.6 },
    ],
  },
  critico: {
    etiqueta: 'Crítico', descripcion: 'Urgente · grave y descendente',
    // Descendente y grave: se distingue de todo lo demás incluso de espaldas
    // a la pantalla, que es el requisito real de un centro de monitoreo.
    notas: [
      { freq: 660, dur: 0.16, ratio: 1.4, indice: 4, ataque: 0.002, curva: 'plana', corte: 2400 },
      { freq: 494, dur: 0.16, ratio: 1.4, indice: 4, ataque: 0.002, curva: 'plana', corte: 2400, retraso: 0.16 },
      { freq: 330, dur: 0.7,  ratio: 1.4, indice: 4, ataque: 0.002, corte: 2000, retraso: 0.32 },
    ],
  },

  none: { etiqueta: 'Silencio', descripcion: 'Sin sonido', notas: null },
};

// Agrupación para el selector.
const GRUPOS_TONO = [
  { id: 'suave',   etiqueta: 'Suaves · avisos rutinarios',     tonos: ['campana', 'marimba', 'gota', 'susurro'] },
  { id: 'neutro',  etiqueta: 'Neutros · notificación estándar', tonos: ['aviso', 'toque', 'radio', 'megafonia'] },
  { id: 'urgente', etiqueta: 'Urgentes · incidencias críticas', tonos: ['alerta', 'emergencia', 'critico'] },
];

let _audioCtx = null;

/** Contexto único y reanudado. Los navegadores lo crean suspendido hasta que
 *  hay un gesto del usuario; sin `resume()` el primer tono no suena. */
function contextoAudio() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _audioCtx = new AC();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

/**
 * Sintetiza una nota FM.
 *
 * El modulador ataca `osc.frequency`, no la amplitud: eso es lo que convierte
 * dos senos en un timbre de campana. Su índice decae más rápido que la nota,
 * reproduciendo el brillo inicial que se apaga de un percutor real — el detalle
 * que distingue una notificación de un pitido de test.
 */
function nota(ctx, destino, receta, inicio) {
  const {
    freq, dur, ratio = 2, indice = 1, tipo = 'sine',
    ataque = 0.005, curva = 'exp', bend = null, corte = null, vol = 1,
  } = receta;

  const portadora = ctx.createOscillator();
  portadora.type = tipo;
  portadora.frequency.setValueAtTime(freq, inicio);
  if (bend) {
    // exponentialRamp no admite pasar por cero ni valores negativos.
    portadora.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), inicio + dur);
  }

  // ── Modulador de frecuencia ──
  let modulador = null;
  if (indice > 0) {
    modulador = ctx.createOscillator();
    modulador.type = 'sine';
    modulador.frequency.setValueAtTime(freq * ratio, inicio);

    const profundidad = ctx.createGain();
    // La desviación se expresa en Hz: índice × frecuencia de la portadora.
    profundidad.gain.setValueAtTime(freq * indice, inicio);
    profundidad.gain.exponentialRampToValueAtTime(1, inicio + dur * 0.55);

    modulador.connect(profundidad);
    profundidad.connect(portadora.frequency);   // ← modula frecuencia, no volumen
    modulador.start(inicio);
    modulador.stop(inicio + dur + 0.02);
  }

  // ── Filtro paso-bajo: quita la aspereza de los armónicos altos ──
  let ultimoNodo = portadora;
  if (corte) {
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(corte, inicio);
    filtro.Q.value = 0.7;   // sin resonancia: resonar aquí volvería a sonar sintético
    portadora.connect(filtro);
    ultimoNodo = filtro;
  }

  // ── Envolvente ──
  const envolvente = ctx.createGain();
  envolvente.gain.setValueAtTime(0.0001, inicio);
  envolvente.gain.linearRampToValueAtTime(vol, inicio + ataque);
  if (curva === 'plana') {
    // Sostiene y corta rápido: para toques secos tipo bip.
    envolvente.gain.setValueAtTime(vol, inicio + dur * 0.6);
    envolvente.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  } else {
    // Decaimiento exponencial desde el ataque: es como se apaga un cuerpo que
    // vibra. Mantener el volumen y cortar al final produce el "tono de prueba".
    envolvente.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  }

  ultimoNodo.connect(envolvente);
  envolvente.connect(destino);

  portadora.start(inicio);
  portadora.stop(inicio + dur + 0.02);

  // Liberar los nodos al terminar; si no, se acumulan en cada reproducción.
  portadora.onended = () => {
    portadora.disconnect();
    envolvente.disconnect();
    if (modulador) modulador.disconnect();
    if (ultimoNodo !== portadora) ultimoNodo.disconnect();
  };
}

function probarTono(tono) {
  const def = TONOS[tono];
  // `none` está en el catálogo para poder etiquetarlo en el selector, pero no
  // tiene notas: sin esta guarda el bucle reventaría.
  if (!def || !def.notas) return;

  const ctx = contextoAudio();
  if (!ctx) return;

  try {
    const volumen = Math.max(0, Math.min(100, config.value.notificaciones.volumen ?? 70)) / 100;

    // Bus común: un solo punto donde aplicar el volumen, y un limitador suave
    // para que la suma de notas solapadas no sature.
    const bus = ctx.createGain();
    bus.gain.value = volumen * 0.5;

    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -8;
    limitador.ratio.value = 12;
    limitador.attack.value = 0.002;
    limitador.release.value = 0.15;

    bus.connect(limitador);
    limitador.connect(ctx.destination);

    // +0.02 s de margen: programar exactamente en `currentTime` produce un
    // chasquido porque el evento cae dentro del bloque que ya se está rindiendo.
    const base = ctx.currentTime + 0.02;
    let finMax = 0;
    for (const receta of def.notas) {
      const inicio = base + (receta.retraso || 0);
      nota(ctx, bus, receta, inicio);
      finMax = Math.max(finMax, (receta.retraso || 0) + receta.dur);
    }

    setTimeout(() => { bus.disconnect(); limitador.disconnect(); }, (finMax + 0.5) * 1000);
  } catch (e) {
    console.warn('[Audio] No se pudo reproducir:', e.message);
  }
}

export function useConfiguracion() {
  return {
    config,
    guardado,
    DEFAULTS,
    TONOS,
    GRUPOS_TONO,
    publicarVariablesCSS,
    guardar,
    resetear,
    exportarJSON,
    importarJSON,
    probarTono,
  };
}
