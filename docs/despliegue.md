# Guía de Implementación del Prototipo: Supabase FREE y Despliegue en cPanel

Esta guía detalla los pasos exactos para inicializar el backend de prueba en Supabase y desplegar el frontend de la aplicación en el hosting compartido de la municipalidad, con el fin de tener el prototipo funcional listo para presentación.

---

## 1. Recomendación de Subdominio

Para un sistema institucional, el subdominio debe ser corto, fácil de dictar por teléfono o radio, y descriptivo.

**Recomendación principal:**
> **https://monitoreo.sansalvadorsur.gob.sv**

*Otras opciones viables:*
*   `gestion.sansalvadorsur.gob.sv` (Si se enfoca más en la gestión de incidentes).
*   `cm.sansalvadorsur.gob.sv` (Acrónimo corto, ideal para dispositivos móviles, aunque menos intuitivo al principio).

*Por qué descartar `sistemamonitoreo`:* Es un poco largo y redundante ("sistema" está implícito). `monitoreo` es directo y profesional.

---

## 2. Implementación de Base de Datos en Supabase FREE

Dado que aún no hay presupuesto para el plan Pro ($25/mes), el plan FREE es perfecto para el prototipo. 
*(Nota importante: El plan FREE se pausa automáticamente si no recibe tráfico en 7 días. Durante la fase de prueba, asegúrate de ingresar al menos una vez por semana, o reactivarlo desde el panel de Supabase antes de una presentación).*

### Paso 2.1: Crear el Proyecto
1. Ingresa a [Supabase.com](https://supabase.com/) y crea una cuenta (puede ser con el correo institucional o GitHub).
2. Haz clic en **"New Project"**.
3. Configura el proyecto:
   *   **Name:** `Centro Monitoreo SSSur (Demo)`
   *   **Database Password:** Genera una contraseña segura y guárdala.
   *   **Region:** Selecciona **US East (N. Virginia)** o **US East (Ohio)**. Son las regiones con menor latencia (ping) hacia El Salvador.
   *   **Pricing Plan:** Free.
4. Espera un par de minutos a que la base de datos termine de provisionarse.

### Paso 2.2: Ejecutar el Esquema SQL
1. En el menú lateral izquierdo de Supabase, ve a **"SQL Editor"**.
2. Haz clic en **"New Query"**.
3. Abre el archivo `database/schema.sql` de nuestro código fuente, copia todo su contenido y pégalo en el editor de Supabase.
4. Haz clic en el botón **"Run"** (o presiona Cmd/Ctrl + Enter).
   * *Esto creará todas las tablas, relaciones, habilitará PostGIS y configurará las políticas de seguridad base.*

### Paso 2.3: Configurar el Almacenamiento (Storage)
1. En el menú lateral, ve a **"Storage"**.
2. Haz clic en **"New Bucket"**.
3. Nómbralo: `fotos-activas`.
4. **IMPORTANTE:** Marca la opción **"Public bucket"** (esto permite que las fotos puedan verse en los reportes y en el mapa sin necesidad de generar URLs firmadas temporales).
5. Haz clic en **"Save"**.

### Paso 2.4: Obtener las Credenciales de API
1. En el menú lateral (abajo), ve a **"Project Settings"** (el ícono de engranaje) -> **"API"**.
2. Copia la **Project URL** (ej. `https://xxxxxx.supabase.co`).
3. Copia la **Project API keys (anon / public)**.
4. Mantén estas dos credenciales a la mano para el siguiente paso.

---

## 3. Conectar el Frontend a Supabase

Antes de subir el código a cPanel, debemos conectar nuestro código local al nuevo backend.

1. En tu proyecto, abre el archivo `assets/js/core/supabase.js`.
2. Actualiza el código para inicializar el cliente real (ahora mismo es un "stub" o simulación). Deberá quedar similar a esto:

```javascript
// assets/js/core/supabase.js
const supabaseUrl = 'AQUI_TU_PROJECT_URL';
const supabaseAnonKey = 'AQUI_TU_ANON_KEY';

// Inicializar el cliente usando el SDK cargado vía CDN en index.html
export const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
```

*(Próximamente, como parte del desarrollo, iremos migrando los archivos dentro de `assets/js/stores/` para que usen esta constante `supabase` en lugar de los datos estáticos de `demo-data.js`).*

---

## 4. Subida a cPanel Compartido (Hosting Municipal)

Como nuestra arquitectura no requiere Node.js ni procesos de "build" complejos en el servidor, el despliegue es simplemente copiar archivos estáticos.

### Paso 4.1: Crear el Subdominio en cPanel
1. Inicia sesión en tu cPanel de la alcaldía (`cpanel.sansalvadorsur.gob.sv`).
2. Ve a la sección **"Dominios"** (o Subdominios, dependiendo de la versión y tema de cPanel).
3. Haz clic en **"Crear un nuevo dominio"**.
4. Escribe el subdominio: `monitoreo.sansalvadorsur.gob.sv`.
5. Asegúrate de que el **Directorio Raíz (Document Root)** sea una carpeta limpia, por ejemplo: `public_html/monitoreo`.
6. Haz clic en **"Enviar"** o "Crear".

### Paso 4.2: Forzar HTTPS (SSL)
1. El cPanel de la alcaldía probablemente tenga AutoSSL. Ve a **"Estado SSL/TLS"** y presiona **"Run AutoSSL"** si el subdominio aún no tiene un candado verde. La app PWA y la geolocalización de Leaflet **no funcionarán** si no es bajo `https://`.

### Paso 4.3: Preparar el Archivo ZIP
1. En tu computadora (local), ve a la carpeta raíz del proyecto `centro-monitoreo-sssur`.
2. Selecciona **solo** los archivos y carpetas necesarios para producción (no incluyas `.git` ni archivos markdown). Selecciona:
   *   `index.html`
   *   `favicon.ico`
   *   Carpeta `assets/`
3. Comprime esa selección en un archivo llamado `despliegue.zip`.

### Paso 4.4: Subir los Archivos
1. En cPanel, ve al **"Administrador de Archivos"** (File Manager).
2. Navega a la carpeta que se creó para el subdominio (ej. `public_html/monitoreo`).
3. Haz clic en **"Cargar"** (Upload) en el menú superior y selecciona tu `despliegue.zip`.
4. Una vez cargado al 100%, vuelve al Administrador de Archivos.
5. Haz clic derecho sobre `despliegue.zip` y selecciona **"Extraer"** (Extract).
6. Verifica que el archivo `index.html` haya quedado directamente dentro de la carpeta `public_html/monitoreo/` (y no anidado dentro de otra subcarpeta).
7. Puedes eliminar de forma segura el archivo `despliegue.zip` del servidor para ahorrar espacio.

### Paso 4.5: Probar en Vivo
1. Abre tu navegador móvil o de escritorio e ingresa a `https://monitoreo.sansalvadorsur.gob.sv`.
2. Verifica que la carga sea rápida, que no haya errores en la consola (F12) y que el PWA detecte la posibilidad de instalarse.

> **¡Listo!** El sistema estará en línea con su backend real preparándose para recibir la migración de los datos simulados hacia llamadas reales de base de datos.
