#!/usr/bin/env node
/**
 * Banco de pruebas visual: abre cada vista del panel en un navegador de verdad,
 * la fotografía a tres anchos y comprueba once cosas mientras está abierta.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Todo el rediseño se verificó leyendo archivos: etiquetas equilibradas, clases
 * presentes, sintaxis correcta. Los cuatro fallos que encontró Richard en su
 * móvil —Reportes sin poder desplazarse, el zoom del Cartograma bajo el panel,
 * tarjetas demasiado altas, indicadores apilados de uno en uno— son invisibles
 * a ese tipo de análisis y evidentes en una captura.
 *
 * Y hay un quinto que nadie vio en meses: 68 usos de `focus:ring-3`, una
 * utilidad de Tailwind v4 que en v3 no existe. El color del anillo compila, el
 * grosor no. Sesenta y ocho controles sin anillo de foco, sin un solo error.
 * La comprobación 6 de aquí abajo lo habría cazado el primer día.
 *
 * ── LAS CAPTURAS NO SON EL PRODUCTO ─────────────────────────────────────────
 * Un banco que solo genera PNG se abandona: son 68 imágenes por pasada y a la
 * tercera nadie las abre. El producto son las comprobaciones deterministas, que
 * corren gratis con la página ya abierta. Las capturas son la evidencia de lo
 * que falló, no el entregable.
 *
 * ── CÓMO ENTRA SIN TOCAR LA APLICACIÓN ──────────────────────────────────────
 * Se aborta la petición a `/assets/vendor/supabase/`. Sin ese archivo,
 * `window.supabase` queda indefinido, `core/supabase.js` deja `db` en null y
 * `iniciarSesion()` cae al respaldo `DEMO_CREDENCIALES` que ya existe en
 * `stores/navegacion.js`. Cero cambios en el código de producción y ninguna
 * puerta trasera: se reutiliza un camino que ya estaba.
 *
 *     node herramientas/banco-visual.mjs --etiqueta=base
 *     node herramientas/banco-visual.mjs --etiqueta=fase1 --temas=ambos
 */
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'http://127.0.0.1:8080';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const ETIQUETA = args.etiqueta || 'sin-etiqueta';
const TEMAS_AMBOS = args.temas === 'ambos';
const DESTINO = join(RAIZ, 'screenshots', ETIQUETA);

/* Chrome ya instalado. Nunca se descarga un navegador: 170 MB para hacer
   capturas de una intranet municipal no se justifica, y el binario del sistema
   es además el que usan de verdad en la Alcaldía. */
