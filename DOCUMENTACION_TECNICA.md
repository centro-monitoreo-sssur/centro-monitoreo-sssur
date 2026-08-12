# Documentación Técnica: Centro de Monitoreo SSSur

> Orientada a desarrolladores que necesiten comprender la arquitectura, decisiones de diseño y funcionamiento interno del frontend, además del stack backend real de despliegue.
> **Última actualización:** 10 de agosto de 2026 · repositorio en `b0f7f0e`
> **Stack backend adoptado:** Supabase (Postgres + PostGIS + Auth + Storage + Realtime) como backend único. cPanel compartido solo para hosting estático del frontend y backup histórico de fotos. Sistema **uso interno exclusivo** (empleados/admin). Portal ciudadano desactivado como feature futura.

> **⚠ Si estás retomando el trabajo en otra máquina, lee primero la [Sección 15: Estado del trabajo (handoff)](#15-estado-del-trabajo-handoff).** Contiene qué migraciones corrieron en Supabase, qué quedó pendiente y las trampas conocidas.

> **⚠ Este archivo NO viaja por git.** Está en `.gitignore` (línea 50). Solo llega a otra máquina por la sincronización de MEGA. Si clonas desde GitHub, no lo vas a encontrar. Ver §15.1.

### Qué cambió en el hito de agosto de 2026

El sistema pasó de «demo navegable» a **operativo para reporte en territorio**, que era el encargo de Alcaldía. Lo sustancial:

- **Aislamiento por contexto** (§2.1) — las tres aplicaciones dejan de compartir sesión y almacenamiento local.
- **Alta y cierre de casos desde campo** (§8) — antes NINGÚN reporte de la PWA llegaba a la base; el `insert` enviaba tres columnas inexistentes y omitía cinco obligatorias.
- **Fuera los datos inventados** del módulo de empleados y del Cartograma.
- **Geografía real en la base** (§9) — polígonos oficiales de los 5 distritos y 153 colonias de San Marcos.
- **Realtime que de verdad emite** — `casos` nunca estuvo en la publicación de Supabase, así que el «Mapa en Vivo» nunca lo fue.

---

## 1. Arquitectura Frontend (Buildless · Vue 3 CDN)

A diferencia de un stack moderno típico (Vite/Webpack), este proyecto adopta una **arquitectura sin etapa de construcción (buildless)**.

### ¿Por qué esta arquitectura?
- **Despliegue zero-friction:** Archivos servidos directamente desde cPanel (hosting estático).
- **Sin dependencias Node.js:** No hay `package.json`, `node_modules` ni problemas de versiones de build.
- **Inyección vía CDN:** Vue 3, TailwindCSS, Leaflet, Chart.js → `<script>` estáticos en `index.html`.
- **Backend como servicio:** Toda la lógica de datos, auth y almacenamiento reside en Supabase. No hay API propia que mantener.

**Consecuencia práctica:** no hay `npm run dev`. Para trabajar en local basta con servir la carpeta con cualquier servidor estático (`python -m http.server 8080`, Live Server de VS Code, etc.). **No se puede abrir `index.html` con `file://`** porque los módulos ES y el `fetch()` de plantillas violan CORS.

### El Patrón de Componentes Híbridos

El proyecto emula los *Single File Components* (SFC) separando lógica y plantilla:

1. **Lógica (JS):** `assets/js/components/<subcarpeta>/<nombre>.js` — exporta la `setup()` function de Vue.
2. **Plantilla (HTML):** `assets/templates/<subcarpeta>/<nombre>.html` — HTML puro, sin lógica.

El bootstrap (`app.js`) usa `cargarTodasLasPlantillas()` del `template-loader.js` para obtener asíncronamente cada HTML y asignarlo a la propiedad `template` del componente Vue. El registro central está en `assets/js/components/index.js`; los `tpl` incluyen subfolder: `"empleados/vista-mapa-vivo"` → `assets/templates/empleados/vista-mapa-vivo.html`.

> **Trampa del patrón:** como la plantilla y la lógica viven en archivos distintos, **nada valida que coincidan**. Si la plantilla llama a una función que el `setup()` no retorna, Vue lanza `TypeError: X is not a function` y **renderiza pantalla en blanco** sin más pistas. Esto ya ocurrió (ver §14). Al copiar una plantilla de otro módulo, verifica siempre que el `return` del componente destino exponga todo lo que la plantilla usa.

### Estructura de subcarpetas

```
components/          templates/
├── index.js         (registro central)
├── shared/          shared/       ← app-root, app-sidebar, app-topbar, bottom-tab-bar, login, placeholder, modales, toasts
│   └── ui/          shared/ui/    ← 7 primitivas reutilizables: boton, input, select, card, modal, tabla, badge
├── admin/           admin/        ← 13 módulos del panel de administración
│   └── mapa/        admin/mapa/   ← barra-territorial, tablero-distritos (piezas de la consola)
├── empleados/       empleados/    ← 10 vistas de la PWA de campo
└── poblacion/       poblacion/    ← 8 vistas de la PWA ciudadana (feature futura, registrada pero no habilitada)
```

**Regla de imports:** Los archivos dentro de subcarpetas usan `../../core/`, `../../stores/`, etc. Los de `admin/mapa/` y `shared/ui/`, un nivel más: `../../../core/`.

Además de `components/` y `stores/`, hay dos carpetas que conviene conocer antes de tocar el mapa:

| Carpeta | Contenido |
|---|---|
| `assets/js/config/mapa/` | Catálogos declarativos: `herramientas-mapa.js` (capas base, herramientas, capas territoriales), `paneles-mapa.js`, `filtros-territoriales.js`. Añadir una herramienta es añadir una entrada, no tocar la vista. |
| `assets/js/services/` | `casos-campo.js` (alta en territorio), `mapa/capas-territoriales.js` (pintado de límites), `geo-json/cargador.js` (cartografía oficial), `marcadores.js`, `graficas.js`, `conexion.js`, `fotos-perfil.js` |

---

## 2. Gestión de Estado y Enrutamiento

Se usa **Composition API** de Vue 3 (`ref`, `reactive`, `computed`, `watch`, `onMounted`).

### Enrutamiento SPA y Contextos

El componente `app-root` actúa como router. Renderiza `<vista-X>` basado en `vistaActual` (proveniente de `stores/navegacion.js`).

**Sistema de Contextos (3 URLs parametrizadas):**

| URL | Contexto | Estado |
|---|---|---|
| `https://monitoreo.sansalvadorsur.gob.sv` | Centro de Monitoreo (admin) | Activo |
| `…?contexto=empleados` | PWA de empleados de territorio | Activo |
| `…?contexto=poblacion` | PWA ciudadana | **Feature futura**, no habilitada |

La resolución de la vista de arranque vive en `shared/app-root.js`:

```js
const VISTA_POR_CONTEXTO = { poblacion: 'pwa-poblacion', empleados: 'pwa-empleado' };
const ROLES_DE_CAMPO = ['empleado'];
// resolverVistaDestino(): contexto → rol del usuario → 'dashboard'
```

### 2.1 Aislamiento por contexto — `core/app-contexto.js` y `core/almacen.js`

**El problema.** Un solo `index.html` sirve tres aplicaciones. Comparten origen, luego compartían `localStorage` **y la sesión de Supabase**: abrir la PWA de campo en una pestaña cerraba la sesión del Centro de Monitoreo en la otra, y `onAuthStateChange` propagaba el cambio hasta que ambas pestañas acababan siendo el mismo usuario. Con eso era imposible validar los dos flujos a la vez.

Peor aún: la cola offline vivía en la clave global `offline_queue`, así que el Centro de Monitoreo abierto en otra pestaña la leía y **sincronizaba con SU token los partes que había levantado un empleado**.

**La solución.** Dos módulos del núcleo:

| Módulo | Rol |
|---|---|
| `core/app-contexto.js` | Resuelve el contexto UNA vez, en tiempo de carga. Exporta `CONTEXTO`, `PREFIJO_ALMACEN` (`sssur:<contexto>:`) y `CLAVE_SESION` (`sb-sssur-<contexto>`). **No importa nada** a propósito: tiene que evaluarse antes que `supabase.js`. |
| `core/almacen.js` | Adaptador sobre `localStorage` que antepone el prefijo. Expone `almacen` (por contexto) y `almacenDispositivo` (sin prefijo, para preferencias del aparato como el tema). |

```js
// core/supabase.js
db = window.supabase.createClient(URL, ANON_KEY, {
  auth: { storageKey: CLAVE_SESION },   // ← separa sesión Y canal entre pestañas
});
```

Separar la `storageKey` separa además el canal de sincronización entre pestañas, porque el SDK lo nombra a partir de ella.

**Reglas que se derivan y hay que respetar:**

1. **La URL es la única fuente de verdad del contexto.** No hay respaldo en `sessionStorage`: la app no tiene enrutador, la URL nunca cambia sin recarga y un respaldo solo añadiría estado rancio.
2. **Cambiar de contexto exige navegación completa** (`window.location.href = …`), nunca un `irA()`. Sin recarga, el módulo conserva el contexto anterior y la sesión acaba escrita en la partición equivocada.
3. **Nadie vuelve a tocar `localStorage` directamente.** Todo pasa por `almacen`, que además absorbe el JSON corrupto, la cuota agotada (crítico: la cola guarda fotos en base64) y el modo privado de Safari, donde el simple hecho de leer `localStorage` lanza excepción.
4. `signOut()` usa `{ scope: 'local' }`. El ámbito global —el que trae por defecto— revoca todos los refresh tokens del usuario: un supervisor que sale de la PWA se encontraba caída la sesión del Centro de Monitoreo.

**Manifiesto por contexto.** `manifest-empleados.json` y `manifest-poblacion.json` con su propio `start_url`. Con un único manifiesto, un empleado que instalara la PWA la abría en el Centro de Monitoreo, porque el acceso directo perdía el `?contexto=`. Un script en línea de `index.html` intercambia el `<link rel="manifest">` según la URL, y va ahí —no en un módulo ES— porque el navegador lee el manifiesto muy pronto.

Rutas registradas por portal:

| Portal | Rutas principales |
|---|---|
| Admin (shell) | dashboard, mapa, cartograma, denuncias, intervenciones, bitacora, reportes, usuarios, roles, departamentos, poblacion, vista-notificaciones, config |
| PWA Empleados | pwa-empleado, mapa-vivo, mis-intervenciones, detalle-intervencion, cierre-incidente, levantar-denuncia, buzon-offline, mi-perfil-empleado, bitacora-empleado, notificaciones-empleado |
| PWA Ciudadana | pwa-poblacion, crear-denuncia, mis-denuncias, detalle-denuncia, mapa-distrito, noticias, mi-perfil-poblacion, registro-poblacion |
| Compartidas | login, buzon-offline |

### Stores

Singletons de módulo (el estado vive en el scope del archivo, no dentro de la función `use*`). Sin Vuex ni Pinia.

| Store | Archivo | Rol |
|---|---|---|
| navegacion | `stores/navegacion.js` | Vista actual, sidebar, tema, **sesión Supabase Auth**, rol, nombre, departamento y distrito del usuario |
| denuncias | `stores/denuncias.js` | Casos + suscripción Realtime + contador del badge |
| catalogos | `stores/catalogos.js` | Categorías, departamentos, direcciones, distritos, **prioridades** y **flujo de estados por categoría** |
| intervenciones | `stores/intervenciones.js` | Intervenciones, cuadrillas y **capas del mapa** (`cargarCapasMapa`) |
| **mis-casos** | `stores/mis-casos.js` | Los casos del empleado autenticado: asignados a él y levantados por él. Sustituye a tres implementaciones divergentes de la PWA |
| **territorio** | `stores/territorio.js` | KPIs por distrito desde `v_kpis_distrito` y desde el RPC de período. Recorta por ámbito del usuario |
| **perfil-distritos** | `stores/perfil-distritos.js` | Población, altitud, teléfono y descripción de cada distrito, desde `distritos_perfil` |
| **permisos** | `stores/permisos.js` | Alcance de datos vía RPC `mi_alcance()`. **No es control de seguridad** (ver §6) |
| **roles** | `stores/roles.js` | Matriz de roles × módulos × CRUD, ya editable (v22) |
| **diagnostico** | `stores/diagnostico.js` | ~25 comprobaciones de salud del esquema y del plan |
| poblacion | `stores/poblacion.js` | Ciudadanos registrados |
| usuarios | `stores/usuarios.js` | Usuarios del sistema y ámbitos individuales |
| auditoria | `stores/auditoria.js` | Bitácora inmutable |
| dashboard | `stores/dashboard.js` | Agregados de KPIs |
| reportes | `stores/reportes.js` | Reportes generados y exportación CSV |
| notificaciones | `stores/notificaciones.js` | Notificaciones in-app |
| configuracion | `stores/configuracion.js` | Preferencias de UI, colores de KPI, tonos de alerta, estado inicial del mapa |
| offline-queue | `stores/offline-queue.js` | Cola de operaciones sin conexión, en `localStorage` vía `almacen` |
| pwa | `stores/pwa.js` | Instalación, service worker, estado online/offline |

**Estado de conexión a BD.** El módulo de empleados y el Cartograma ya no tienen datos de ejemplo. Lo que queda:

- `intervenciones.js` conserva `intervencionesDemo` como respaldo cuando NO hay cliente Supabase.
- `catalogos.js` mantiene `tiposDenunciaFallback` y `departamentosFallback`, pero expone `catalogosEnFallback` para que la UI pueda avisar. Distritos y direcciones **no tienen respaldo** a propósito: un distrito inventado en una consola territorial es peor que una lista vacía.

> **Criterio que se aplicó y conviene mantener:** ante un fallo de consulta se **vacía y se avisa**, nunca se cae a datos de ejemplo. Una lista falsa es indistinguible de una real para quien la mira, y aquí se decide a qué punto del municipio se manda una cuadrilla.

---

## 3. Módulos Implementados

### Panel de Administración
| Módulo | Descripción |
|---|---|
| `admin/vista-mapa` | Consola GIS: Leaflet, MarkerCluster, heatmap, polígonos, medición OSRM, tramos |
| `admin/vista-dashboard` | KPIs + Chart.js reactivo al tema oscuro |
| `admin/vista-denuncias` | DataGrid con filtros multi-criterio y modal de revisión |
| `admin/vista-intervenciones` | Kanban drag & drop de cuadrillas |
| `admin/vista-cartograma` | Análisis territorial por distrito |
| `admin/vista-departamentos` | Direcciones y departamentos (organigrama) |
| `admin/vista-usuarios` | CRUD de usuarios del sistema |
| `admin/vista-poblacion` | Ciudadanos registrados |
| `admin/vista-roles` | Matriz de permisos interactiva |
| `admin/vista-bitacora` | **Auditoría del sistema** (inmutable) |
| `admin/vista-notificaciones` | Gestión de notificaciones |
| `admin/vista-reportes` | Reportes y analítica |
| `admin/vista-configuracion` | Parámetros, colores de pines, sonidos, límites |

### PWA Empleados de Campo

Todas conectadas a la base desde agosto de 2026. Ninguna muestra ya datos de ejemplo.

| Módulo | Descripción | Fuente |
|---|---|---|
| `empleados/vista-pwa-empleado` | Home. Contador de trabajo vivo y adscripción real del perfil | `mis-casos` + `navegacion` |
| `empleados/vista-mapa-vivo` | Mapa Leaflet centrado en config del admin | `denuncias` |
| `empleados/vista-mis-intervenciones` | Tareas asignadas, ordenadas por urgencia y antigüedad | `mis-casos` |
| `empleados/vista-detalle-intervencion` | Mini-mapa en la coordenada real + datos + botón de cierre | `mis-casos` |
| `empleados/vista-levantar-denuncia` | Alta presencial: GPS, categoría, referencia y datos del denunciante | RPC `crear_caso_campo` |
| `empleados/vista-cierre-incidente` | Resolución. Solo accesible desde el detalle | RPC `cerrar_caso_campo` |
| `empleados/vista-buzon-offline` | Cola de sincronización | `offline-queue` |
| `empleados/vista-bitacora-empleado` | Historial personal | `mis-casos` |
| `empleados/vista-mi-perfil-empleado` | **Sigue simulado** — última pieza pendiente (§15.3) | — |

> **Lo que había antes, para que no vuelva.** `vista-mis-intervenciones` no consultaba la base en absoluto: leía `localStorage` y, si estaba vacío, mostraba dos tareas inventadas. `vista-bitacora-empleado` rellenaba con cinco casos falsos —con topónimos reales y resoluciones verosímiles— cuando el empleado no tenía ninguno. `vista-pwa-empleado` mostraba `tareasPendientes = ref(3)`, un tres fijo. Un empleado podía pasar la jornada creyendo que tenía trabajo asignado que no existía en ningún sistema.

---

### 3.1 Módulos incorporados en agosto de 2026

| Vista | Store | Migración | Qué resuelve |
|---|---|---|---|
| `admin/vista-cuadrillas` | `stores/cuadrillas.js` | — | Equipos operativos y su composición. Las tablas y la RLS existían desde v10 sin frontend |
| `admin/vista-catalogo` | `stores/catalogo-categorias.js` | — | Cada jefatura gestiona sus categorías y declara qué más atiende. La v26 dejó permisos y triggers sin pantalla |
| Panel en `admin/vista-denuncias` | `stores/gestion-casos.js` | **v30** | Asignar responsable/cuadrilla y mover el caso por su flujo, con bitácora |
| — | `services/evidencias.js` | — | Subida de fotografías a cPanel |

**Sobre la pertenencia a cuadrillas:** la verdad está en `cuadrilla_integrantes`, que es
lo que leen `auth_cuadrillas_del_usuario()` (v16) y `auth_caso_en_mi_ambito()` (v14).
`usuarios.cuadrilla_id` es una denormalización heredada que **ninguna policy consulta**;
el store la mantiene sincronizada solo para que la pantalla de Usuarios no contradiga a
la de Cuadrillas. Es candidata a eliminarse.

**Sobre las dos RPC de la v30:** son RPC y no `update` directo por dos razones. El estado
destino debe pertenecer a `categorias_caso.estados_flujo`, y una policy de UPDATE no
puede expresar «el valor nuevo está en un JSONB de otra tabla». Y el cambio junto con su
entrada en `historial_estados_caso` deben ocurrir en la misma transacción: partidos en
dos peticiones, una caída de red deja un caso que cambió de estado sin constancia de
quién lo cambió.

Se valida **pertenencia al flujo, no adyacencia**: `estados_flujo` es un array, no un
grafo, y exigir el estado siguiente impediría rechazar un caso «pendiente» sin pasar por
«en revisión» y «en obra».

---

## 4. Consola del Mapa en Vivo (admin) — rediseño julio 2026

El mapa del Centro de Monitoreo se reconstruyó como **consola de grid** para directores, gerentes y jefaturas.

### Layout

`assets/css/mapa.css` — `.mapa-vista` conserva `position: relative` porque lo comparte `vista-cartograma.html`; el grid está aislado en un modificador para no romper esa vista:

```css
.mapa-vista--consola {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: "feed stage capas"
                       "footer footer footer";
}
.mapa-vista.is-fullscreen { position: fixed; inset: 0; z-index: 10000; }
```

Piezas: `.mv-panel--feed` (izquierda, colapsable por ancho animado) · `.mv-stage` (mapa + dock + KPIs + popovers + leyenda) · `.mv-panel--capas` (derecha) · `.mv-footer`. Bajo `1023.98px` ambos paneles colapsan y se usa un *bottom sheet*.

- Los `minmax(0, 1fr)` son obligatorios: sin ellos el `min-width: auto` de flex/grid hace que el mapa empuje los paneles fuera del viewport.
- Los modales se declaran **fuera** del grid.

### Anclaje del mapa al cambiar de caja

Cuando cambia el tamaño del escenario hay que llamar a `invalidateSize()` o Leaflet dibuja teselas grises. Pero **ninguna de sus dos opciones deja el mapa quieto**, y esto costó un diagnóstico:

| Opción | Ancla | Síntoma |
|---|---|---|
| `pan: true` (defecto) | el **centro** del contenedor | Al ensancharse hace `panBy` de medio ancho ganado: el mapa «se va» solo |
| `pan: false` | la **esquina superior izquierda** | Con el panel derecho va bien. Al plegar el **izquierdo**, el borde izquierdo se desplaza, la esquina se va con él y el contenido **viaja pegado al panel** |

Esa asimetría es la que hacía que solo se notara con el panel izquierdo. La única solución es **compensar explícitamente** cuánto se movió la esquina:

```js
const rect = lmap.getContainer().getBoundingClientRect();
lmap.invalidateSize({ animate: false, pan: false });
if (_rectPrevio) {
  const dx = rect.left - _rectPrevio.left;
  const dy = rect.top  - _rectPrevio.top;
  if (dx || dy) lmap.panBy([dx, dy], { animate: false });  // panBy mueve el contenido al revés
}
_rectPrevio = rect;
```

Se dispara desde un **`ResizeObserver`** sobre el contenedor, no desde un temporizador tras el cambio de panel. Tres razones: dispara en cada fotograma de la transición de 300 ms —el mapa queda inmóvil durante toda la animación, no solo al final—, no depende de acertar la duración, y cubre también los cambios de caja que no vienen de estos paneles: plegar el sidebar de la aplicación, pantalla completa y redimensionar la ventana. Limitado a un trabajo por fotograma con `requestAnimationFrame`.

> Corolario: **no llames a `invalidateSize()` suelto** en esta vista. Todo pasa por `anclarTrasCambioDeCaja()`.

### Capas territoriales configurables

`services/mapa/capas-territoriales.js` es un gestor por mapa, compartido entre **Mapa en Vivo y Cartograma**. Existe porque el mismo `L.geoJSON` con su estilo, su tooltip y su limpieza estaba copiado en seis archivos y las copias ya habían divergido.

| Capa | Fuente | Nota |
|---|---|---|
| Límite municipal | fusión de los 5 distritos con Turf, memorizada | Sin archivo propio: hay que dissolver. Si Turf falla, degrada a los 5 contornos |
| Límites distritales | `limites-sssur.geojson` | Sin relleno: teñir la superficie apaga las teselas y resta contraste a los pines |
| Colonias | `colonias-san-marcos.geojson` | 153 polígonos, renderizador `L.canvas()`. Con SVG el desplazamiento va a tirones |

Las tres se declaran en `config/mapa/herramientas-mapa.js` con `grupo: 'territorio'` y su `claveConfig`, así que su estado inicial se configura desde **Configuración → Mapa**. El Cartograma ofrece solo municipio y colonias: allí los distritos **son** el cartograma.

Antes había un único conmutador llamado `distritos` cuya etiqueta en la plantilla decía «Límites Municipio» — dos cosas distintas bajo un mismo interruptor.

### Bug de raíz que causaba los 3 síntomas reportados

Un `</div>` huérfano en `vista-mapa.html:187` cerraba `.mapa-vista` antes de tiempo. Eso, y no el CSS, era la causa de (1) panel izquierdo detrás del sidebar, (2) KPIs sobre el topbar y (3) botones flotantes repartidos. Se corrigió con reescritura completa de la plantilla, verificada con balanceo de etiquetas.

### Capas conectadas a BD

```js
const { tramos, intervencionesMapa, cargarCapasMapa } = useIntervenciones();
watch(routes,        () => { if (lmap) pintarRutas(); });
watch(interventions, () => { if (lmap) pintarIntervenciones(); });
```

`cargarCapasMapa()` consulta `v_casos_mapa` y separa las filas por el flag `es_tramo`. Los "Tipos de Denuncia" del panel derecho ya **no son hardcodeados**: salen de `categorias_caso` vía `catalogos.js`. Si la consulta falla, las capas se vacían — **no** se cae a datos de demo, para que el error sea visible.

---

## 5. Modelo Organizacional Mutable

Las direcciones y departamentos son **líneas y sublíneas de trabajo**, no entidades fijas. La realidad municipal exige soportar: supresión, renombrado, unificación de departamentos y desaparición de una dirección con sus dependencias migrando a otra.

**Fuente de verdad:** `database/direcciones.csv` y `database/departamentos.csv` (8 direcciones, 82 departamentos).

**Solución adoptada:** *slowly-changing dimension* con borrado lógico y punteros de sucesión, en lugar de `DELETE`.

- `sucedido_por_id`, `vigente_desde`, `vigente_hasta`, `motivo_baja`
- `fn_departamento_vigente(id)` — recursiva, con guarda de ciclos a 50 saltos
- `fn_suprimir_departamento(codigo, codigo_sucesor, motivo, fecha)` — migra casos **abiertos**, usuarios, cuadrillas, categorías y plantillas al sucesor; **deja intactos los casos cerrados** para no falsear el histórico
- `fn_reasignar_direccion()` + trigger de guarda
- Vistas `v_organigrama_vigente` y `v_departamentos_historicos`

El seed (v7) hace *upsert* por `codigo`, de modo que un renombrado se aplica **sin tocar los ids internos** ni romper las FK existentes.

### Categorías por departamento (N:M)

Un departamento puede atender varias categorías y una categoría puede tocar varios departamentos, pero solo **uno** es el responsable principal:

- Tabla puente con `es_responsable_principal` (índice único parcial `where es_responsable_principal`) y `puede_intervenir`
- Trigger `sync_categoria_responsable()` mantiene la coherencia
- Vista `v_categorias_por_departamento`

---

## 6. Seguridad: Roles, Permisos y RLS por Departamento

### Regla de negocio

> *"Un jefe de área puede ver aquellos casos que le corresponden solo a su departamento."*

### Capa de permisos

Roles reales en BD: `superadmin` (1), `admin` (2), `jefe_area` (3), `empleado` (4), `alcalde`, `directivo`. Los roles `operador` (7) y `lector` (8) quedaron **desactivados**.

`alcalde` y `directivo` tienen 18 permisos de **solo lectura** — cero escritura, por diseño.

> **Bug crítico ya corregido:** `auth_tiene_permiso()` agrega con `bool_or`; sobre cero filas devuelve `NULL`, y una policy que evalúa `NULL` **deniega**. Con las tablas `permisos_modulos` y `roles_permisos` vacías, todo el sistema quedaba bloqueado en silencio. Los seeds v11–v13 lo resuelven.

### Alcance de datos territorial (v16)

El municipio se organiza en 5 distritos, cada uno con una **Jefatura de Distrito** que supervisa todo lo que ocurre en su territorio, sea cual sea el departamento que atienda el caso.

La decisión de diseño es separar dos preguntas ortogonales que v14 tenía mezcladas:

| Tabla | Responde |
|---|---|
| `roles_permisos` | ¿Qué **módulo** y qué **verbo** CRUD? |
| `rol_alcance_datos` | ¿Sobre qué **filas**? |

`rol_alcance_datos` tiene dos ejes independientes —`alcance_territorial` (municipio / distrito_propio / distritos_asignados) y `alcance_organizacional` (municipio / direccion_propia / departamento_propio / solo_asignados)— más un `combinador` (`and` = intersección, `or` = unión).

La jefatura distrital es `distrito_propio` × `municipio`: todo su territorio, cualquier departamento.

**No rompe v14 por construcción:** la semilla deja a `jefe_area` y `empleado` con `alcance_territorial = 'municipio'`, con lo que la cláusula territorial devuelve los 5 distritos y queda neutralizada. v14 pasa a ser un caso particular de v16.

`usuario_ambitos` añade excepciones individuales (delegación temporal, exclusión puntual) con vigencia y `motivo` obligatorio. `denegar` siempre gana sobre `conceder`.

> **Por qué las funciones devuelven arrays y no booleanos.** `auth_caso_en_mi_ambito()` de v14 recibe columnas de la fila, lo que la convierte en subconsulta **correlacionada**: se ejecuta una vez por fila y cada ejecución dispara 2-3 subconsultas más. Las funciones de v16 no reciben nada de la fila, así que `distrito_id = any ((select auth_distritos_visibles()))` se compila como **InitPlan** y se evalúa **una sola vez por consulta**. Además `= any(array)` se compila a `ScalarArrayOpExpr` y sí aprovecha un índice B-tree, cosa imposible con una función booleana opaca.

> `now()` no es IMMUTABLE y por tanto **no puede usarse en el predicado de un índice parcial**. La vigencia de `usuario_ambitos` se filtra dentro de la función, no en el índice.

El RPC `mi_alcance()` expone el alcance al frontend a través de `stores/permisos.js`. **Ese store no es un control de seguridad**: solo evita ofrecer controles inútiles (ocultar el selector de distrito a quien solo tiene uno). Si un dato llega al cliente es porque la RLS lo permitió; el arreglo, si hiciera falta, va en la policy.

### Aislamiento por departamento (v14)

```sql
auth_departamento_id()
auth_ve_todo_el_municipio()
auth_caso_en_mi_ambito(departamento, categoria, responsable, cuadrilla)
```

Las policies `casos_select` / `casos_update` se reemplazaron para usarlas. Las tablas derivadas (fotos, seguimientos, etc.) se acotan con `using (exists (select 1 from public.casos c where c.id = caso_id))` — sin esto un jefe de área podía leer los adjuntos de casos que no le corresponden.

### ⚠ `security_invoker` — la fuga que anulaba todo lo anterior (v15)

Las vistas de Postgres se ejecutan por defecto **con los privilegios de su dueño**. El dueño aquí es `postgres`, que tiene `BYPASSRLS`. Es decir: `v_casos_mapa` devolvía **todos** los casos del municipio a cualquier usuario autenticado, derrotando por completo el aislamiento de v14.

La v15 aplica `security_invoker = on` a las 5 vistas mediante un bloque `do $$` con guarda de versión (requiere PG 15+).

**Regla permanente:** *toda vista nueva que exponga datos de `casos` debe declarar `security_invoker = on`.* Es fácil de olvidar y el síntoma no es un error, es una fuga silenciosa.

---

## 7. Tramos y Recorridos (geometría LineString)

### Definición de dominio

Un empleado —o un jefe de departamento— registra una intervención en el territorio **y marca el trayecto/tramo recorrido** desde `?contexto=empleados`. Ese tramo debe aparecer en el Mapa en Vivo del Centro de Monitoreo.

Dos modos de captura:

1. **Manual** — el usuario dibuja los vértices a mano. Necesario en zonas rurales que **no existen en la base de calles de OpenStreetMap**.
2. **Trazado inteligente** — el usuario define inicio y fin y el ruteo (OSRM) resuelve el camino; **debe ser editable**, porque el ruteo se desvía por calles que no forman parte de la intervención real.

### Modelo físico (v15)

| Columna | Tipo | Nota |
|---|---|---|
| `recorrido` | `geography(LineString, 4326)` | Índice GiST |
| `recorrido_modo` | texto | `manual` \| `trazado_inteligente` |
| `recorrido_vertices` | `jsonb` | Vértices editables por el usuario, para poder reabrir y corregir el trazo |

Más: *check* de bounding box (rechaza coordenadas fuera del municipio) e índices parciales. La vista `v_casos_mapa` se extendió con `recorrido_geojson`, `recorrido_metros` y `es_tramo`.

**Punto vs. línea:** un caso es un *punto* (denuncia) o un *tramo* (intervención lineal). `es_tramo` es lo que el frontend usa para decidir si pinta marcador o polilínea.

> **Error de migración que vas a encontrar si reeditas vistas:** `CREATE OR REPLACE VIEW` **solo permite añadir columnas al final**; renombrar o reordenar lanza `ERROR: 42P16: cannot change name of view column`. Hay que hacer `drop view` + `create view` y **volver a declarar** el `grant select ... to authenticated` y el `comment on view`, que el `drop` se lleva.

### Frontend

`stores/intervenciones.js` incorpora `geoJsonALatLng()` — GeoJSON entrega `[lng, lat]` y Leaflet espera `[lat, lng]`. Invertir esto es el error clásico: las geometrías aparecen en el océano Índico.

---

## 8. Reporte desde Territorio (v18 · v20 · v21)

Es el encargo de Alcaldía: que un empleado pueda levantar y cerrar casos desde el teléfono y que el Centro de Monitoreo lo vea.

### Por qué NINGÚN reporte llegaba antes

`vista-levantar-denuncia.js` insertaba directo en `casos` enviando **tres columnas que no existen** (`coordenadas` como texto, `es_anonima`, `origen`) y **omitiendo cinco `not null`** (`distrito_id`, `canal_reporte_id`, `departamento_actual_id`, `prioridad_id`, `direccion_referencia`), más el `check ck_casos_creador`. El insert fallaba siempre, el `catch` lo encolaba, y la cola **reconstruía el mismo cuerpo inválido**. El empleado veía *«Sin conexión, guardado en el buzón»* estando conectado, y su denuncia no existía en ningún sitio.

### Los dos RPC

Todo pasa por `services/casos-campo.js` y `stores/mis-casos.js`. El navegador manda solo lo que de verdad conoce.

| RPC | Resuelve en la base |
|---|---|
| `crear_caso_campo` | distrito (por la ubicación), departamento y prioridad (por la categoría, vía `trg_casos_sync_campos`), estado inicial (`categorias_caso.estado_inicial`), creador (`auth.uid()`) |
| `cerrar_caso_campo` | estado final del flujo de la categoría, fecha de cierre, evidencia e historial, **en una sola operación atómica** |

**Lo que el cliente NO manda, a propósito:** el usuario que reporta —sale de `auth.uid()`, no es falsificable— y el distrito, que se deduce del punto contra los polígonos oficiales. Un teléfono puede mentir; un `ST_Intersects` contra la geometría del municipio, no. Esa deducción es a la vez la validación de jurisdicción.

**Ambos son SECURITY DEFINER**, y la razón es concreta: PostgreSQL aplica las policies de SELECT a la salida de `INSERT … RETURNING`, y `casos_select` no contemplaba «lo que yo reporté». Un empleado con alcance `solo_asignados` crea un caso que aún no tiene responsable, así que no pasaba su propia policy de lectura y el `RETURNING` fallaba — justo para el usuario al que va dirigida la función. La v18 añade además la rama de autoría a `casos_select`, porque sin ella el empleado levantaba un parte y desaparecía de su vista.

### Idempotencia — el detalle que evita duplicados

Cada alta lleva una `referencia_cliente` generada **antes del primer intento** y conservada si acaba en el buzón. Si la red se corta después de que la base insertó pero antes de que llegue la respuesta, el reintento devuelve el caso existente en lugar de crear otro. Es el modo de fallo **normal** de una app de campo, no una rareza. `cerrar_caso_campo` responde `ya_cerrado: true` por el mismo motivo.

### Denunciante ≠ creador (v21)

El esquema confundía «quién lo tecleó» con «quién lo reportó»: `ck_casos_creador` exige **exactamente uno** entre `creado_por_usuario_id` y `creado_por_ciudadano_id`, así que registrar a nombre del ciudadano borraba al empleado.

Ahora son campos distintos. El empleado queda siempre como autor del registro; el denunciante es opcional y **anónimo por defecto**, con la garantía impuesta por restricción y no por convención:

```sql
check (not denunciante_es_anonimo or
       (denunciante_nombre is null and denunciante_telefono is null
        and denunciante_ciudadano_id is null))
```

«Anónimo» significa que **el dato no está**, no que una bandera pida no mirarlo. El RPC además descarta nombre y teléfono en el servidor si llega marcado anónimo, para que no dependa de que el navegador se acuerde de vaciar los campos.

`buscar_ciudadano(identificador)` localiza a un vecino ya registrado **por DUI (9 dígitos) o teléfono (8)**, nunca por nombre —dos personas comparten nombre con facilidad— y con coincidencia exacta, nunca parcial: con comodines sería un directorio consultable de la población. No devuelve el DUI. **El DUI no se almacena en `casos`**: sirve para buscar, no se copia.

### La cola offline como patrón Orden

`stores/offline-queue.js` guarda órdenes autocontenidas (tipo + datos) reproducibles más tarde. Tres cosas que conviene conocer:

- **Registro de manejadores, no `switch`.** Despacho O(1) y abierto a extensión: añadir un tipo es añadir una entrada, sin tocar el motor que reintenta y persiste.
- **Rechazo permanente vs. fallo de red.** Un rechazo del servidor (categoría inexistente, punto fuera del municipio) fallará igual las tres veces; se marca `permanente` y sale del ciclo. Gastar reintentos ahí solo retrasa a lo que sí podría pasar.
- **Los reintentos se aguardan dentro.** Antes se lanzaban con un `setTimeout` suelto y la función volvía, así que el reintento corría **fuera** del bucle de `sincronizar()` y la misma operación podía despacharse dos veces a la vez.

`agregarOperacion()` devuelve `{ ok, mensaje }`. Si `localStorage` está lleno —la cola guarda fotos en base64 y hay ~5 MB por origen— se revierte el encolado y se avisa. Lo contrario es responder «guardado» sobre algo que se acaba de perder.

---

## 9. Geografía del Municipio (v18)

Hasta la v18 los polígonos solo vivían en un `.js` del navegador, así que **el servidor no podía comprobar nada**: era imposible saber si un caso caía dentro del municipio o en qué distrito.

| Objeto | Contenido |
|---|---|
| `distritos.geometria` | `geometry(MultiPolygon, 4326)` + índice GiST. Límites oficiales de los 5 distritos |
| `colonias` | 153 colonias de San Marcos con `zona` y geometría. Da contenido al filtro por centro poblacional |
| `resolver_distrito(lat, lng)` | Devuelve distrito y si la correspondencia fue exacta |

**`resolver_distrito` trabaja en dos etapas.** `ST_Intersects` y no `ST_Contains`, porque un punto justo SOBRE el límite no está «contenido» en ningún polígono y el límite entre dos distritos es exactamente donde más se reporta —una calle divisoria—. Si no hay intersección, respaldo por cercanía dentro de 150 m: el GPS de un teléfono en una quebrada tiene 30-50 m de error, y rechazar un reporte legítimo porque la lectura derivó 20 m es peor que asignarlo al distrito contiguo. El llamador recibe `exacto = false` para poder avisarlo.

> ### ⚠ El rectángulo de cobertura rechazaba territorio real
>
> `ck_casos_bbox_sssur` limitaba los casos a lat 13.50–13.85 y lng −89.40–−89.05. Medido contra la cartografía oficial, ese rectángulo dejaba **fuera territorio de tres de los cinco distritos**: Panchimalco baja hasta 13.4732, Rosario de Mora hasta 13.4787 y Santiago Texacuangos llega a −89.0419. Un empleado en el sur de Panchimalco **no podía registrar un caso**. Corregido a lat 13.45–13.70 / lng −89.26–−89.02, que además es más estrecho por el oeste: el anterior llegaba a San Salvador capital.

### La cartografía y su carga

`services/geo-json/cargador.js` pide los `.geojson` **bajo demanda** y memoriza la promesa, no el resultado: si dos vistas se montan a la vez, ambas esperan la misma petición. Suman ~1,1 MB y solo hacen falta al abrir un mapa.

`database/herramientas/geojson-a-sql.mjs` convierte la cartografía de Catastro en SQL. Resuelve tres cosas que romperían la carga: quita la coordenada **Z** (QGIS exporta `[lng, lat, 0]` y una columna 2D lo rechaza), redondea a 6 decimales (~11 cm, muy por debajo del error del GPS) y aplica `ST_MakeValid`, porque un *dissolve* de QGIS deja auto-intersecciones con normalidad y `ST_Contains` sobre geometría inválida da resultados incorrectos **sin fallar**.

> **Dato para Catastro:** 10 colonias tienen su centroide fuera de todo distrito, en el borde norte donde San Marcos limita con la capital. O el límite está algo metido o esas urbanizaciones cruzan la línea. Decide de quién es la competencia sobre esas calles.
>
> **Y otro:** la superficie declarada a mano sumaba 198,67 km²; medida sobre los polígonos oficiales es **~217 km²**, con la diferencia concentrada en Panchimalco. Desde la v28 la superficie **se mide** con `st_area`, no se declara.

---

## 10. Analítica del Cartograma (v27 · v28)

### El filtro de fechas no filtraba

Calculaba qué fracción del año abarcaba el rango y **multiplicaba** los contadores por ella (`total × díasDelRango / 365`). Un trimestre mostraba el 25 % del acumulado como si fueran los casos de ese trimestre: número redondo, verosímil e imposible de distinguir de un dato real.

Y los KPIs partían de contadores escritos a mano en un objeto literal, sustituyéndolos por datos reales **solo si ese distrito tenía casos**. Con el municipio recién arrancado, cuatro de los cinco mostraban cifras imaginarias y en la misma fila convivían números reales e inventados sin nada que los distinguiera.

### Ahora

| Fuente | Responde |
|---|---|
| `v_kpis_distrito` (v16) | «¿Cómo está el municipio **ahora**?» — la consola del Mapa en Vivo |
| `kpis_distrito_periodo(desde, hasta)` (v27/v28) | «De lo que **entró** en este período, ¿cómo respondimos?» — el Cartograma |

Son preguntas distintas y por eso conviven. El RPC filtra por `created_at` —casos *reportados* en el rango, con su estado actual— y lo dice en la interfaz, porque «reportados» y «cerrados» en un período son cifras diferentes.

> **Trampa evitada en el RPC:** el rango va dentro de una CTE sobre `casos`, no en un `where` del `LEFT JOIN`. Con un `where` sobre el lado débil de un left join, los distritos sin casos en el período **desaparecen** del comparativo en lugar de salir con ceros.

Indicadores que devuelve además de los conteos: `fuera_de_objetivo` (superó el tiempo de su prioridad), `criticas_abiertas`, `intervenciones_activas` (abierto **con** alguien asignado — distinto de «en curso»), `dias_mas_antiguo`, `area_km2` medida sobre la geometría, `poblacion` y `categorias_top` (las 3 categorías con más casos abiertos, como `jsonb`).

### Lo que hace que sirva para decidir

- **Por cada 1 000 habitantes.** San Marcos tiene 57 094 habitantes y Rosario de Mora 12 993: cualquier ranking por volumen corona siempre a San Marcos, y eso no es un hallazgo, es demografía.
- **Tendencia contra el período anterior** de igual duración, consultado en paralelo. Solo aparece con las dos fechas puestas: sin fecha de inicio no hay un «anterior» comparable. `variacion()` devuelve `null` con base cero — pasar de 0 a 5 no es «+500 %».
- **Antigüedad del pendiente más viejo.** Un distrito con 10 casos abiertos hace seis meses está peor que uno con 40 de ayer.
- **Top de categorías.** Convierte «Panchimalco va mal» en «manda Obras y Alumbrado».
- **Exportación CSV** con BOM UTF-8 y `;` como separador (configuración regional de El Salvador). Sin ella, quien lleve la comparativa a una reunión hará una captura, y una captura no se suma ni se audita.

### `distritos_perfil` — los datos oficiales fuera del código

Población, altitud, teléfono, economía y descripción vivían en un objeto literal del componente: corregir una cifra censal exigía un desarrollador y un despliegue. Ahora es una tabla con **`fuente` y `actualizado_en`**, y la procedencia se enseña en la interfaz.

> **Las cifras están marcadas como PENDIENTES DE VERIFICAR.** Se trasladaron tal cual estaban; no consta de qué censo o proyección salieron y suman 166 671 habitantes. Los indicadores «por habitante» solo valen lo que valga ese dato. Contrastar con Catastro/DIGESTYC.

---

## 11. Migraciones de Base de Datos

Orden de ejecución (todas en `database/`). Se aplican desde el SQL Editor de Supabase.

| Archivo | Contenido | Estado |
|---|---|---|
| `schema.sql` | Esquema base | Aplicado |
| `schema_cartograma.sql` | Capas territoriales | Aplicado |
| `migration_v5_config_notificaciones.sql` | Configuración de notificaciones | Aplicado |
| `migration_v6_departamento_categorias.sql` | Puente N:M departamento↔categoría | Aplicado |
| `migration_v7_seed_organizacional.sql` | 8 direcciones + 82 departamentos (desde CSV) | Aplicado |
| `migration_v8_ciclo_vida_organizacional.sql` | Supresión/sucesión/renombrado | Aplicado |
| `migration_v9_seed_categorias.sql` | 19 categorías + 37 asignaciones N:M | Aplicado |
| `migration_v10_policies_faltantes.sql` | Policies de `cuadrillas`, `cuadrilla_integrantes`, `ciudadanos` | Aplicado |
| `migration_v11_seed_seguridad_y_catalogos.sql` | Municipio, 5 distritos, 5 prioridades, 6 canales, 4 roles, 9 módulos, 36 permisos | Aplicado |
| `migration_v12_permisos_jefe_area_empleado.sql` | 18 permisos para `jefe_area` y `empleado` | Aplicado |
| `migration_v13_roles_directivos.sql` | Roles `alcalde` y `directivo`; desactiva `operador`/`lector` | Aplicado |
| `migration_v14_rls_por_departamento.sql` | RLS de casos por departamento | Aplicado |
| `migration_v15_tramos_y_vistas_seguras.sql` | Recorridos LineString + `security_invoker` | Aplicado |
| `migration_v16_alcance_territorial.sql` | Rol `jefe_distrito`, alcance de datos por rol, excepciones por usuario, `v_kpis_distrito` | Aplicado |
| `migration_v17_login_por_username.sql` | `resolver_identificador_login()` — acceso por usuario además de correo | Aplicado |
| `migration_v18_geografia_y_alta_en_campo.sql` | Geometría de distritos, tabla `colonias`, bbox corregido, `resolver_distrito()`, `crear_caso_campo()`, autoría en `casos_select` | Aplicado |
| `seed_v18_distritos_geometria.sql` | Polígonos oficiales de los 5 distritos (**obligatorio** tras v18) | Aplicado |
| `seed_v18_colonias_san_marcos.sql` | 153 colonias de San Marcos (opcional) | Aplicado |
| `migration_v19_realtime_casos.sql` | Añade `casos` a la publicación `supabase_realtime` | Aplicado |
| `migration_v20_cierre_de_caso_en_campo.sql` | `cerrar_caso_campo()` atómico e idempotente | Aplicado |
| `migration_v21_denunciante_y_config.sql` | Datos del denunciante, `buscar_ciudadano()`, lectura de `configuracion` para autenticados | Aplicado |
| `migration_v22_gestion_roles.sql` | Policies de escritura para la matriz de roles | Aplicado |
| `migration_v23_permiso_alta_en_campo.sql` | Permiso de alta para roles de campo | Aplicado |
| `migration_v24_asignacion_automatica_caso.sql` | Asignación automática de casos | Aplicado |
| `migration_v25_prioridad_por_categoria.sql` | Prioridad por defecto según categoría | Aplicado |
| `migration_v26_catalogo_por_departamento.sql` | Catálogo filtrado por departamento | Aplicado |
| `migration_v27_kpis_por_periodo.sql` | RPC `kpis_distrito_periodo()` | Aplicado |
| `migration_v28_perfil_distrito_y_analitica.sql` | `distritos_perfil`, superficie medida, antigüedad y top de categorías | Aplicado |
| `migration_v29_estado_inicial_del_flujo.sql` | Quita el `default` de `casos.estado_codigo`, endurece el trigger y garantiza que toda categoría tenga flujo | Aplicado |
| `migration_v30_gestion_de_caso.sql` | `asignar_caso()` y `cambiar_estado_caso()` + ayudantes de flujo y autorización | Aplicado |
| `diagnostico_post_migraciones.sql` | 7 bloques de verificación **solo lectura** | Herramienta |
| `herramientas/geojson-a-sql.mjs` | Convierte cartografía de Catastro en SQL (§9) | Herramienta |

> **`schema_cartograma.sql` NO se aplicó y no debe aplicarse.** Su tabla `zonas_poblacion` duplica `distritos` y `colonias` (v18), usa `text` para `distrito_padre` donde debería ir una FK, y su policy `sin_escritura_cliente` solo cubre `insert`: deja `update` y `delete` abiertos. Lo único aprovechable de su diseño —las columnas `fuente` y `actualizado_en`— se recuperó en `distritos_perfil`.

> **Cambiar el tipo de retorno de una función exige `drop`, no `create or replace`.** La v28 hace `drop function` de `kpis_distrito_periodo` antes de recrearla. Y ojo con las **sobrecargas**: añadir parámetros —aunque lleven valor por defecto— crea una función nueva en vez de sustituir la anterior, y con dos versiones vivas PostgREST elige de forma impredecible. Le pasó a `crear_caso_campo` entre la v18 y la v21.

`diagnostico_post_migraciones.sql` es seguro de correr cuando quieras: el bloque 1 lista tablas con RLS activo y **cero policies** (la combinación que bloquea silenciosamente una tabla entera).

> **Aviso "Potential issue detected" de Supabase:** el linter del SQL Editor marca cualquier script que cree una tabla sin RLS —incluidas las **temporales**—. Por eso v9 usa una CTE (`with flujo_default as (...)`) en lugar de una tabla temporal. Si el aviso reaparece, elegir *"Run and enable RLS"* es seguro: se verificó con el diagnóstico que no daña el esquema.

---

## 12. Bottom Tab Bar

El componente `shared/bottom-tab-bar` es único y se diferencia mediante la prop `tipo`:

```html
<bottom-tab-bar tipo="poblacion"></bottom-tab-bar>
<bottom-tab-bar tipo="empleado"></bottom-tab-bar>
```

- **Diseño pill flotante** (`rounded-2xl`, `backdrop-blur-xl`, sombra suave)
- **5 botones**, con el central elevado (`-mt-6`) para la acción principal (Crear/Levantar)
- **Menú "Más"** es un popup flotante absoluto (`bottom-[calc(100%+8px)]`), no expande el contenedor
- **Indicador activo:** punto sobre el ícono + cambio de color (azul población, verde empleados)

---

## 13. UI y Estilos

- **TailwindCSS CDN** + config extendida en `index.html` (`tailwind.config = { darkMode: 'class' }`)
- **Modo Oscuro:** clase `.dark` en `<html>` con Anti-FOUC script en `index.html`
- **Fuentes:** Inter (UI) + JetBrains Mono (datos numéricos/técnicos) vía Google Fonts
- **CSS complementario:** `assets/css/mapa.css` y `assets/css/components.css`
- **Z-Index del Sidebar:** `z-[9999]` para tooltips del modo colapsado sobre capas de Leaflet

### Regla de contención en móvil (PWA)

En las vistas de campo, todo contenedor de texto variable necesita `min-w-0` + `break-words` (o `truncate`), y los íconos `shrink-0`. Sin `min-w-0` un token largo sin espacios —un correo institucional, el nombre de una zona— **desborda horizontalmente toda la página** y eso, a su vez, **corta la barra de navegación inferior** fija. La raíz de `vista-pwa-empleado.html` lleva `overflow-x-hidden` y padding inferior `calc(env(safe-area-inset-bottom) + 7.5rem)`.

---

## 14. Trampas Conocidas (leer antes de tocar mapas o plantillas)

### 14.1 Objetos de Leaflet dentro de refs de Vue → `TypeError: ... '_latLngToNewLayerPoint'`

Vue envuelve todo lo que entra en un `ref()`/`reactive()` en un `Proxy`. Leaflet, internamente, hace `map.off(type, fn, context)` comparando el `context` **por identidad**. El proxy no es idéntico al objeto original, así que el `off` no encuentra el listener, este queda huérfano y se dispara sobre un mapa ya destruido:

```
Uncaught TypeError: Cannot read properties of null (reading '_latLngToNewLayerPoint')
```

**Regla:** los objetos de Leaflet (`L.Map`, `L.Marker`, `L.Layer`, `L.Polyline`) **nunca** deben vivir dentro de un `ref`/`reactive`. Usar `let` plano o `markRaw()`.

```js
// ⚠ Los objetos de Leaflet NUNCA deben vivir dentro de un ref/reactive.
let marcadorUbicacion = null;
function quitarMarcadorUbicacion() {
  if (!marcadorUbicacion) return;
  if (lmap) lmap.removeLayer(marcadorUbicacion);
  marcadorUbicacion = null;
}
```

Corregido en `admin/vista-mapa.js`, `admin/vista-cartograma.js` y `empleados/vista-detalle-intervencion.js`. **Sigue pendiente** en 4 archivos que hacen `mapa.value = L.map(...)`: `empleados/vista-levantar-denuncia.js`, `empleados/vista-mapa-vivo.js`, `poblacion/vista-crear-denuncia.js`, `poblacion/vista-mapa-distrito.js`.

El mismo criterio aplica al gestor de capas y al `ResizeObserver`: viven en `let` planos dentro del `setup()`, nunca en refs.

### 14.2 Plantilla y componente desincronizados → pantalla en blanco

`vista-levantar-denuncia.html` llamaba a `getColorClass()` (heredado de su gemelo de población) sin que el componente la expusiera → `TypeError: getColorClass is not a function` y pantalla en blanco desde el botón "+" del tab bar y desde "Reportar" del mapa.

Además, esa función mapea **nombres** de color (`yellow`, `blue`…) y los datos reales traen **hex** (`color_hex`). Exponerla sin más habría pintado las 19 categorías en gris. Se resolvió con estilo inline:

```html
:style="{ backgroundColor: categoria.color || '#6b7280' }"
```

La vista de población sí conserva `getColorClass` porque usa el catálogo estático de `utils/categorias-denuncias.js`, que sí trae nombres de color.

### 14.3 Campos de demo que ya no existen en el esquema

`cargarCategorias()` agrupaba por `t.area`, campo presente en `utils/demo-data.js` pero **inexistente** en `categorias_caso` (el área se resuelve vía `departamento_responsable_id`). Con datos reales todas las categorías caían en una sola pestaña "General". Ahora usa `areaDeTipo(t.id)` de `catalogos.js`.

> Patrón general: al migrar de demo a BD, revisar campo por campo. Los campos que ya no existen **no lanzan error**, devuelven `undefined` y degradan la UI en silencio.

### 14.4 Expresiones regulares escapadas de más

`split(/\\s+/)` busca un **backslash literal**, no espacios. Como resultado devolvía el correo completo, que a `text-2xl` bold desbordaba la página (ver §13). Correcto: `split(/\s+/)`.

### 14.5 `.single()` convierte «ninguna fila» en un error HTTP 406

`.single()` exige **exactamente** una fila. Cero filas devuelve **406 Not Acceptable**, que en consola parece una avería y no lo es.

Ocurría al leer `configuracion`: su policy solo dejaba leer a admin y superadmin, así que cualquier empleado se encontraba un 406 en rojo en cada arranque. Y tenía una consecuencia peor que el ruido: `configuracion.valor` contiene `accesoContextos`, el interruptor para apagar un módulo. Al no poder leerlo, la app caía a los valores por defecto —todo encendido— y **el interruptor no surtía efecto justo sobre quienes debía apagar**.

> **Regla:** usa `.maybeSingle()` siempre que «ninguna fila» sea un estado legítimo. Una instalación nueva tampoco tiene todavía la fila `global`.

### 14.6 Tres vocabularios de estado incompatibles

Convivían tres conjuntos de códigos de estado y **solo uno existía de verdad**:

| Fuente | Códigos |
|---|---|
| Flujo real (`categorias_caso.estados_flujo`, sembrado en v9) | `pendiente, en_revision, en_obra, resuelta, rechazada` |
| Tablas escritas a mano en `intervenciones.js` y las vistas de empleado | `recibida, asignada, en_atencion, cerrada, anulada` |
| Presentación | `pendiente, en_proceso, completada` |

Los del segundo grupo **no existen**, así que ninguna traducción casaba y todo caía al valor por defecto: el estado que veía el empleado era siempre el mismo. Y `en_obra` no se contaba ni como activo ni como resuelto — un caso se esfumaba de los indicadores justo mientras la cuadrilla trabajaba en él.

> **Regla:** el ciclo de vida sale de `categorias_caso.estados_flujo`, que es **por categoría**. `catalogos.js` expone `esEstadoFinal()`, `situacionDeEstado()` y `estadoDeCierre()`. No vuelvas a escribir una tabla de estados a mano.

Lo mismo con las prioridades: `mapPrioridad` hacía `if (id <= 1) 'alta'` sobre un catálogo donde el 1 es **Crítica** y el 2 es **Alta**. Toda prioridad alta se mostraba como media.

### 14.7 Realtime: suscribir antes de que exista la sesión

`suscribirRealtime()` se llamaba desde dos sitios sin guarda, así que en el flujo de login se creaban **dos canales con el mismo topic** y cada cambio en la base disparaba dos recargas.

Además se llamaba antes de que el SDK hubiera aplicado el JWT, porque `autenticado` se pinta de forma optimista desde el almacén local. El socket arrancaba con la clave anónima —visible en el aviso `WebSocket is closed before the connection is established`— y milisegundos después el SDK lo derribaba para reconectar. Durante esa ventana el canal escuchaba como anónimo y **la RLS filtraba todo**.

> **Regla:** `await db.auth.getSession()` antes de suscribir, guarda contra doble suscripción, y cierre del canal en la rama de sesión perdida de `onAuthStateChange` —no solo en el botón de salir, que no cubre la caducidad del token—.

Y recuerda que **una tabla no emite si no está en la publicación** `supabase_realtime`. El canal responde `SUBSCRIBED` sin quejarse aunque no llegue nunca un evento.

### 14.8 La carpeta está sincronizada por MEGA y el `.git` no

El proyecto vive bajo `Documents\MEGA\…`. MEGA sincroniza los **archivos** entre máquinas, pero el `.git` puede quedarse atrás. El síntoma es desconcertante: `git status` dice que estás varios commits por detrás y muestra decenas de archivos «modificados» que en realidad **ya son idénticos al remoto**.

En el último despliegue, de 61 archivos que parecían chocar: 47 diferían **solo en el fin de línea** (`core.autocrlf=true`, sin `.gitattributes`) y 8 eran byte a byte iguales. Los conflictos reales eran 9, todos en dos archivos.

> **Cómo distinguirlo antes de resolver nada:**
> ```bash
> git diff --quiet --ignore-cr-at-eol origin/main -- ARCHIVO   # ¿solo CRLF?
> tr -d '\r' < ARCHIVO | md5sum                                 # vs. git show origin/main:ARCHIVO
> ```
> Y ten presente que `git diff` **ignora los archivos no rastreados**: un archivo que llegó por MEGA y que git aún no conoce aparece como «todo borrado» al compararlo con el remoto. No lo está.


### 14.9 Un DEFAULT de columna se aplica ANTES de los triggers BEFORE INSERT

`casos.estado_codigo` tenía `default 'recibida'`, un estado que **no existe** en el flujo
que siembra la v9. Existía un trigger cuyo cometido era rellenarlo desde
`categorias_caso.estado_inicial`:

```sql
if new.estado_codigo is null or new.estado_codigo = '' then
    new.estado_codigo = coalesce(v_estado_inicial, 'recibida');
end if;
```

**Nunca se ejecutaba.** Cuando el trigger ve la fila, el default ya la rellenó y la
condición es falsa. El respaldo estaba escrito y era inalcanzable.

Consecuencia: todo caso levantado en campo nacía fuera de su propio flujo. No lo contaban
`pendientes` ni `en_curso`, sí `fuera_de_objetivo`, y el filtro por estado no lo alcanzaba
nunca. De ahí el «0 activas / 1 fuera de plazo» del Cartograma.

Lo corrige la **v29** quitando el default. Las restricciones `NOT NULL`, en cambio, se
comprueban **después** de los triggers, así que la columna sigue siendo obligatoria.

### 14.10 `FormData.append` con una cadena NO envía un archivo

```js
const dataUrl = await comprimirImagen(archivo);   // devuelve una CADENA
cuerpo.append('foto', dataUrl, 'perfil.jpg');     // ← el nombre se IGNORA
```

`FormData.append(campo, valor, nombre)` descarta el tercer argumento cuando `valor` es
una cadena: viaja como campo de texto y en el servidor `$_FILES` llega **vacío**. El
navegador no protesta.

Por eso `utils/image-compressor.js` tiene tres salidas explícitas y documentadas:
`comprimirImagen` (DataURL, para vista previa), `comprimirImagenABlob` (para subir) y
`comprimirImagenDual` (ambas, dibujando el canvas una sola vez).

### 14.11 Probar solo los caminos de rechazo no prueba nada

Un fallo en `subir_evidencia.php` —una variable perdida al extraer un bloque a la
biblioteca compartida— **solo se manifestaba con un token válido**: con uno falso el
endpoint responde 401 antes de llegar ahí. Todos los sondeos daban verde.

Lo cazó el `error_log` del servidor, y la prueba que lo habría evitado es montar el sitio
completo en local —misma estructura de carpetas, misma configuración, un PHP con las
mismas extensiones—, firmar un token real con una clave EC generada al vuelo y subir una
imagen real.

**Regla:** si una función tiene un camino de éxito, hay que ejercitarlo. Comprobar la
sintaxis y los rechazos da una falsa sensación de cobertura.

---

## 15. Estado del Trabajo (handoff)


### 15.1 Estado del repositorio

> **Este archivo SÍ viaja por git** desde agosto de 2026. Antes estaba en `.gitignore` y llegaba solo por la sincronización de MEGA, así que quien clonara desde GitHub no lo encontraba. Siguen ignorados `ANALISIS_PROFUNDO_*.md` de la raíz, `ESTADO_ACTUAL.md` y `estructura_proyecto.md`, que son notas de trabajo. El `.htaccess` de la raíz deniega los `.md`, así que está versionado sin quedar publicado en el sitio.

**Todo está subido.** `main` y `origin/main` en la versión 1.1.7 (12-ago-2026), «PWA de campo: tema oscuro, preferencias locales y perfil propio». Nada quedó sin commitear.

**El portal de Población sigue siendo una maqueta.** Sus ocho vistas no hacen una sola llamada a Supabase: todo vive en ocho claves de `localStorage`, y el «registro» no crea cuenta en Supabase Auth —solo escribe un objeto local—, así que `ciudadano_autenticado` es un booleano que cualquiera puede poner a `true` desde la consola del navegador. Una denuncia ciudadana no llega al Centro de Monitoreo. El plan para conectarlo está en `docs/plan-portal-poblacion.md`.

Existe una rama de respaldo `respaldo-antes-de-subir-00ae638` apuntando al estado previo al despliegue. Bórrala cuando tengas confianza en producción:

```bash
git branch -d respaldo-antes-de-subir-00ae638
```

Trabajar desde dos máquinas con la carpeta en MEGA tiene una trampa propia y molesta: lee §14.8 **antes** de resolver ningún conflicto.

### 15.2 Cómo levantar el entorno en la otra máquina

1. `git clone` (o abrir la carpeta sincronizada por MEGA).
2. No hay `npm install` — es buildless.
3. Servir estático: `python -m http.server 8080` en la raíz, o Live Server. **No abrir con `file://`.**
4. Las credenciales de Supabase están en `assets/js/core/supabase-config.js`, que **sí está versionado**. No hay `.env` que replicar.
5. Acceso admin: `soporte.ti@sansalvadorsur.gob.sv` (rol `superadmin`, `rol_id = 1`).

Para probar los dos módulos a la vez en el mismo navegador —ahora sí se puede, ver §2.1—:

```
http://127.0.0.1:5500/index.html                      → Centro de Monitoreo
http://127.0.0.1:5500/index.html?contexto=empleados   → PWA de campo
```

En la consola de cada pestaña debe salir `[supabase] Contexto "…" · sesión en "sb-sssur-…"` con valores distintos. Usa **usuarios diferentes** en cada una.

### 15.3 Estado tras los bloques 0-5 (agosto 2026)

Los ocho requisitos que planteó la Alcaldía están cumplidos. El circuito completo
—levantar con foto en territorio → aparecer en el mapa → asignar cuadrilla → cambiar
estado → cerrar con constancia— está operativo en producción.

| Bloque | Aportó | Migración |
|---|---|---|
| 0 | Estado inicial desde el flujo de la categoría | **v29** |
| 1 | Cuadrillas y su composición (`vista-cuadrillas`) | — |
| 2 | Asignación y cambio de estado (`gestion-casos`) | **v30** |
| 3 | Catálogo por jefatura (`vista-catalogo`) | — |
| 4 | Fotografías a cPanel + Realtime incremental | — |
| 5 | Documentación y runbook de despliegue | — |

### 15.4 Pendientes

| # | Pendiente | Detalle |
|---|---|---|
| 1 | **Tope de 200 casos** | `cargarDenuncias()` sigue limitado. `hayMasCasos` ya lo expone pero **ninguna vista lo muestra**: los KPIs se quedarían cortos sin avisar. Falta paginación por cursor o filtro por período |
| 2 | **`vista-mi-perfil-empleado.js` sigue simulado** | Guardado, solicitud de cambios y baja son `setTimeout`. Última pieza de demo. Requiere decidir qué puede editarse un empleado a sí mismo |
| 3 | **Verificar la población de `distritos_perfil`** | Suman 166 671 habitantes y no consta el censo de origen. **Los indicadores «por habitante» del Cartograma solo valen lo que valga este dato.** Se corrige con un `update`, sin despliegue |
| 4 | **Asignar `departamento_id` y `distrito_id`** a jefaturas y empleados | Con la RLS activa, un usuario de rol acotado y departamento `NULL` **ve cero casos**. Es el primer soporte que van a reportar |
| 5 | **Dar de alta las cuadrillas reales** | La pantalla está lista y vacía. Sin equipos registrados, «asignar cuadrilla» no tiene a qué apuntar |
| 6 | **Validar el mapeo departamento↔categoría de v9** | Es una propuesta, no dato oficial. Revisar con cada dirección |
| 7 | **10 colonias fuera de todo distrito** | Borde norte de San Marcos. Decidir competencia (§9) |
| 8 | **Fotos huérfanas en cPanel** | Se suben antes de que exista el caso; un formulario abandonado deja el archivo sin fila en `casos_adjuntos`. Sin limpieza automática |
| 9 | **UI de captura de tramos** en `?contexto=empleados` | Dibujo de vértices, ruteo OSRM multi-waypoint y persistencia offline. El pendiente funcional más grande |
| 10 | `markRaw` en los 4 archivos de §14.1 | Mismo bug latente que ya explotó en el mapa admin |
| 11 | Bug de lat/lng en el modal de polígonos | `coordenadas` guarda objetos `L.LatLng` pero la plantilla lee `coordenadas[0][0]` como si fueran arrays |
| 12 | **Tres esquemas divergentes** en `database/` | No hay una única fuente de verdad del esquema. Consolidar |
| 13 | Vendorizar las dependencias CDN | 13 `<script>` externos. Un CDN caído deja el sistema inoperativo |
| 14 | **Plan Pro de Supabase** | Con el plan gratuito el proyecto se pausa tras 7 días sin tráfico y no hay respaldos automáticos |

### 15.5 Puntos abiertos del mapeo de categorías (pendiente #6)

- `RIE-INCENDIO` → Gestión de Riesgos. **Los incendios son jurisdicción nacional de Bomberos**, no municipal.
- `ADM-TRAMITE` → Gestión Documental. Probablemente corresponde a Atención al Contribuyente o Registro del Estado Familiar.
- Gestión de Riesgos concentra **3 de 19** categorías. Revisar si es real o un sesgo del mapeo.

### 15.6 Alcance de la verificación hecha

**No hay automatización de navegador en este entorno.** Todo se verificó de forma **estática**: `node --check` sobre copias `.mjs` de los 110 módulos ES, balanceo de etiquetas HTML y de comentarios, cruce plantilla↔componente de cada binding, balance de paréntesis y dólar-comillas en SQL, y coherencia entre las columnas que declara un RPC y las que devuelve su `select`.

**Nada se probó en un navegador real, y ningún SQL se ejecutó contra la instancia.** Al retomar, prueba manualmente al menos:

1. Las dos pestañas de §15.2 con usuarios distintos — que ninguna sesión tumbe a la otra.
2. Alta de un caso desde la PWA de campo, y que aparezca en el Mapa en Vivo **sin recargar**.
3. Cierre de esa intervención, y que quede la fila en `historial_estados_caso`.
4. Cartograma: cambiar el período y comprobar que los KPIs cambian de verdad, no proporcionalmente.
5. Plegar cada panel del Mapa en Vivo por separado — el mapa no debe moverse.

Verificación clave que quedó sin correr: **sin período, `kpis_distrito_periodo()` debe coincidir exactamente con `v_kpis_distrito`.** Está como consulta 3 comentada al final de la v27. Si devuelve alguna fila, hay un error en uno de los dos.

---

## 16. Restricciones del Plan FREE de Supabase

De `docs/arquitectura/CONTEXTO_CRITICO.md`:

- **Sin `OFFSET`** — paginación exclusivamente por cursor
- **Sin Base64 en Postgres** — las imágenes van a Storage
- Imágenes: **1024×1024, JPEG calidad 0.6, ≤500 KB** (ver `utils/image-compressor.js`)
- Purga de fotos a cPanel entre los **7 y 15 días**
- Purga de bitácora a los **6 meses**
- **El proyecto se pausa tras 7 días sin actividad** — si al volver de vacaciones nada responde, revisa esto primero
- 500 MB de BD, 1 GB de Storage

---

## 17. Infraestructura y Despliegue

> **Procedimiento completo: [`docs/despliegue-produccion.md`](docs/despliegue-produccion.md).**
> Esta sección es el resumen; ahí está el runbook, el diagnóstico de fallos y las
> comprobaciones posteriores a cada despliegue.

- **Hosting:** cPanel compartido en `monitoreo.sansalvadorsur.gob.sv`. **Solo estático más endpoints PHP puntuales.** No correr Flask, Node ni procesos propios.
- **API:** Supabase (PostgREST + Auth + Storage + Realtime + Edge Functions).
- **Geo:** PostGIS nativo en Supabase, sin BD geo separada.
- **Imágenes:** **cPanel, no Supabase Storage.** Mientras el plan sea FREE, el 1 GB de Storage no aguanta la operación de campo. Las fotos van a `uploads-monitoreo/evidencias/AAAA/MM/` vía `api-monitoreo/subir_evidencia.php`.
- **Tiempo real:** Supabase Realtime, con parcheo incremental por id. NO SSE en cPanel.

### 17.1 La raíz del subdominio ES el clon de git

`/home/sansalva/public_html/monitoreo.sansalvadorsur.gob.sv/` es un repositorio
gestionado por Git Version Control de cPanel. Tres consecuencias:

1. **No se editan archivos en el servidor.** Ensucian la copia de trabajo y el siguiente
   «Update from Remote» aborta.
2. **Se despliega con push + dos botones**: *Update from Remote* trae el commit,
   *Deploy HEAD Commit* ejecuta `.cpanel.yml`, que copia los endpoints de `cpanel/` a
   `api-monitoreo/`.
3. **Todo el repositorio se serviría por HTTP.** `/database/schema.sql` y `/docs/` eran
   públicos hasta que se añadió el `.htaccess` de la raíz.

`api-monitoreo/config-monitoreo.php` **no está en el repositorio** —está en
`.gitignore`— y es el único archivo que se mantiene a mano. Si viajara con el código,
cada despliegue lo sobrescribiría.

### 17.2 El entorno real, y en qué se aparta de lo previsto

Todo esto se descubrió desplegando, y ninguna suposición previa acertó:

| Se suponía | Es |
|---|---|
| PHP 8.x | **PHP 7.4.33.** `match` y los tipos unión son error de análisis: 500 en blanco |
| `fileinfo` y `exif` disponibles | **No venían.** El código funciona sin ellas; `exif` se activó después porque sin ella las fotos verticales se guardan giradas |
| `Authorization` llega a PHP | **Apache la descarta** con PHP en CGI/FastCGI |
| Supabase firma con HS256 | **ES256.** El proyecto migró a JWT Signing Keys |

### 17.3 Verificación de tokens: ES256 contra el JWKS

`cpanel/jwt-monitoreo.php` valida la firma asimétrica contra
`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, con caché en disco de 6 horas y refresco
forzado —máximo uno por minuto— ante un `kid` desconocido. Sin ese freno, un token con
`kid` inventado provocaría una descarga por petición.

**Mejora la seguridad respecto a HS256:** el servidor guarda solo la clave pública. Puede
comprobar tokens y no puede fabricarlos. Con el secreto simétrico, quien accediera al
archivo de configuración podía firmar un token de superadministrador.

El token viaja en **`X-Monitoreo-Token`** además de en `Authorization`, porque Apache
descarta la segunda. El servidor acepta la primera que llegue.

---

## 18. Patrones de Diseño y Complejidad

| Patrón | Implementación |
|---|---|
| Store | `assets/js/stores/` — estado global reactivo sin Vuex/Pinia |
| Componente | Vue con Composition API, lógica y plantilla separadas (§1) |
| Servicio | `assets/js/services/` — mapas, marcadores, gráficas, alta en campo |
| Observador | Reactividad de Vue (`watch`, `computed`) + Supabase Realtime + `ResizeObserver` (§4) |
| Borrado lógico + sucesión | Ciclo de vida organizacional (§5) |
| **Singleton de módulo** | `core/app-contexto.js` — el contexto se resuelve una vez y es inmutable (§2.1) |
| **Adaptador** | `core/almacen.js` — fachada sobre `localStorage`. Nadie más lo toca, así que migrar a IndexedDB sería sustituir un archivo |
| **Orden (Command)** | `stores/offline-queue.js` — órdenes autocontenidas, persistidas y reproducibles (§8) |
| **Registro / Estrategia** | `MANEJADORES` de la cola y `CAPAS` de `capas-territoriales.js` — añadir un tipo es añadir una entrada, no tocar el motor |
| **Fachada** | Los RPC `crear_caso_campo` y `cerrar_caso_campo` — una llamada atómica sobre cuatro escrituras (§8) |
| **Catálogo declarativo** | `config/mapa/*.js` — lo que existe se declara como dato; la vista solo ejecuta el efecto |

**Consideraciones de Big O — dónde importa de verdad aquí:**

- **Agregar en la base, no en el cliente.** Los KPIs por distrito salen de `v_kpis_distrito` y de `kpis_distrito_periodo`. Contarlos sobre el array de casos sería O(n) en el navegador *y además mentiría*, porque ese array está limitado a 200 filas.
- **Devolver arrays y no booleanos por fila** en las funciones de alcance (§6). Es la diferencia entre un InitPlan evaluado una vez y una subconsulta correlacionada por fila.
- **Índice `Map` por clave** para las búsquedas repetidas en cada repintado: `datosPorNombre`, `porDistrito`, `kpiPorNombre`. O(1) frente a un `Array.find()` O(n) dentro de un bucle de render.
- **Índices funcionales** sobre el valor normalizado en `buscar_ciudadano` (§8): sin ellos, comparar `regexp_replace(dui,…)` recorre la tabla entera en cada búsqueda.
- **`L.canvas()`** para las 153 colonias: con SVG es un nodo del DOM por polígono y el desplazamiento va a tirones.
- **Copiar antes de `sort()`** dentro de un `computed`: `sort` muta, y mutar la fuente dispara su propia dependencia — bucle de recálculo.
- **Un trabajo por fotograma** con `requestAnimationFrame` en el `ResizeObserver` del mapa: puede disparar muchas veces seguidas e `invalidateSize` recoloca todas las teselas.
- Paginación por cursor obligatoria (sin `OFFSET`, §16). Virtual scrolling para listas de más de 200 elementos.

---

## 19. Grafo del Proyecto (graphify)

El proyecto se indexa con `graphify`. Salida en `graphify-out/` — **ignorado por git**, hay que regenerarlo en cada máquina. La última corrida en esta es del 10-ago-2026; tras el hito de agosto conviene **re-indexar**, porque entraron carpetas nuevas (`core/app-contexto`, `core/almacen`, `services/mapa/`, `config/mapa/`, `shared/ui/`, `admin/mapa/`) y seis stores.

```bash
graphify .          # indexar
graphify update .   # re-indexar tras cambios de arquitectura
graphify query …    # consultar dependencias
graphify god-nodes  # detectar nodos con acoplamiento excesivo
```

Consultar el grafo **antes** de refactorizaciones grandes o de crear módulos nuevos.
