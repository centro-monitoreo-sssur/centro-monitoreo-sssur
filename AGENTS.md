# AGENTS.md — Centro de Monitoreo SSSur

Este archivo da contexto persistente a cualquier IA (Claude, Copilot, modelos vía Kilo Code, etc.) que trabaje en este proyecto. Léelo antes de sugerir o generar código.

---

## Estado actual del proyecto

**Fase: Frontend-only, validando UX/UI y dinamismo. Inicio de migración a Supabase FREE (desarrollo/prueba).**

- El backend **NO está conectado todavía** en producción.
- Toda la "capa de datos" es simulada (mock). El objetivo de esta fase es validar flujos, componentes y experiencia de usuario antes de conectar Supabase.
- Para desarrollo/prueba se usará **Supabase FREE**. Para producción se requiere **Supabase Pro ($25/mes)** porque FREE se pausa tras 1 semana de inactividad.
- El hosting cPanel **solo sirve archivos estáticos**. No corre backend propio.

### Regla crítica para la IA

⚠️ **No asumas que hay backend funcionando.** No sugieras código que dependa de una API real propia, no intentes "arreglar" llamadas a Flask como si ya existieran, y no generes lógica de conexión a base de datos a menos que se te pida explícitamente iniciar esa migración. Todo dato viene de mocks locales por diseño, no por error.
⚠️ **No generes código Flask, MySQL o Python para cPanel.** El backend lógico es Supabase. cPanel solo debe usarse para hosting estático o, como máximo, un endpoint ligero de backup de fotos históricas.

## Reglas de Comportamiento (MODO CAVEMAN)

Actúa bajo la regla Caveman. Sé extremadamente conciso, directo y eficiente.

1. **Idioma obligatorio:** Español en respuestas, variables, funciones y comentarios.
2. **Sin cortesías:** Elimina introducciones ("Claro..."), despedidas y disculpas.
3. **Estilo:** Explicaciones en listas de 1 línea. Respuestas con máximo código funcional y mínimo texto.
4. **Respuestas puras:** Si la respuesta es solo un comando o archivo de código, devuelve únicamente el código.

---

## Stack tecnológico

- **Frontend:** HTML + TailwindCSS (CDN, sin build tools) + Vue 3 Composition API (CDN)
- **Patrón de estado:** stores propios (similar a Pinia) en `assets/js/stores/`
- **Persistencia temporal:** `localStorage` para configuración y preferencias de UI (no es dato de dominio, es solo estado de la interfaz)
- **Backend (producción):** Supabase Pro (Postgres + Auth + Storage + Realtime)
- **Backend (desarrollo/prueba):** Supabase FREE
- **Hosting:** cPanel compartido (solo archivos estáticos)
- **Backup histórico fotos:** cPanel filesystem `/public_html/backups/fotos/` vía endpoint Python/PHP ligero

---

## Estructura de componentes (reorganizada)

Los archivos de JS y HTML están **organizados por módulo** dentro de sus respectivas subcarpetas. Esta fue una refactorización reciente:

### `assets/js/components/`
| Subcarpeta | Descripción |
|---|---|
| `shared/` | Componentes transversales: `app-root`, `app-sidebar`, `app-topbar`, `bottom-tab-bar`, `modal-confirmacion`, `vista-login`, `vista-placeholder` |
| `admin/` | Panel principal de administración: dashboard, mapa, reportes, cartograma, configuracion, denuncias, intervenciones, usuarios, roles, bitacora |
| `empleados/` | PWA de empleados de campo: pwa-empleado, mapa-vivo, mis-intervenciones, detalle-intervencion, cierre-incidente, levantar-denuncia, buzon-offline, mi-perfil-empleado, **bitacora-empleado** |
| `poblacion/` | PWA ciudadana: pwa-poblacion, crear-denuncia, mis-denuncias, detalle-denuncia, mapa-distrito, noticias, mi-perfil-poblacion, registro-poblacion |
| `index.js` | Registro central — importa desde subcarpetas y mapea `tpl` con prefijo de carpeta (ej. `"empleados/vista-mapa-vivo"`) |

