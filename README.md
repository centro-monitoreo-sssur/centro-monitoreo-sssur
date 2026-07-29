# Centro de Monitoreo - Gestión Integral Municipal

El **Centro de Monitoreo SSSur** es una plataforma web orientada a la supervisión, análisis y gestión de eventos (denuncias, intervenciones, obras y servicios) dentro del municipio. Proporciona una vista geoespacial interactiva en tiempo real y un dashboard analítico para la toma de decisiones.

## 🚀 Características Principales

*   **Mapa en Vivo (GIS):** Visualización interactiva con múltiples capas (Predeterminado, Satélite, Claro, Oscuro).
*   **Herramientas GIS Avanzadas:** 
    *   Medición dual (Línea recta y Ruta vehicular OSRM).
    *   Herramienta de dibujo de polígonos interactiva para zonas de riesgo u obras.
*   **Gestión Integral de Módulos:**
    *   **Dashboard Analítico:** Gráficos estadísticos dinámicos para el seguimiento de reportes, tiempos de respuesta y carga de trabajo por distrito. Diseño FlowBite responsivo con layouts separados para móvil/desktop.
    *   **Gestión de Denuncias:** Visualización tabular, filtros por estado/categoría y modal detallado de incidentes.
    *   **Intervenciones Activas:** Tablero Kanban para gestión de estados de obras y cuadrillas en tiempo real.
    *   **Usuarios, Roles y Permisos:** Panel de administración de cuentas y matriz de acceso por módulos.
    *   **Bitácora de Auditoría:** Consola inmutable de registro de eventos (login, borrado, edición).
    *   **Configuración General:** Ajustes del sistema, notificaciones y parámetros visuales.
*   **Sistema de Login Diferenciado:** Dos portales activos accesibles mediante parámetros URL (admin/empleados) con interfaces adaptativas.
*   **Modo Oscuro Integrado:** Soporte nativo para *Dark Mode* en toda la interfaz, incluyendo menús, barras de herramientas, popovers, notificaciones (Toasts) y gráficos de Chart.js.
*   **Diseño UI/UX Responsivo:** Sidebar retráctil y adaptable (colapsable a iconos) estilo Dashboard moderno, con notificaciones (Toasts) en tiempo real y animaciones de entrada.

## 🛠️ Stack Tecnológico

El proyecto está diseñado bajo una arquitectura ligera que **no requiere herramientas de build (compilación)** en su estado actual, ideal para despliegues rápidos y mantenibilidad directa.