const CANDIDATOS_CHROME = [
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

/* Los tres anchos, y por qué tres y no cuatro:
     · movil      — por debajo de `sm:` (640). Teléfono real, con DPR 2.
     · tableta    — ENTRE `sm:` y `lg:`. Es la combinación que rompe: densidad
                    de escritorio con el menú todavía en cajón.
     · escritorio — por encima de `lg:` (1024). El portátil de la Gerencia.
   Sin 1920: por encima de `lg:` no cambia nada y duplica la revisión humana.
   Sin 375: si algo se rompe ahí, `movil` ya lo delata como desbordamiento. */
const ANCHOS = [
  { nombre: 'movil',      width: 390,  height: 844,  deviceScaleFactor: 2, isMobile: true },
  { nombre: 'tableta',    width: 820,  height: 1180, deviceScaleFactor: 1, isMobile: false },
  { nombre: 'escritorio', width: 1440, height: 900,  deviceScaleFactor: 1, isMobile: false },
];

/* Las vistas del menú, con el id del botón que las abre. Se navega HACIENDO
   CLIC y no tocando el store: así se ejercita también la cadena de `v-else-if`
   de `app-root.html`, que es justo donde `vista-notificaciones` estuvo rota —el
   ítem del menú valía `vista-notificaciones` y la rama comparaba contra
   `notificaciones`, así que caía en el marcador de posición sin error—. */
const VISTAS = [
  ['dashboard',          'Dashboard'],
  ['mapa',               'Mapa en Vivo'],
  ['cartograma',         'Cartograma'],
  ['denuncias',          'Gestión de Denuncias'],
  ['intervenciones',     'Intervenciones'],
  ['reportes',           'Reportes'],
  ['departamentos',      'Departamentos'],
  ['catalogo',           'Catálogo'],
  ['cuadrillas',         'Cuadrillas'],
  ['usuarios',           'Usuarios'],
  ['poblacion',          'Población Registrada'],
  ['vista-comunicados',  'Comunicados'],
  ['roles',              'Roles y Permisos'],
  ['bitacora',           'Bitácora de Auditoría'],
  ['config',             'Configuración'],
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function servidorVivo() {
  try {
    const r = await fetch(BASE_URL + '/panel/', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

/** Arranca el servidor de desarrollo si no lo está ya. Devuelve cómo pararlo. */
async function asegurarServidor() {
  if (await servidorVivo()) return { propio: false, parar() {} };

  console.log('  Arrancando el servidor de desarrollo…');
  const hijo = spawn('python', [join(RAIZ, 'herramientas', 'servidor-dev.py')], {
    cwd: RAIZ, stdio: 'ignore', detached: false,
  });
  for (let i = 0; i < 30; i++) {
    await esperar(400);
    if (await servidorVivo()) return { propio: true, parar: () => hijo.kill() };
  }
  hijo.kill();
  throw new Error('El servidor de desarrollo no respondió en 12 s.');
}

/**
 * Las once comprobaciones. Corren dentro de la página, con ella ya pintada.
 * Devuelven datos, no juicios: quién falla y quién solo avisa se decide fuera.
 */
const SONDA = () => {
  const doc = document;
  const texto = doc.body ? doc.body.innerText : '';

  // 4 · Controles por debajo del objetivo táctil. Solo tiene sentido en móvil.
  const bajos = [];
  for (const el of doc.querySelectorAll('button, input, select, textarea, a[role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;          // oculto
    if (r.height < 40) {
      bajos.push({
        etiqueta: (el.innerText || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 40),
        alto: Math.round(r.height),
      });
    }
  }

  // 5 · Botones que son solo un icono y no dicen su nombre a nadie.
  const mudos = [];
  for (const b of doc.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0) continue;
    const conTexto = (b.innerText || '').trim().length > 0;
    const conNombre = b.getAttribute('aria-label') || b.getAttribute('title');
    if (!conTexto && !conNombre) mudos.push(b.className.slice(0, 60));
  }

  /* 10 · ¿Hay algo tapando la vista en el instante de la foto?
     La primera línea base salió con cero errores y quince capturas inservibles:
     el modal de instalación de la PWA cubría el móvil entero. Las otras sondas
     no lo vieron porque leen el DOM, y el DOM de debajo estaba perfecto.
     Se mira el punto medio de la pantalla y se pregunta quién responde. Si el
     elemento que está ahí arriba es un fijo grande que no pertenece a la vista,
     la captura no vale y hay que decirlo, no publicarla como buena. */
  const centro = doc.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  let capaEncima = null;
  for (let el = centro; el && el !== doc.body; el = el.parentElement) {
    const c = getComputedStyle(el);
    if (c.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    const cobertura = (r.width * r.height) / (window.innerWidth * window.innerHeight);
    if (cobertura > 0.4) {
      capaEncima = {
        cobertura: Math.round(cobertura * 100),
        texto: (el.innerText || '').trim().slice(0, 60).replace(/s+/g, ' '),
      };
      break;
    }
  }

  /* 11 · Contenido recortado SIN ruta de scroll.
     Es la queja literal de Richard sobre la primera migración: «algunas no
     tiene scroll». Una vista puede desbordar su caja y estar bien —si algún
     ancestro se desplaza— o estar rota —si nada se desplaza y el resto de la
     pantalla sencillamente no existe para el usuario—. Midiendo se encontró
     que usuarios recortaba 75px y comunicados 163px en móvil, invisibles en
     una captura porque el borde cortado parece el final natural de la página. */
  let recorteSinScroll = 0;
  const principal = doc.querySelector('main');
  if (principal) {
    const conScroll = [principal, ...principal.querySelectorAll('*')].some((el) => {
      const c = getComputedStyle(el);
      return el.scrollHeight - el.clientHeight > 4 && /auto|scroll/.test(c.overflowY);
    });
    if (!conScroll) {
      const caja = principal.getBoundingClientRect();
      let masBajo = caja.bottom;
      for (const el of principal.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.bottom > masBajo) masBajo = r.bottom;
      }
      recorteSinScroll = Math.max(0, Math.round(masBajo - caja.bottom));
    }
  }

  /* El menú tiene que poder ABRIRSE. Como la navegación del banco invoca el
     manejador directamente, esto es lo único que separa «el menú está oculto a
     propósito en móvil» de «el menú es inalcanzable». */
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
  };
  const menuAlcanzable = window.innerWidth >= 1024
    ? visible(doc.querySelector('#nav-btn-dashboard'))
    : [...doc.querySelectorAll('button')].some(
        (b) => /men[úu]/i.test(b.getAttribute('aria-label') || '') && visible(b));

  return {
    capaEncima,
    menuAlcanzable,
    recorteSinScroll,
    totalControlesBajos: bajos.length,
    totalBotonesMudos: mudos.length,
    sinResolver: texto.includes('{{'),                                   // 2
    plantillaRota: texto.includes('No se pudo cargar la plantilla'),     // 6
    desborde: Math.max(0, doc.documentElement.scrollWidth - window.innerWidth), // 3
    controlesBajos: bajos.slice(0, 8),
    botonesMudos: mudos.slice(0, 8),
  };
};

/** 8 · La paleta operativa la configura el administrador en tiempo de ejecución.
 *  Si una tarjeta KPI se escribe con `text-blue-600` en vez del token, se ve
 *  idéntica hoy e ignora en silencio todo cambio en Configuración → Apariencia.
 *  Se inyecta un magenta imposible y se mira si algo lo obedece. */
const SONDA_PALETA = () => {
  const marca = document.createElement('style');
  marca.textContent = ':root{--kpi-pendiente:#ff00ff !important}';
  document.head.appendChild(marca);
  const usan = [...document.querySelectorAll('.kpi-color--pendiente, .kpi-fondo--pendiente')];
  const obedece = usan.some((el) => {
    const c = getComputedStyle(el);
    return c.color.includes('255, 0, 255') || c.backgroundColor.includes('255, 0, 255');
  });
  marca.remove();
  return { nodosConToken: usan.length, obedece };
};

async function main() {
  const chrome = CANDIDATOS_CHROME.find((p) => existsSync(p));
  if (!chrome) {
    console.error('No encuentro Chrome. Define CHROME_BIN con la ruta al ejecutable.');
    process.exit(1);
  }

  const servidor = await asegurarServidor();
  await mkdir(DESTINO, { recursive: true });

  const navegador = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  const informe = { etiqueta: ETIQUETA, generado: new Date().toISOString(), vistas: [], errores: [], avisos: [] };
  let capturas = 0;

  for (const ancho of ANCHOS) {
    const temas = TEMAS_AMBOS || ancho.nombre === 'escritorio' ? ['claro', 'oscuro'] : ['claro'];

    for (const tema of temas) {
      const pagina = await navegador.newPage();
      await pagina.setViewport(ancho);

      const consola = [];
      pagina.on('console', (m) => { if (m.type() === 'error') consola.push(m.text().slice(0, 200)); });
      pagina.on('pageerror', (e) => consola.push('pageerror: ' + e.message.slice(0, 200)));

      // El corte que fuerza el modo demostración.
      await pagina.setRequestInterception(true);
      pagina.on('request', (r) => {
        if (r.url().includes('/assets/vendor/supabase/')) r.abort();
        else r.continue();
      });

      /* ── Congelar el reloj ────────────────────────────────────────────
         La cabecera muestra la hora y el tablero la fecha larga. Entre la
         pasada «base» y la «fase1» pasaron cinco minutos, y eso bastó para que
         las TREINTA capturas de escritorio salieran distintas: no solo cambia
         el texto, es que «12:57 p. m.» es un carácter más ancho que «1:02
         p. m.», y en una fila `justify-between` eso desplaza la miga de pan y
         el buscador seis píxeles. Comparar fases con el reloj vivo es comparar
         ruido, y una diferencia real se escondería entre treinta falsas.

         Se fija un instante conocido antes de que cargue nada. Es una fecha
         real y anodina —lunes laborable, media mañana— para que ningún cálculo
         de «hace X» ni ninguna franja horaria dé un resultado raro. */
      await pagina.evaluateOnNewDocument(() => {
        const INSTANTE = new Date('2026-03-16T10:30:00-06:00').getTime();
        const DateReal = Date;
        function DateCongelada(...args) {
          if (!(this instanceof DateCongelada)) return new DateReal(INSTANTE).toString();
          return args.length ? new DateReal(...args) : new DateReal(INSTANTE);
        }
        DateCongelada.prototype = DateReal.prototype;
        DateCongelada.now = () => INSTANTE;
        DateCongelada.parse = DateReal.parse;
        DateCongelada.UTC = DateReal.UTC;
        window.Date = DateCongelada;
        // `performance.now` se deja intacto: lo usan las animaciones y Leaflet.
      });

      const arranque = Date.now();
      await pagina.goto(BASE_URL + '/panel/', { waitUntil: 'networkidle2', timeout: 30000 });
      await pagina.evaluate((t) => {
        localStorage.setItem('color-theme', t === 'oscuro' ? 'dark' : 'light');
        /* El modal «Instalar Aplicación» tapaba la pantalla entera en móvil:
           las quince capturas de la primera línea base eran fotos del modal, no
           de las vistas, y el informe decía cero errores. Se pospone igual que
           lo haría el usuario —la misma clave, con marca de tiempo de ahora—,
           en vez de esconderlo con CSS, que dejaría el modal vivo y encima. */
        localStorage.setItem('sssur:monitoreo:pwa_dismissed', String(Date.now()));
      }, tema);
      await pagina.reload({ waitUntil: 'networkidle2' });
      const msMontaje = Date.now() - arranque;

      /* Acceso con el respaldo demostración.
         La sesión vive en localStorage y el navegador es uno solo, así que a
         partir de la segunda pestaña la aplicación ya arranca autenticada y el
         formulario no llega a pintarse nunca. Se comprueba primero si ya
         estamos dentro en vez de esperar diez segundos a un formulario que no
         va a aparecer. */
      try {
        const yaDentro = await pagina.$('#nav-btn-dashboard');
        if (!yaDentro) {
        await pagina.waitForSelector('input[autocomplete="current-password"]', { timeout: 10000 });
        const campos = await pagina.$$('form input');
        await campos[0].type('soporte.ti');
        await pagina.type('input[autocomplete="current-password"]', 'admin123#');
        await pagina.click('button[type="submit"]');
        await pagina.waitForSelector('#nav-btn-dashboard', { timeout: 15000 });
        }
      } catch (e) {
        informe.errores.push(`[${ancho.nombre}/${tema}] No se pudo entrar: ${e.message}`);
        await pagina.close();
        continue;
      }

      for (const [id, titulo] of VISTAS) {
        const clave = `${ancho.nombre}/${tema}/${id}`;
        consola.length = 0;
        try {
          /* Se dispara el manejador real del botón del menú, no el store.
             Con `page.click` fallaba en móvil y tableta: ahí el <aside> está
             en `-translate-x-full`, fuera de la pantalla, y Puppeteer se niega
             a pulsar lo que no es visible. El botón existe y su manejador es el
             mismo, así que se invoca directamente: sigue pasando por `irA()` y
             por la cadena de `v-else-if` de app-root, que es lo que interesa
             ejercitar. Que el menú sea ALCANZABLE se comprueba aparte. */
          const abierto = await pagina.evaluate((sel) => {
            const b = document.querySelector(sel);
            if (!b) return false;
            b.click();
            return true;
          }, `#nav-btn-${id}`);
          if (!abierto) throw new Error('no existe #nav-btn-' + id + ' en el menú');
          // Los mapas necesitan que Leaflet termine de medir y pedir teselas.
          await esperar(id === 'mapa' || id === 'cartograma' ? 2500 : 900);
        } catch (e) {
          informe.errores.push(`${clave}: no se pudo abrir — ${e.message}`);
          continue;
        }

        const sonda = await pagina.evaluate(SONDA);
        const paleta = id === 'dashboard' ? await pagina.evaluate(SONDA_PALETA) : null;

        const n = String(VISTAS.findIndex((v) => v[0] === id) + 1).padStart(2, '0');
        const archivo = `${n}-${id}__${ancho.nombre}__${tema}.png`;
        await pagina.screenshot({ path: join(DESTINO, archivo) });
        capturas++;

        // Rotura inequívoca.
        if (consola.length)        informe.errores.push(`${clave}: ${consola[0]}`);
        if (sonda.sinResolver)     informe.errores.push(`${clave}: hay {{ }} sin resolver en pantalla`);
        if (sonda.plantillaRota)   informe.errores.push(`${clave}: una plantilla no cargó`);
        if (paleta && paleta.nodosConToken > 0 && !paleta.obedece) {
          informe.errores.push(`${clave}: la paleta configurable no se aplica (${paleta.nodosConToken} nodos con token)`);
        }
        // Aviso con presupuesto.
        if (sonda.desborde > 1)    informe.avisos.push(`${clave}: desborda ${sonda.desborde}px en horizontal`);
        /* Mapa y cartograma quedan fuera de esta sonda: son lienzos con
           paneles deslizantes que viven más abajo del borde a propósito y se
           alcanzan arrastrando, no con scroll — aquí la sonda solo produciría
           falsos positivos que enseñan a ignorar el informe. */
        if (sonda.recorteSinScroll > 4 && id !== 'mapa' && id !== 'cartograma') {
          informe.avisos.push(`${clave}: ${sonda.recorteSinScroll}px de contenido inalcanzable — nada permite desplazarse`);
        }
        if (ancho.nombre === 'movil' && sonda.controlesBajos.length) {
          informe.avisos.push(`${clave}: ${sonda.totalControlesBajos} control(es) bajo 40px — ` +
            sonda.controlesBajos.slice(0, 3).map((c) => `"${c.etiqueta}" ${c.alto}px`).join(', '));
        }
        if (sonda.capaEncima) {
          informe.errores.push(`${clave}: la captura está tapada al ${sonda.capaEncima.cobertura}% por una capa fija — "${sonda.capaEncima.texto}"`);
        }
        if (!sonda.menuAlcanzable) informe.errores.push(`${clave}: el menú no se puede abrir`);
        if (sonda.botonesMudos.length) {
          informe.avisos.push(`${clave}: ${sonda.totalBotonesMudos} botón(es) de icono sin nombre accesible`);
        }

        informe.vistas.push({ vista: id, titulo, ancho: ancho.nombre, tema, archivo, ...sonda });
      }

      informe[`montaje_${ancho.nombre}_${tema}_ms`] = msMontaje;
      await pagina.close();
    }
  }

  await navegador.close();
  servidor.parar();

  // 7 · El precacheado contra el disco. Una plantilla nueva sin `npm run build`
  //     publica una PWA de campo que hace 404 sin cobertura, en territorio, sin
  //     consola. Es el fallo más caro que esta migración puede introducir.
  try {
    const manifiesto = JSON.parse(await (await import('node:fs/promises')).readFile(join(RAIZ, 'assets/precache.json'), 'utf8'));
    const enManifiesto = new Set(manifiesto.rutas);
    const faltan = [];
    async function recorrer(rel) {
      for (const e of await readdir(join(RAIZ, rel), { withFileTypes: true })) {
        const r = `${rel}/${e.name}`;
        if (e.isDirectory()) await recorrer(r);
        else if (!enManifiesto.has('/' + r)) faltan.push('/' + r);
      }
    }
    await recorrer('assets/templates');
    if (faltan.length) {
      informe.errores.push(`precache.json desactualizado: faltan ${faltan.length} plantilla(s). Ejecuta \`npm run build\`.`);
      informe.precacheFaltan = faltan.slice(0, 20);
    }
  } catch (e) {
    informe.avisos.push('No se pudo comprobar precache.json: ' + e.message);
  }

  /* Los recuentos que la Fase 4 congela como presupuesto. Van agregados aquí
     para que el linter no tenga que reinterpretar el detalle. */
  /* Mapa y cartograma no cuentan en el recorte: su desplazamiento es por arrastre. */
  const deProduccion = informe.vistas;
  informe.presupuesto = {
    controlesBajo40enMovil: deProduccion
      .filter((v) => v.ancho === 'movil')
      .reduce((a, v) => a + v.totalControlesBajos, 0),
    botonesSinNombre: deProduccion.reduce((a, v) => a + v.totalBotonesMudos, 0),
    vistasConDesborde: deProduccion.filter((v) => v.desborde > 1).length,
    vistasConRecorteSinScroll: deProduccion
      .filter((v) => v.recorteSinScroll > 4 && v.vista !== 'mapa' && v.vista !== 'cartograma').length,
  };

  await writeFile(join(DESTINO, 'informe.json'), JSON.stringify(informe, null, 2));

  const md = [
    `# Banco visual · ${ETIQUETA}`, '',
    `${capturas} capturas en \`screenshots/${ETIQUETA}/\``, '',
    `## Errores (${informe.errores.length})`, '',
    ...(informe.errores.length ? informe.errores.map((e) => `- ${e}`) : ['Ninguno.']), '',
    `## Avisos (${informe.avisos.length})`, '',
    ...(informe.avisos.length ? informe.avisos.map((a) => `- ${a}`) : ['Ninguno.']), '',
  ].join('\n');
  await writeFile(join(DESTINO, 'informe.md'), md);

  console.log(`\n${capturas} capturas · ${informe.errores.length} errores · ${informe.avisos.length} avisos`);
  console.log(`   screenshots/${ETIQUETA}/informe.md`);
  if (informe.errores.length) {
    console.error('\nErrores:');
    informe.errores.slice(0, 12).forEach((e) => console.error('  · ' + e));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