### `assets/templates/`
Espejo exacto de la estructura JS: `shared/`, `admin/`, `empleados/`, `poblacion/`.

El `template-loader.js` ya soporta subcarpetas: usa `assets/templates/${tpl}.html` donde `tpl` incluye el prefijo (ej. `"empleados/vista-mapa-vivo"`).**

---

## Mapa de la simulación de BD (mock layer)

| Capa | Archivo(s) | Rol |
|---|---|---|
| Mock central | `assets/js/utils/demo-data.js` | Fuente de verdad de los datos demo: `tiposDenunciaFallback` (5 tipos), `denunciasDemo` (10 denuncias con coords dentro del bbox SSSur) |
| Stores | `stores/denuncias.js`, `stores/catalogos.js`, `stores/configuracion.js`, `stores/navegacion.js` | Consumen los mocks, simulan latencia de red (`setTimeout`), persisten en `localStorage` |
| Mocks por vista | `admin/vista-cartograma.js`, `admin/vista-mapa.js`, `admin/vista-usuarios.js`, etc. | Datos hardcodeados marcados con `// Datos simulados (demo) — reemplazar con API real` |
| Geo mock | `services/geo-json/limites-municipio.js`, `limites-poligonos.js` | GeoJSON hardcodeado de límites/distritos |
| Mock empleados | `empleados/vista-mis-intervenciones.js`, `empleados/vista-bitacora-empleado.js` | Historial e intervenciones demo del empleado |
| Mock noticias | `utils/noticias-demo.js` | Noticias municipales demo (publicadas por la alcaldía) |
| Esquema objetivo | `database/schema.sql`, `database/schema_cartograma.sql` | SQL de referencia para Supabase Postgres. **No se ejecuta en el frontend.** |

### Detalles a tener en cuenta

- `stores/denuncias.js` tiene una suscripción "realtime" que **aún apunta al mock**, no a WebSockets reales.
- `admin/vista-mapa.js` inyecta denuncias demo en vivo cada 48 segundos (`simularDenuncia()` + `setInterval`). Solo para demo visual.
- `admin/vista-usuarios.js` usa `usuariosDemo` como fallback explícito de API real.
- `empleados/vista-bitacora-empleado.js` muestra el **historial personal de intervenciones del empleado**, no la bitácora de auditoría del sistema (esa es `admin/vista-bitacora.js`).

---

## Módulos por portal

### Panel de Administración (admin/)
Acceso por URL: `?contexto=admin` o sin parámetro en desktop.
Shell: `app-sidebar` + `app-topbar` + contenido principal.

| Vista | Función |
|---|---|
| dashboard | KPIs, gráficas Chart.js, resumen ejecutivo. Diseño FlowBite responsivo con layouts separados para móvil/desktop |
| mapa | Mapa Leaflet en tiempo real (simulado) con capas, calor, polígonos |
| denuncias | Tabla interactiva con filtros y modal de revisión |
| intervenciones | Tablero Kanban / Lista con drag & drop |
| cartograma | Análisis territorial por distrito |
| reportes | Generación de reportes |
| usuarios | CRUD de usuarios del sistema |
| roles | Matriz de permisos |
| bitacora | **Auditoría del sistema** (registro de acciones, no intervenciones de campo) |
| configuracion | Panel de parámetros, colores de pines, sonidos, límites |

### PWA Empleados de Campo (empleados/)
Acceso por URL: `?contexto=empleados`.
Shell: `bottom-tab-bar tipo="empleado"`.

| Vista | Función |
|---|---|
| pwa-empleado | Home del empleado |
| mapa-vivo | Mapa operativo en tiempo real con GPS |
| mis-intervenciones | Lista de tareas/intervenciones asignadas |
| detalle-intervencion | Detalle de una intervención con mini-mapa |
| cierre-incidente | Formulario de resolución de incidente |
| levantar-denuncia | Registro presencial de denuncia |
| buzon-offline | Cola de denuncias offline |
| mi-perfil-empleado | Perfil del empleado |
| **bitacora-empleado** | **Historial personal de intervenciones del empleado** |

