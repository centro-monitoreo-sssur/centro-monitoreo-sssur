# AGENTS.md — Centro de Monitoreo SSSur

Contexto persistente para cualquier IA (Claude, Copilot, Kilo Code, etc.) que trabaje en este proyecto.

> **Última actualización:** 1 de agosto de 2026

---

## Jerarquía de fuentes de verdad

Este archivo es un **índice**, no el detalle. Si algo aquí contradice a las fuentes de abajo, mandan ellas:

| Prioridad | Fuente | Qué contiene |
|---|---|---|
| 1 | La base de datos real (Supabase) | Estado operativo. Verificar con `database/diagnostico_post_migraciones.sql` |
| 2 | El código | Qué hace el sistema hoy |
| 3 | `DOCUMENTACION_TECNICA.md` | **Documento principal.** Arquitectura, trampas conocidas, handoff, pendientes |
| 4 | `docs/` | Reglas de negocio, límites del plan FREE, despliegue |
| 5 | `graphify-out/` | Grafo de dependencias. Regenerar con `graphify update .` |
| 6 | Este archivo | Resumen y reglas de comportamiento |

**Nunca escribas aquí un dato que ya viva en otro lado.** La duplicación es lo que desactualizó la versión anterior de este archivo.

---

## Estado real del proyecto

**Fase: EN PRODUCCIÓN con backend conectado.**

- **Publicado en:** https://monitoreo.sansalvadorsur.gob.sv/ (frontend estático en cPanel).
- **Backend:** Supabase FREE, conectado y operativo. Postgres + PostGIS + Auth + Storage + Realtime.
- **Migraciones aplicadas:** `schema.sql`, `schema_cartograma.sql` y `migration_v5` … `migration_v15`, incluida v15 (`security_invoker` + tramos LineString).
- **RLS activo:** aislamiento de casos por departamento (v14) con vistas `security_invoker` (v15).
- **Realtime real:** `stores/denuncias.js` se suscribe a `postgres_changes` sobre la tabla `casos`.
- **Auth real:** Supabase Auth. `soporte.ti@sansalvadorsur.gob.sv` es `superadmin` (`rol_id = 1`).
- **Despliegue:** cPanel toma el código desde GitHub. **Cada push a `main` publica a producción con usuarios reales.**
- **Sistema de uso interno exclusivo** (empleados/admin). El portal ciudadano (`poblacion/`) existe en código pero **no está habilitado** — feature futura.

### Decisión de plan pendiente de cerrar

`docs/arquitectura/` propone Supabase **Pro** para producción; `docs/arquitectura/CONTEXTO_CRITICO.md` define la estrategia para operar en **FREE**. Hoy corre en FREE. Aplican las restricciones de FREE hasta nuevo aviso: 500 MB de BD, 1 GB de Storage, pausa tras 7 días sin actividad.

---

## Reglas críticas para la IA

⚠️ **El backend SÍ existe y está en producción.** Los stores consultan Supabase de verdad. No generes capas mock nuevas ni reintroduzcas `demo-data.js` en código nuevo.

⚠️ **Esto está en producción con usuarios reales.** Antes de cambiar algo que toque `casos`, RLS o el flujo de la PWA de campo, considera el impacto operativo. Trabaja en rama, no directo sobre `main`.

⚠️ **Prohibido guardar Base64 en Postgres.** Las imágenes van a Supabase Storage; en la BD solo la URL. Ver `docs/arquitectura/CONTEXTO_CRITICO.md` §2.3. *(Hoy hay una violación activa de esta regla en `stores/offline-queue.js` — ver "Deuda conocida".)*

⚠️ **Prohibido `OFFSET`.** Paginación exclusivamente por cursor: `where id > last_seen_id limit 20`.

⚠️ **No generes Flask, MySQL, Node ni Python para cPanel.** El backend lógico es Supabase. cPanel solo sirve estáticos y, como máximo, un endpoint ligero de backup de fotos.

⚠️ **Toda vista SQL nueva que exponga datos de `casos` debe declarar `security_invoker = on`.** Olvidarlo no lanza error: produce una fuga silenciosa de datos entre departamentos.

⚠️ **Los objetos de Leaflet nunca dentro de `ref`/`reactive`.** Usar `let` plano o `markRaw()`. Ver `DOCUMENTACION_TECNICA.md` §11.1.

---

## Reglas de comportamiento (MODO CAVEMAN)

Sé extremadamente conciso, directo y eficiente.

1. **Idioma obligatorio:** español en respuestas, variables, funciones y comentarios.
2. **Sin cortesías:** nada de introducciones ("Claro..."), despedidas ni disculpas.
3. **Estilo:** explicaciones en listas de una línea. Máximo código funcional, mínimo texto.
4. **Respuestas puras:** si la respuesta es un comando o un archivo, devuelve únicamente eso.

---

## Stack