*   **Core:** HTML5, CSS3, JavaScript (ES6+).
*   **Framework Frontend:** [Vue.js 3](https://vuejs.org/) (Composition API, importado vía CDN global).
*   **Estilos:** [Tailwind CSS 3](https://tailwindcss.com/) (vía CDN) combinado con CSS nativo para keyframes personalizados y animaciones específicas (`assets/css/`).
*   **Librería de Mapas:** [Leaflet.js](https://leafletjs.com/) para el renderizado del mapa y la gestión de capas geoespaciales.
*   **Servicio de Rutas:** API pública de OSRM (`project-osrm.org`).
*   **Gráficos:** [Chart.js](https://www.chartjs.org/) para visualización de datos en el Dashboard.
*   **Iconografía:** FontAwesome 6 (Solid).
*   **Backend como Servicio:** [Supabase](https://supabase.com/) (Postgres + Auth + Storage + Realtime).
*   **Hosting:** cPanel compartido (solo archivos estáticos del frontend).

## 📂 Estructura del Proyecto

```text
centro-monitoreo-sssur/
├── index.html                 # Punto de entrada de la aplicación
├── assets/
│   ├── css/
│   │   ├── base.css           # Variables CSS, configuraciones de Tailwind y utilidades
│   │   ├── layout.css         # Estilos del esqueleto principal (Sidebar, Topbar)
│   │   ├── components.css     # Estilos de utilidades, switches y tarjetas
│   │   └── mapa.css           # Estilos específicos del mapa, botones y animaciones
│   ├── js/
│   │   ├── app.js             # Inicialización principal de la app Vue
│   │   ├── components/        # Componentes funcionales (Vue Composition API)
│   │   │   ├── index.js       # Registro central (importa desde subcarpetas)
│   │   │   ├── shared/        # Componentes transversales (login, app-root, etc.)
│   │   │   ├── admin/         # Vistas del panel de administración
│   │   │   ├── empleados/     # Vistas de la PWA para empleados de campo
│   │   │   └── poblacion/     # Vistas de la PWA ciudadana (feature futura)
│   │   ├── stores/            # Gestión de estado global (navegacion, denuncias, catalogos)
│   │   └── utils/             # Funciones de ayuda y demo-data
│   └── templates/             # Plantillas HTML asíncronas
│       ├── shared/            
│       ├── admin/             
│       ├── empleados/         
│       └── poblacion/         
└── database/                  # Esquemas SQL de referencia para Supabase Postgres
```

## ⚙️ Instalación y Uso

Dado que el proyecto utiliza Vue.js a través de CDN y carga templates usando peticiones `fetch()`, es necesario ejecutarlo a través de un servidor HTTP local para evitar bloqueos de CORS en el navegador.

1.  **Clonar/Descargar** el repositorio.
2.  **Iniciar un servidor local** en el directorio raíz. Opciones comunes:
    *   **VS Code:** Instalar y usar la extensión "Live Server".
    *   **Node.js:** Ejecutar `npx serve` o `npx http-server`.
    *   **Python:** Ejecutar `python -m http.server 8000`.
3.  **Abrir el navegador** en la dirección proporcionada por el servidor local (ej. `http://localhost:8000`).

La versión actual provee una estructura frontend completamente funcional (Mockup avanzado) con simulación de datos en memoria y generación aleatoria. Para la integración backend definitiva se adoptó Supabase como Backend-as-a-Service.

**Stack Backend (ver `RECOMENDACIONES_ARQUITECTURA_BACKEND.md`):**
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime).
- **Hosting:** cPanel compartido (solo frontend estático).
- **Desarrollo/prueba:** Supabase FREE (sin costo, se pausa tras 1 semana sin actividad).
- **Producción:** Supabase Pro ($25/mes). Obligatorio para operación continua 24/7.
- **Backup histórico fotos:** cPanel filesystem `/public_html/backups/fotos/` vía endpoint Python/PHP ligero.

**Funcionalidades backend pendientes:**
- Migración de mocks a Supabase (PostgREST + Auth + Storage + Realtime).
- RLS (Row Level Security) por rol y distrito.
- Edge Functions para lógica custom (purga de fotos, notificaciones).
- Reemplazo de `simularDenuncia()` por eventos Realtime reales.


# ESPECIFICACIÓN DE FUNCIONALIDADES ADICIONALES: CONTROL DE ACCESO POR ROLES (USO INTERNO)
> **Stack definitivo:** Supabase (FREE desarrollo, Pro producción) + cPanel hosting estático. Sistema **uso interno exclusivo** (empleados/admin). Portal ciudadano existe como feature futura pero no está implementado.

## ⚠️ ESTADO ACTUAL DEL PROYECTO

**Fase: Frontend-only con datos simulados (demo-data).**

El backend (Supabase) **NO está conectado todavía**. Todas las funcionalidades descritas en este documento operan con datos simulados almacenados localmente en el frontend.

### Plan de Implementación del Backend

El backend se implementará **únicamente cuando el proyecto esté listo para pasar a producción**. La arquitectura planeada incluye:

- **Backend como Servicio:** Supabase (Postgres + Auth + Storage + Realtime).
- **Hosting:** cPanel compartido (el actual de la municipalidad) solo para frontend estático.
- **Desarrollo/prueba:** Supabase FREE (sin costo, pero se pausa tras 1 semana de inactividad).
- **Producción:** Supabase Pro ($25/mes). Obligatorio para operación continua 24/7.
- **Base de Datos:** Supabase Postgres (empleados, denuncias, catálogos, bitácora, sesiones).
- **Auth:** Supabase Auth (email/password + JWT automático + MFA disponible).
- **Storage:** Supabase Storage (1 GB FREE / 100 GB Pro) para fotos activas.
- **Realtime:** Supabase Realtime para empleados. Polling a PostgREST cada 30s como respaldo.
- **Backup histórico:** cPanel filesystem `/public_html/backups/fotos/` para fotos purgadas (>30 días).

### Funcionamiento Actual con Demo-Data

Por el momento, todas las funcionalidades descritas en este documento:

- ✅ **Interfaz y UX:** Completamente funcional con diseño validado
- ✅ **Flujos de usuario:** Probados con datos simulados
- ✅ **Validaciones de frontend:** Implementadas y funcionando
- ❌ **Persistencia real:** NO conectada a base de datos
- ❌ **Autenticación real:** Credenciales hardcodeadas (demo)
- ❌ **API real:** Todas las llamadas son mock con setTimeout

## 1. CONTEXTO DE ACCESO (EMPLOYEES / ADMIN)

El rol y la pantalla de inicio del usuario se determinan en el primer acceso según el parámetro URL:

#### A. Contexto Empleado / Institucional

* URL de acceso: `?contexto=empleados`
* Comportamiento: Redirige exclusivamente a la Pantalla de Login Institucional. No permite el registro público.
* Las credenciales de empleados son creadas previamente por el Administrador desde la Web de Gestión.
* Valida la sesión contra Supabase Auth y asigna el rol correspondiente `empleado_campo`, `jefe_area`, `admin`.
* Credenciales demo: `empleado` / `empleado123`
* Plataforma: PWA móvil / tablet (empleados) o web desktop (jefes/admin).

#### B. Contexto Administrador (Default)

* URL de acceso: `URL_BASE` o `?contexto=admin`
* Comportamiento: Login del Centro de Monitoreo con acceso al panel de administración completo.
* Credenciales demo: `soporte.ti` / `admin123#`
* Plataforma: Web Desktop (cPanel)

**Contexto Población (portal ciudadano):**
* Existe como feature futura, pero **no está implementado en esta fase**.
* Si se accede a `?contexto=poblacion`, redirigir a `/` con mensaje "Disponible próximamente".
* No existen flujos de registro ciudadano ni denuncias anónimas en este momento.

**Componente Login:**
- `shared/vista-login.js` detecta contexto desde URL automáticamente
- `shared/vista-login.html` se adapta dinámicamente (títulos, labels e iconos) según el contexto
- Navegación entre portales mediante botones en footer del login

## 4. POLÍTICA DE DENUNCIAS

Las denuncias registradas por empleados son trazables por empleado_id.

### Lógica de Privacidad:

1. Atribución en Base de Datos: Cada denuncia guarda el `empleado_id` que la registró.
2. Visualización: En la tabla de Gestión de Denuncias, Mapa en Vivo y App de Campo, se muestra el empleado responsable.
3. No existe denuncia anónima en esta fase. Si se requiere en el futuro, se implementa como flag `anonima` en Supabase.

## 5. MATRIZ DE MÓDULOS Y VISTAS SEGÚN ROL Y PLATAFORMA

#### A. Rol: Empleado de Campo (Cuadrilla / CAM)

* Plataforma: Mobile PWA / Tablet
* Módulos Visibles:
1. Inicio / Dashboard Operativo
2. Mapa Operativo en Vivo: Seguimiento en tiempo real de incidentes con su propia ubicación GPS bloqueada hasta obtener señal.
3. Mis Intervenciones: Lista de tareas asignadas en su zona.
4. Detalle de Intervención: Visualización completa de un caso con flujo integrado hacia Cierre de Incidente (Evidencia de resolución).
5. Levantar Denuncia: Tomar denuncias presenciales a ciudadanos en calle.
6. Buzón Offline: Sincronización automática de datos al recuperar señal.
7. Mi Bitácora: Historial personal de todas sus intervenciones pasadas.
8. Mi Perfil: Datos de cuadrilla y operativos.

#### B. Rol: Jefe de Área / Unidad (Obras, Aseo, etc.)

* Plataforma: Web Desktop (cPanel)
* Módulos Visibles:
1. Dashboard de Unidad: Vista panorámica de incidencias asignadas a su área.
2. Mapa de Monitoreo GIS: Filtrado por estado, asignación de responsables y fechas.
3. Gestión de Denuncias: Control tabular y cambio de estados de expedientes.
4. Asignación de Cuadrillas: Control de flujos de trabajo en territorio.

#### C. Rol: Administrador del Sistema

* Plataforma: Web Desktop (cPanel)
* Módulos Visibles (Acceso total):
1. Dashboard General
2. Mapa GIS Global
3. Gestión de Usuarios y Roles (Creación de cuentas institucionales)
4. Bitácora de Auditoría (Auditoría inmutable de eventos e historial)
5. Configuración General (Parametrización de catálogos y límites del sistema)

---

**Nota:** El portal ciudadano (población) **no está implementado en esta fase** por limitantes de infraestructura y presupuesto. Se requiere aprobación específica de autoridades para desbloquear ese módulo.