### PWA Ciudadana (poblacion/)
Acceso por URL: `?contexto=poblacion`.
Shell: `bottom-tab-bar tipo="poblacion"`.

| Vista | Función |
|---|---|
| pwa-poblacion | Home / Dashboard ciudadano |
| crear-denuncia | Formulario de denuncia con GPS y fotos |
| mis-denuncias | Historial de denuncias del ciudadano |
| detalle-denuncia | Detalle individual de una denuncia |
| mapa-distrito | Mapa del distrito del ciudadano |
| noticias | Noticias publicadas por la alcaldía (solo lectura) |
| mi-perfil-poblacion | Perfil y datos del ciudadano |
| registro-poblacion | Formulario de registro inicial |

**Nota:** El portal ciudadano (poblacion) **no está implementado en esta fase**. Existe como feature futura pendiente de aprobación de infraestructura y presupuesto.

---

## Flujo de Cierre de Incidente (solo empleados)
El acceso a `cierre-incidente` **solo es posible desde la vista de detalles** (`detalle-intervencion`).
No hay acceso directo desde el menú de inicio. El sistema pre-selecciona automáticamente el incidente activo vía `localStorage('intervencion_activa')`.

---

## Sistema de Noticias

- Las noticias son **publicadas exclusivamente por la alcaldía** (no por ciudadanos).
- Las noticias se filtran por el **distrito del usuario** registrado, mostrando contenido relevante geográficamente.
- Cuando una noticia tiene tipo "cierre de vía", al hacer clic en "Ver en mapa" se muestra el **trazo del cierre** marcado por personal municipal.
- Mock en: `utils/noticias-demo.js` y `poblacion/vista-noticias.js`.

---

## Sistema de Autenticación y Contextos

El sistema soporta **tres portales diferenciados** accesibles mediante parámetros URL:

| Contexto | URL | Login | Destino tras login |
|---|---|---|---|
| Admin | `URL_BASE` o `?contexto=admin` | Centro de Monitoreo | `dashboard` |
| Población | `?contexto=poblacion` | Portal Ciudadano | `pwa-poblacion` |
| Empleados | `?contexto=empleados` | Portal Empleados | `pwa-empleado` |

**Credenciales demo:**
- Admin: `soporte.ti` / `admin123#`
- Población: `ciudadano` / `ciudadano123`
- Empleados: `empleado` / `empleado123`

**Flujo de población:**
- Acceso a `?contexto=poblacion` → Muestra login ciudadano (no registro directo)
- Login tiene botón "Registrarme como ciudadano" → Va a formulario de registro
- Si ya tiene cuenta → Login directo → `pwa-poblacion`

**Componente login:**
- `shared/vista-login.js` detecta contexto desde URL
- `shared/vista-login.html` se adapta dinámicamente (títulos, labels, iconos)
- Navegación entre portales mediante botones en footer del login

---

El componente `bottom-tab-bar` (`shared/bottom-tab-bar.html`) es único para ambos portales, diferenciado por la prop `tipo`:
- `tipo="poblacion"` → barra azul: Inicio, Mapa, Crear (central elevado), Noticias, Más
- `tipo="empleado"` → barra verde: Inicio, Mapa, Levantar (central elevado), Tareas, Más

El menú "Más" es un **popup flotante** que se despliega sobre el botón (no expande hacia abajo).

---

## Plan de migración a Supabase

Idea ya identificada: unificar toda la simulación en un solo módulo `services/supabase-api.js`, con funciones como `getDenuncias()`, `getUsuarios()`, etc. Esto convierte el cambio a Supabase en **un solo punto de reemplazo**.

**Fases de migración:**
1. **Desarrollo/prueba:** Supabase FREE (sin costo, pero se pausa tras 1 semana de inactividad).
2. **Producción:** Supabase Pro ($25/mes). Obligatorio para operación continua 24/7.
3. **Backend lógico:** Todo reside en Supabase (Postgres, Auth, Storage, Realtime).
4. **cPanel:** Solo hosting estático del frontend + endpoint ligero para backup histórico de fotos en `/public_html/backups/fotos/`.

