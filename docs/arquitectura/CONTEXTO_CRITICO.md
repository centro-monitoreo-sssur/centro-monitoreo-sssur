# SKILL / CONTEXTO CRÍTICO: Estrategia de Mitigación para Supabase FREE

> **Propósito:** Definir las reglas de arquitectura y código necesarias para garantizar la continuidad operativa del sistema en producción utilizando el plan **Supabase FREE ($0/mes)** sin degradar el servicio ni superar las cuotas máximas.

---

## 1. Mantenimiento de Actividad (Prevención de Pausa Automática)

Supabase FREE inhabilita proyectos tras **7 días continuos de inactividad** (cero peticiones a la API)[cite: 1, 5, 7].

### Regla de Negocio
- **Ping por Auditoría:** El sistema registra un evento inmutable en la tabla `bitacora` durante cada inicio/cierre de sesión o acción administrativa[cite: 2, 4]. Dado el uso laboral de lunes a viernes[cite: 2, 5], la operación ordinaria mantendrá el proyecto activo naturalmente.
- **Protocolo para Periodos Vacacionales:** Durante asuetos o vacaciones institucionales que superen los 5 días continuos (ej. Vacaciones Agostinas o Fin de Año), se debe programar un *Keep-Alive CRON* o realizar un acceso administrativo remoto para generar una lectura/escritura mínima y prevenir la pausa del proyecto[cite: 7].

---

## 2. Gestión de Almacenamiento en Base de Datos (Límite: 500 MB)

Para no saturar el espacio en disco y evitar que la base de datos entre en modo `Read-Only`[cite: 3, 5]:

### Reglas para la IA / Desarrollador
1. **Purga Automática de Bitácora:** Implementar una función o tarea programada (*pg_cron* o Edge Function) para archivar o purgar registros de auditoría/bitácora que superen los 6 meses de antigüedad.
2. **Consultas Paginadas por Cursor:** Prohibido usar `OFFSET` en listados de denuncias o bitácoras[cite: 3, 6]. Todas las consultas a Supabase deben usar paginación por cursor (`WHERE id > last_seen_id LIMIT 20`) para optimizar espacio de índices y memoria[cite: 3, 6].
3. **No Guardar Base64:** Prohibido bajo cualquier circunstancia almacenar imágenes en formato Base64 o binarios pesados dentro de las tablas de Postgres[cite: 3, 5]. Solo se almacenan cadenas de texto con las URLs[cite: 3, 4, 5].

---

## 3. Estrategia Acelerada para Fotografías (Límite Storage: 1 GB)

Con el plan FREE, la cuota de *Supabase Storage* se limita a 1 GB (~2,000 a 3,000 imágenes optimizadas)[cite: 3, 5].

### Flujo de Vida de Archivos (Paso a cPanel)
1. **Compresión Obligatoria en Frontend:** Antes del upload, la imagen capturada debe redimensionarse a 1024x1024 px, relación 1:1, calidad JPEG 0.6 y peso máximo de 500 KB[cite: 5].
2. **Purga Temprana:** Reducir la ventana de retención en Supabase Storage de 30 días a **7 o 15 días** tras el cierre/resolución de la denuncia[cite: 3, 5].
3. **Descarga a Backup cPanel:** Al cumplir el plazo, la Edge Function de purga transferirá la imagen al endpoint `backup_foto.php` en cPanel (`/public_html/backups/fotos/`), actualizará la columna `foto_url_backup` en Postgres y liberará de inmediato el espacio en Supabase Storage[cite: 3, 5].

---

## 4. Estrategia de Respaldo de Datos (Backups Manuales)

El plan FREE no cuenta con respaldos diarios automatizados por la plataforma[cite: 3, 5].

### Protocolo de Respaldo
- **pg_dump Periódico:** Se debe ejecutar una exportación semanal de la estructura y datos de la base de datos vía CLI de Supabase o tarea *Cron* local:
  ```bash
  supabase db dump --project-ref <PROJECT_REF> -f backup_semanal.sql
---

## 5. Resumen de Límites Clave en Modo FREE

| Servicio | Límite FREE | Acción Preventiva |
| :--- | :--- | :--- |
| **Base de Datos** | 500 MB | Purga periódica de `bitacora` + No almacenar Base64. |
| **Storage (Fotos)** | 1 GB | Transferencia a cPanel a los 7-15 días de resuelta la denuncia. |
| **Inactividad** | Pausa a los 7 días | Registro de login/logout diario en `bitacora`. |
| **Realtime** | 200 conexiones | Suficiente para la cuadrilla y administradores operativos. |