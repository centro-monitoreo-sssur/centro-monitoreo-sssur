# Plan de rediseño TailAdmin · estado y ruta

**Última actualización:** 19 de agosto de 2026
**Rama de trabajo:** `migracion-tailadmin` (8 commits sobre `main`, árbol limpio)
**Producción:** `main` — se publica con `git pull` desde cPanel. **Nada de este plan está en producción todavía.**

Este documento es la fuente de verdad del rediseño. Sustituye al plan de fases
original en lo que difieran: el plan cambió dos veces por decisión de Richard
(2026-08-19) y aquí está lo que de verdad se hizo y lo que de verdad falta.

---

## 1 · Qué se buscaba, y los dos giros del camino

**Objetivo original:** replicar el kit UI/UX de TailAdmin en todo el panel del
Centro de Monitoreo, con estructura modular que no se degrade, y verificación
que no dependa de revisar capturas a mano.

**Giro 1 — «Congelar y pagar en marcha» (revertido el mismo día).** Tras las
fases 1–3 lo visual ya era TailAdmin y se acordó pagar la deuda interna vista
a vista. Duró horas: al probar con teléfono y datos reales, las tablas con
scroll horizontal resultaron ingestionables.

**Giro 2 — Reconstrucción móvil real (vigente).** Tres decisiones de producto
que ahora son estructurales:

1. **En móvil los registros son tarjetas, no tablas.** La tabla clásica queda
   solo para escritorio (`lg:` en adelante). Es una desviación deliberada del
   TailAdmin literal, que solo ofrece scroll horizontal.
2. **Los KPIs arrancan plegados en móvil** (barra «Indicadores» desplegable).
   Quien entra a una vista de gestión viene a trabajar registros, no a leer
   métricas. Dashboard y Reportes quedan exentos: ahí los KPIs son el contenido.
3. **No existe la «Galería de componentes».** Se construyó y se eliminó por
   decisión expresa; la referencia visual de las primitivas son las propias
   vistas.

**Fuera del alcance, siempre:** Mapa en Vivo, Cartograma (lienzos Leaflet con
anatomía propia) y las tres PWA (ciudadano, empleados) — no se tocan.

---

## 2 · Hecho y verificado (los 8 commits de la rama)

### 2.1 · La maquinaria de verificación

| Herramienta | Comando | Qué garantiza |
|---|---|---|
| Banco visual | `npm run banco -- --etiqueta=X` | 60 capturas (15 vistas × 3 anchos, oscuro en escritorio) + 11 sondas: errores de consola, `{{}}` sin resolver, plantilla rota, desborde horizontal, táctil <40 px, botones sin nombre, capa que tapa, menú alcanzable, contenido inalcanzable sin scroll, paleta KPI obedece tokens, precache vs disco. Reloj congelado dentro de la página para que dos pasadas sean comparables. |
| Diff de capturas | `npm run banco:comparar A B` | Píxel a píxel con porcentaje y rectángulo del cambio. El mapa en vivo siempre difiere (teselas): ignorarlo. |
| Diff de hoja | `npm run css:comparar a.css b.css` | Conjuntos de selectores; en cambios de tokens, PERDIDOS debe ser 0. `git diff` no sirve: la hoja va minificada en una línea. |
| Linter de conformidad | `npm run conformidad` | Dos reglas **bloquean siempre**: clase usada y no emitida (el cazador de `ring-3`), registro roto. Nueve reglas de deuda con presupuesto **congelado en `conformidad-base.json`: solo puede bajar**. Silencios exigen `motivo:`. Integrado en `npm run build`. |

El banco entra en modo demostración (aborta el vendor de Supabase → credenciales
demo), así que **fotografía las vistas vacías**: valida estructura y regresiones,
no datos. Las pruebas con registros reales son siempre de Richard.

### 2.2 · Fases cerradas