**No implementar esta migración todavía a menos que se pida explícitamente.**

---

## Recomendaciones de Arquitectura Backend

### Infraestructura y Hosting
- ✅ **Supabase** como Backend-as-a-Service completo (BD, Auth, Storage, Realtime).
- ✅ **cPanel compartido** solo para hosting estático del frontend.
- ❌ NO usar cPanel para ejecutar Flask, Node.js o procesos backend propios.
- ❌ NO usar MySQL cPanel como base de datos principal del sistema.
- ❌ NO usar Google Drive ni Gmail como almacenamiento de aplicación.

### Base de Datos
- **Supabase Postgres:** BD principal con PostGIS nativo para datos geoespaciales.
- Incluye 8 GB en plan Pro (FREE tiene 500 MB, insuficiente para producción).
- RLS (Row Level Security) nativo para filtrado por rol/empleado_id.

### Tiempo Real (Realtime)
- Usar **Supabase Realtime** (WebSocket gestionado). No SSE, no WebSockets propios.
- 500 conexiones concurrentes en plan Pro. Suficiente para 20-50 empleados.

### Almacenamiento de Imágenes
- **Supabase Storage** (plan Pro incluye 100 GB con CDN).
- **Backup histórico:** cPanel filesystem `/public_html/backups/fotos/` para fotos purgadas (>30 días).
- No necesitás Google Drive ni almacenamiento externo adicional.

### Notificaciones Push (PWA)
- Web Push API con VAPID keys (futuro).
- Supabase Realtime como fuente primaria de notificaciones.

### Patrones y Optimización
- **Connection Pooling:** Gestionado por Supabase (no configuración manual).
- **Índices:** B-Tree en estado, distrito, created_at. Spatial Index en PostGIS para coordenadas.
- **Cursor Pagination:** `WHERE id > last_seen_id LIMIT 20`.
- **Cache-Aside:** No necesario en esta escala. Supabase maneja caché de consultas frecuentes.
- **Application Factory + Blueprints:** No aplica. Supabase reemplaza esta estructura con schemas, funciones y Edge Functions.

---

## Patrones de Diseño y Complejidad Algorítmica

- **Store Pattern:** Gestión centralizada de estado global (similar a Pinia)
- **Component Pattern:** Componentes Vue reutilizables con Composition API
- **Service Pattern:** Separación de lógica de negocio en `assets/js/services/`
- **Observer Pattern:** Reactividad de Vue para actualizaciones automáticas de UI
- **Evitar loops anidados** en renderizados grandes; usar `Map`/`Set` para búsquedas O(1)

---

## Convenciones de código

- Comentar datos simulados con `// DEMO:` o `// Datos simulados (demo) — reemplazar con API real`
- Los imports en subcarpetas usan path `../../core/`, `../../stores/`, etc.
- Mantener claridad sobre build-tools: este proyecto NO usa npm/webpack/vite.
- Para Supabase: usar el SDK oficial vía CDN. No instalar paquetes npm.

---

## Objetivo actual de trabajo

Validar funcionalidades, dinamismo y UX/UI del sistema **antes** de conectar Supabase en producción. No sugerir ni priorizar trabajo de backend/Flask salvo que se indique explícitamente iniciar la migración.

El plan de migración definitivo está documentado en `ANALISIS_PROFUNDO_LIMITANTES_VIABILIDAD_REAL.md`.


# Estado Actual del Proyecto: Centro de Monitoreo SSSur

> **Última actualización:** Julio 2026 · Fase: Frontend-only con datos mock · **Stack backend definido: Supabase (FREE desarrollo, Pro producción) + cPanel hosting estático** · Sistema uso interno exclusivo (empleados/admin). Portal ciudadano desactivado como feature futura.

---

## ✅ Características Completadas