- **Frontend:** Vue 3 Composition API + TailwindCSS + Leaflet + Chart.js, **todo por CDN**.
- **Arquitectura buildless:** sin `package.json`, sin `node_modules`, sin npm/webpack/vite. No hay `npm run dev`.
- **Para trabajar en local:** servir la carpeta con cualquier servidor estático (`python -m http.server 8080`). **No abrir con `file://`** — los módulos ES y el `fetch()` de plantillas violan CORS.
- **Estado:** stores propios (patrón tipo Pinia) en `assets/js/stores/`. Sin Vuex ni Pinia.
- **Backend:** Supabase. Credenciales en `assets/js/core/supabase-config.js` (versionado, sin `.env`).
- **Hosting:** cPanel compartido, solo archivos estáticos.

---

## Patrón de componentes híbridos

Cada componente son **dos archivos**:

1. Lógica → `assets/js/components/<subcarpeta>/<nombre>.js` (exporta el `setup()`).
2. Plantilla → `assets/templates/<subcarpeta>/<nombre>.html` (HTML puro).

Registro central en `assets/js/components/index.js`; el `tpl` incluye la subcarpeta (`"empleados/vista-mapa-vivo"`).

Subcarpetas espejo en ambos árboles: `shared/`, `admin/`, `empleados/`, `poblacion/`.

> **Trampa:** nada valida que plantilla y lógica coincidan. Si la plantilla llama a algo que el `setup()` no retorna → `TypeError` y **pantalla en blanco** sin más pistas. Al copiar una plantilla de otro módulo, verifica que el `return` exponga todo lo que la plantilla usa.

**Imports desde subcarpetas:** `../../core/`, `../../stores/`, `../../utils/`.

---

## Deuda conocida (verificada en código, agosto 2026)

Esto no es "por diseño", son cosas por arreglar. Detalle y priorización en `DOCUMENTACION_TECNICA.md` §12.

| Tema | Dónde | Nota |
|---|---|---|
| **Base64 en Postgres** | `stores/offline-queue.js` (caso `SUBIR_FOTO`) | Guarda `dataUrl` en `casos.datos_extra`. Viola la regla del plan FREE y llena la BD. Prioridad máxima. |
| **Storage sin usar** | Todo el proyecto | Cero llamadas a `storage.from(...)`. El bucket `fotos-activas` no recibe nada. |
| **Backup de fotos** | cPanel | `backup_foto.php` no existe. Sin utilidad hasta que Storage se use. |
| **Fallbacks a demo** | `stores/denuncias.js`, `poblacion.js`, `catalogos.js`, `configuracion.js`, `components/shared/app-root.js`, `utils/grupos-categorias.js` | Aún caen a `utils/demo-data.js` si la consulta falla. Requisito: todas las vistas conectadas a BD. |
| **Credenciales demo** | `stores/navegacion.js` (`DEMO_CREDENCIALES`) | Solo se activan si no hay cliente Supabase (`!db`). Ruta muerta en producción, pero conviene retirarla. |
| **`markRaw` ausente** | 5 vistas con `mapa.value = L.map(...)` | Bug latente de Leaflet en `ref`. Ver §11.1. |
| **`useMapa.js` huérfano** | `assets/js/composables/` | Nadie lo importa. Coordenadas hardcodeadas. |
| **PWA sin caché real** | `sw.js` | Precachea 3 recursos; la app carga ~90 archivos por `fetch()`. Sin señal no arranca. |
| **Esquemas divergentes** | `database/postgresql/` | Modelo alterno (`denuncias`, `incidentes`) que **no** corresponde al de producción (`casos`). Ensucia el grafo de graphify. |
| **UI de tramos** | `?contexto=empleados` | El modelo físico existe (v15); la interfaz de captura no. Pendiente funcional más grande. |

**Convención:** todo dato simulado se marca con `// DEMO:` o `// Datos simulados (demo) — reemplazar con API real`.

---

## Flujos con reglas de negocio propias

- **Cierre de incidente:** solo accesible desde `detalle-intervencion`, nunca desde el menú. El incidente se preselecciona vía `localStorage('intervencion_activa')`.
- **Contextos por URL:** base → admin · `?contexto=empleados` → PWA de campo · `?contexto=poblacion` → ciudadana (deshabilitada). Resolución en `shared/app-root.js`.
- **Organigrama mutable:** direcciones y departamentos usan borrado lógico con punteros de sucesión, nunca `DELETE`. Ver `DOCUMENTACION_TECNICA.md` §5.
- **Tramos:** un caso es un punto (denuncia) o una línea (intervención lineal). El flag `es_tramo` decide si el frontend pinta marcador o polilínea. GeoJSON entrega `[lng, lat]`, Leaflet espera `[lat, lng]`.

---

## Flujo de trabajo

**Al abrir sesión:**
```bash
git pull
graphify update .
```
Y leer §12 (handoff) de `DOCUMENTACION_TECNICA.md`.

**Al cerrar sesión:**
```bash
git add -A && git commit && git push
```
Y actualizar §12 con lo que quedó a medias, la trampa nueva encontrada y la decisión que quedó abierta.

**Antes de refactorizar o crear módulos:** consultar el grafo (`graphify query`, `graphify affected`, `graphify god-nodes`).