- **Fase 0-1 · Tokens reales.** `focus:ring-3` llevaba meses con 68 usos y cero
  reglas emitidas (utilidad de Tailwind v4 en un proyecto v3): anillo de foco
  restaurado definiendo el token. Ídem `duration-250` (18 usos muertos, cazados
  por el linter). Escalas `shadow-theme-*` y `text-theme-*` copiadas de la
  fuente de TailAdmin, no deducidas. `zIndex` con nombres definido
  (cabecera/cajon/mapa/modal/galeria/aviso) — **los usos aún no migran** (§4).
- **Fase 2 · Trece primitivas nuevas** en `assets/js/components/shared/ui/`:
  contenedor-pagina (con variante `hibrido`), cabecera-pagina, franja-kpi
  (plegable), tarjeta-kpi (colorea SOLO con tokens `kpi-*` de `tokens.css` —
  la paleta la configura el administrador en ejecución), estado-vacio,
  estado-carga, campo-busqueda (debounce interno), barra-filtros, textarea,
  interruptor, casilla, control-segmentado, lista. Dialecto de la casa: props
  en español, mapas de clases literales, `computed`.
- **Fase 3 · Una sola fuente de relleno.** El canal vive en `<main>`
  (`p-4 md:p-6`, ancho `max-w-screen-2xl`); murieron los tres rellenos en
  competencia y el parche `sm:px-0`. `ui-cabecera-pagina` en todas las vistas
  (seis no tenían `<h1>`). `ui-card` con el patrón de sección de TailAdmin.
- **Fase 4 · El linter** (descrito arriba). Ya se defendió dos veces: encontró
  `duration-250` en su primera pasada y bloqueó una tarjeta a mano nueva
  durante el P0.
- **Rediseño móvil (las antiguas olas 5A/B/C, compresas y reorientadas).**
  `ui-tabla` ganó el slot `#tarjeta`; reconstruidas: usuarios, población,
  departamentos, cuadrillas, denuncias, bitácora, catálogo, comunicados,
  configuración y **roles** — cuyos permisos ahora se editan desde el teléfono
  (tarjeta por módulo con botones de 44 px; la matriz sigue en escritorio).
  Números del banco: controles táctiles <40 px **270 → 83**, contenido
  inalcanzable **2 vistas → 0**, desbordes 0.
- **P0 (aprobado tras la revisión senior).**
  - *Dashboard:* RPC `resumen_dashboard(p_dias)` — agregados en la base, RLS
    aplica (cada jefatura ve su ámbito), cortes de día en hora salvadoreña,
    KPI **Vencidas** (misma regla que `v_kpis_distrito`) y panel de atención
    por horas de exceso de SLA. De paso: los KPI de stock contaban estados
    inexistentes (`'recibida'`, `'en_atencion'`, `'cerrada'`) — por eso
    producción mostraba «Pendientes: 0» con casos abiertos. Corregido.
  - *Bitácora:* el falso campo de fechas `readonly` es ahora un rango real que
    corta en el servidor + paginación por cursor (OFFSET prohibido).
  - *Denuncias:* enlace profundo `#/denuncias/:id` (compartible, F5 lo
    mantiene, Atrás cierra el modal y no la app) y búsqueda contra la base
    entera cuando hay filtros con más casos que los cargados.

### 2.3 · Hallazgos corregidos por el camino

Columna «Fecha Registro» de Población muerta desde el origen (clave equivocada);
títulos de topbar ausentes en catálogo/cuadrillas; `verDetalle` del dashboard
que era un `console.log`; comunicados con 163 px inalcanzables en móvil.

---

## 3 · En curso — lo único que bloquea hoy