### Arquitectura Base
- Estructura modular sin build-tools (Vue 3 vía CDN + TailwindCSS CDN).
- Carga asíncrona de plantillas HTML mediante `template-loader.js` con soporte de subcarpetas.
- SPA con enrutador propio manejado por `app-root` + store `navegacion.js`.
- **Reorganización de archivos:** componentes y templates divididos en subcarpetas por módulo: `shared/`, `admin/`, `empleados/`, `poblacion/`.
- Soporte completo de **Modo Oscuro** adaptativo (UI, gráficos, mapas).

### Panel de Administración (admin/)
- **Dashboard Analítico:** KPIs en tiempo real (simulado), gráficas Chart.js con adaptación de tema oscuro.
- **Mapa de Monitoreo (GIS):** Leaflet con múltiples capas, agrupación de pines (MarkerCluster), mapas de calor, medición (línea recta + OSRM), dibujo de polígonos, y simulación de denuncias en vivo cada 48s.
- **Gestión de Denuncias:** Tabla interactiva con filtros multi-criterio, búsqueda y modal de revisión detallado.
- **Intervenciones Activas:** Vista dual (Kanban / Lista) con drag & drop visual.
- **Cartograma:** Análisis territorial por distrito.
- **Reportes:** Vista base implementada.
- **Usuarios:** CRUD completo con mock de datos.
- **Población Registrada:** CRUD completo con mock de datos (listar, filtrar por distrito/estado, ver detalle, verificar registros).
- **Departamentos y Unidades:** CRUD completo con datos oficiales del CSV `database/departamentos.csv`.
- **Roles y Permisos:** Matriz de accesos interactiva.
- **Bitácora de Auditoría:** Registro de actividad del sistema (no confundir con bitácora de empleado).
- **Configuración:** Panel avanzado de parámetros, colores de pines por dependencia, sonidos de notificación, límites geográficos.

### PWA Ciudadana (poblacion/)
- **Registro de ciudadanos** con validación de DUI, edad +18, dominio de correo.
- **Crear Denuncia** con flujo completo de formulario multi-paso, selección de categoría, GPS, fotos (mock), opción anónima.
- **Mis Denuncias:** Historial con estados.
- **Detalle de Denuncia:** Vista completa con mini-mapa de ubicación.
- **Mapa del Distrito:** Mapa Leaflet centrado en el distrito del usuario, con coordenadas predeterminadas por municipio.
- **Noticias Municipales:** Publicadas exclusivamente por la alcaldía. Se filtran por distrito del usuario. Las noticias de tipo "cierre de vía" muestran el trazo en el mapa al hacer clic en "Ver en mapa".
- **Mi Perfil:** Vista de perfil del ciudadano.
- **Bottom Tab Bar:** Diseño pill flotante con menú "Más" como popup flotante.

### PWA Empleados de Campo (empleados/)
- **Dashboard del empleado** con accesos rápidos a módulos.
- **Mapa Operativo en Vivo:** Leaflet centrado en coordenadas de la configuración del admin. Animación de espera durante geolocalización. El mapa se bloquea hasta obtener ubicación del usuario.
- **Mis Intervenciones:** Lista de tareas asignadas. Toda la tarjeta es clickeable.
- **Detalle de Intervención:** Vista full-screen con mini-mapa de la ubicación a atender.
- **Cierre de Incidente:** Formulario de resolución. Accesible **solo** desde "Detalle de Intervención". Pre-selecciona el incidente automáticamente. No aparece en el menú de inicio.
- **Levantar Denuncia:** Registro presencial de denuncia por el empleado.
- **Buzón Offline:** Cola de denuncias en espera de conexión.
- **Mi Perfil:** Vista de perfil del empleado.
- **Mi Bitácora (bitacora-empleado):** Historial personal de todas las intervenciones asignadas al empleado. Incluye buscador, filtros por estado y estadísticas rápidas. Es independiente de la bitácora de auditoría del admin.
- **Bottom Tab Bar:** Igual que población pero en color verde. Menú "Más" incluye "Mi Bitácora" y "Mi Perfil".

---