| # | Acción | Responsable |
|---|---|---|
| 1 | **Ejecutar `database/migration_v42_resumen_dashboard_y_busqueda.sql`** en el SQL Editor de Supabase. La consola de hoy (2026-08-19) muestra el 404 esperado de `resumen_dashboard`; el panel degrada al camino antiguo y lo avisa. Verificación: el NOTICE final imprime cifras reales; si el 404 persistiera una recarga, `notify pgrst, 'reload schema';` | Richard |
| 2 | **Validar con datos reales** (el banco no puede): ① tarjeta Vencidas con número y panel «X h fuera de objetivo»; ② rango de fechas de Bitácora corta de verdad; ③ abrir un caso, copiar la URL, pegarla en otra pestaña, y Atrás en el móvil cierra el modal; ④ búsqueda con >200 casos muestra el banner azul «coincidencias en toda la base»; ⑤ las listas móviles (usuarios, denuncias, roles→permisos) con registros. | Richard |
| 3 | **Merge a `main` + despliegue** cuando ② pase: `git merge --no-ff migracion-tailadmin`, `git pull` en cPanel, y subir versión de `sw.js` si se quiere forzar actualización de las PWA. Reversión completa: `git revert -m 1`. | Richard |

---

## 4 · Pendiente por prioridad

### P1 — calidad que se siente a diario (aprobado en propuesta, sin empezar)
- **Modales a mano → `ui-modal`** (15 modales; Escape, foco atrapado, `z-modal`
  en vez del empate a `z-[9999]` con el toast). Aquí se migra también el
  `zIndex` nombrado de la Fase 1.
- **KPI clicable = filtro aplicado** (tocar «Pendientes: 3» filtra la lista).
- **Tarjetas de `ui-tabla` a 2 columnas en tableta** (hoy 1 columna desperdicia
  media pantalla entre 640 y 1024 px).
- **Carga por cuadrilla** (casos activos por equipo, para asignar con datos).
- **Duplicar rol al crear** (partir de cero invita a huecos de permisos).

### P2 — pulido con fecha flexible
Previsualización ciudadana de comunicados antes de publicar · hoja de estilos
de impresión + PDF/XLSX en Reportes (tras el RPC de agregados de reportes) ·
reagrupar las 9 pestañas de Configuración en 4 · clustering de marcadores en
el mapa (>100 pines) · enmascarar DUI en la lista de Población.

### Decisión de producto abierta
**Intervenciones**: hoy duplica Denuncias sin función propia. O se convierte en
tablero de despacho por cuadrilla, o se retira del menú hasta tener trabajo.
También sigue abierta la confirmación del alcalde sobre quién atiende la cola
ciudadana (la regla operativa actual: el departamento responsable de la
categoría pública).

### Deuda congelada (baja al tocar cada vista; nunca puede subir)
`conformidad-base.json` al cierre del P0: 129 botones a mano · 90 campos ·
47 divs-tarjeta · 15 modales · 16 `z-[…]` · 2 tablas · 7 controles <44 px ·
3 `md:` fuera de canal · 2 iconos sin nombre. Los 83 avisos táctiles del banco
son en su mayoría los filtros compactos de 36 px, decisión asumida.

### Fuera de este plan (backlog general, para no perderlo de vista)
Backups automatizados · Web Push · README desactualizado (dice que el sistema
es demo frontend) · fotos huérfanas en cPanel · evidencias legibles por URL
pública · esquema divergente en `database/postgresql/` · retirar
`DEMO_CREDENCIALES` cuando el banco tenga alternativa.

---

## 5 · Reglas de trabajo vigentes

1. Antes de commitear UI: `npm run build` (compila CSS, regenera precache y
   corre el linter). Una clase que no compila **rompe el build**; la deuda que
   sube rompe `npm run conformidad`.
2. Toda verificación visual pasa por el banco; «se ve bien» sin captura no
   cuenta. Dos veces el análisis estático dijo que estaba bien y el teléfono
   dijo que no.
3. Vista que se toque por cualquier motivo se migra a primitivas en el mismo
   cambio, y se recongela la base (`npm run conformidad -- --congelar`).
4. Un merge a `main` = una unidad de reversión. Nunca dos frentes sin validar
   en el mismo despliegue.