## 🛠️ Modificaciones Recientes (Julio 2026)

- **Reorganización de archivos:** `components/` y `templates/` divididos en `shared/`, `admin/`, `empleados/`, `poblacion/`. El `index.js` fue reescrito para importar desde subcarpetas con paths `tpl` prefijados.
- **Eliminación de archivos duplicados:** Se borran todos los archivos de la raíz de `assets/templates/` y `assets/js/components/` que ya estaban en las subcarpetas, manteniendo solo `index.js` en `components/`.
- **Vista bitacora-empleado:** Nueva vista para empleados que muestra su historial personal de intervenciones, diferenciada de la bitácora de auditoría del sistema.
- **Flujo de Cierre de Incidente:** Eliminado el acceso desde el menú de inicio. Solo accesible desde los detalles de la intervención. El incidente se pre-selecciona automáticamente.
- **Vista Detalle de Intervención:** Creada como vista full-screen (similar a la de denuncias), con mini-mapa, estadísticas y botón de cierre.
- **Noticias Municipales:** Módulo completo implementado para población, con filtros por distrito y visualización de trazos en mapa para cierres de vía.
- **Mapa empleado:** Centrado en coordenadas del admin (vista "Mapa en Vivo"). Animación de carga durante geolocalización.
- **Mapa ciudadano:** Centrado en el centroide del distrito del usuario registrado.
- **Bottom Tab Bar unificado:** Todos los portales usan el componente `bottom-tab-bar` con la prop `tipo`. El menú "Más" es ahora un popup flotante en vez de expandirse hacia abajo.
- **Fix de bitácora en empleados:** La ruta `bitacora` del empleado navegaba al shell admin. Ahora navega a `bitacora-empleado` correctamente.
- **Fix de vista bitácora de admin:** Se quita la vista `bitacora` del listado de vistas sin shell en `app-root.html` para que se muestre dentro del shell principal del panel de administración con sidebar y topbar. También se quita el wrapper innecesario de la plantilla para que coincida con las demás vistas del admin.
- **Rediseño del Dashboard:** Implementación de diseño FlowBite responsivo con layouts separados para móvil y desktop. Gráfica de tendencia con dos instancias de Chart.js (una para desktop, otra para móvil) para evitar superposiciones.
- **Sistema de Login Diferenciado:** Implementación de logins específicos por contexto (admin/poblacion/empleados) con títulos, labels e iconos adaptativos. Detección automática desde parámetros URL.
- **Flujo de Población Corregido:** Acceso a `?contexto=poblacion` ahora muestra login ciudadano primero (no registro directo). Botón "Registrarme como ciudadano" en footer del login lleva al formulario de registro.

---

## ⏳ Tareas Pendientes (Próximos Pasos)
> **Enfoque:** Sistema interno para empleados/admin. Portal ciudadano desactivado como feature futura.

1. **Migración a Supabase (desarrollo/prueba):**
    - Crear proyecto Supabase FREE para pruebas.
    - Instalar SDK Supabase vía CDN en `index.html`.
    - Reemplazar `services/mock-api.js` por `services/supabase-api.js`.
    - Conectar stores (`denuncias`, `navegacion`) a Supabase.
    - Implementar carga de fotos a Supabase Storage.
    - Probar Realtime para notificaciones.

2. **Supabase Pro (producción):**
    - Migrar a plan Pro ($25/mes) al pasar a producción.
    - Configurar RLS (Row Level Security) por rol y distrito.
    - Configurar PostGIS para polígonos y rutas.
    - Implementar backup histórico de fotos en cPanel (`/public_html/backups/fotos/`).

3. **Optimizaciones y features pendientes:**
    - Reemplazar `simularDenuncia()` por eventos Realtime reales.
    - Implementar búsqueda avanzada en bitácora de empleados.
    - Agregar exportación de reportes (PDF/Excel).
    - Implementar offline-first con sincronización automática en PWA empleados.

---

**Nota:** Esta fase es exclusivamente frontend con datos simulados. No hay backend conectado. Para producción se requiere Supabase Pro.

