# Centro de Monitoreo SSSur — Documento del Equipo Técnico

> **Para:** desarrolladores, personal de la Gerencia de Tecnología y cualquier agente de IA que trabaje sobre este repositorio.
> **Propósito:** entender la arquitectura, las decisiones que la sostienen y las trampas que ya nos costaron tiempo, antes de tocar código.
> **Última revisión:** 12 de agosto de 2026.

Para el detalle exhaustivo de cada módulo existe `DOCUMENTACION_TECNICA.md` en la raíz del proyecto. Este documento es la orientación previa: lo que hay que saber **antes** de abrir un archivo.

---

## 1. Qué es el sistema

Tres aplicaciones que comparten un mismo origen, un mismo código base y una misma base de datos:

| Aplicación | Contexto | Quién la usa |
|---|---|---|
| **Centro de Monitoreo** | `monitoreo` | Dirección, jefaturas, administración |
| **PWA de Empleados** | `empleados` | Personal en territorio |
| **Portal de Población** | `poblacion` | Ciudadanía *(pospuesto)* |

El municipio se organiza en 5 distritos: Panchimalco, Rosario de Mora, San Marcos, Santiago Texacuangos y Santo Tomás.

---

## 2. Stack y la decisión que lo explica todo

```
Navegador (Vue 3 por CDN, sin build)
      ↓ HTTPS / PostgREST / WebSocket
Supabase (PostgreSQL + PostGIS + Auth + Realtime + Storage)
      ↓
cPanel compartido (estáticos + respaldo histórico de fotos)
```

**El proyecto no tiene proceso de compilación.** No hay Webpack, ni Vite, ni `npm run build`. Los archivos se suben tal cual al cPanel y funcionan.

Esto no es descuido: es la restricción que hace el sistema mantenible por la Gerencia de Tecnología de una alcaldía. Un despliegue es copiar archivos por FTP. No hay una cadena de herramientas que se rompa entre versiones de Node, ni un `node_modules` que alguien deba reproducir en tres años.

**Consecuencias que hay que aceptar:**

- Se usan **ES modules nativos** (`import`/`export`) directamente en el navegador.
- **Nada valida que una plantilla y su componente estén sincronizados.** Si el componente deja de exponer una función que la plantilla invoca, Vue falla en tiempo de ejecución y solo se descubre abriendo esa pantalla. **Al cambiar un `return` de `setup()`, hay que revisar la plantilla a mano.**
- 13 dependencias vienen de CDN externos. Si un CDN cae, esa parte del sistema deja de funcionar. Vendorizarlas está pendiente.

---

## 3. Organización del código

```
assets/
  js/
    core/          app-contexto.js · supabase.js · almacen.js
    stores/        estado compartido (patrón store, similar a Pinia)
    services/      acceso a datos y utilidades de dominio
    components/
      admin/       Centro de Monitoreo
      empleados/   PWA de campo
      shared/      app-root, login, componentes de UI
    utils/
  templates/       plantillas HTML, misma estructura que components/
  css/
database/          schema.sql + 30 migraciones numeradas
docs/              este documento y los de arquitectura
cpanel/            endpoints PHP auxiliares
```

### El patrón componente/plantilla

Cada vista son **dos archivos**:

- `assets/js/components/<sub>/vista-x.js` — la lógica (`setup()`, stores, funciones).
- `assets/templates/<sub>/vista-x.html` — la plantilla.

Se registran juntos en `assets/js/components/index.js`. Un componente nuevo no existe hasta que está en ese índice.

### El patrón store

El estado vive en `assets/js/stores/`. Cada store es un módulo con `ref`/`computed` a nivel de módulo y una función `useX()` que los expone. Al ser módulos ES, **el estado es singleton**: dos componentes que importan el mismo store comparten las mismas referencias.

---

## 4. Aislamiento de contexto — la primera cosa que sorprende

Las tres aplicaciones **corren en el mismo origen**. Sin medidas, iniciar sesión como empleado cerraría la sesión del Centro de Monitoreo en la otra pestaña.

`assets/js/core/app-contexto.js` resuelve el contexto **una sola vez** a partir de la URL, y no importa nada, de modo que se evalúa antes que `supabase.js`. De él salen:

- `CLAVE_SESION` — cada contexto guarda su sesión de Supabase bajo una clave distinta.
- `PREFIJO_ALMACEN` — cada contexto tiene su propio espacio en `localStorage`.

> **Trampa.** `storageKey` en el cliente de Supabase separa la sesión **y también el canal de sincronización entre pestañas**. Si dos contextos comparten la clave, se pisan mutuamente el `onAuthStateChange`.

`assets/js/core/almacen.js` es el adaptador de `localStorage`. Expone `almacen` (con prefijo, para todo lo de la aplicación) y `almacenDispositivo` (sin prefijo, solo para `color-theme`, que lee el script anti-parpadeo del `index.html` antes de que arranque Vue). Maneja JSON corrupto, cuota excedida y el modo privado de Safari.

**Nunca usar `localStorage` directamente.** Siempre a través de `almacen`.

---

## 5. Modelo de datos

27 tablas. Las que importan:

| Tabla | Papel |
|---|---|
| `casos` | El centro del sistema. Denuncias, reportes e intervenciones son todos casos |
| `categorias_caso` | Catálogo. Define el flujo de estados, el departamento responsable y la prioridad |
| `distritos` | Los 5 distritos, con su geometría PostGIS |
| `distritos_perfil` | Población, superficie medida, identidad visual |
| `departamentos` / `direcciones_administrativas` | Organigrama |
| `usuarios` | Perfil institucional. Se enlaza con `auth.users` por UUID |
| `roles` / `permisos_modulos` / `roles_permisos` | Matriz de permisos: rol × módulo × verbo |
| `rol_alcance_datos` / `usuario_ambitos` | **Qué filas** ve cada rol, y las excepciones individuales |
| `cuadrillas` / `cuadrilla_integrantes` | Equipos operativos |
| `historial_estados_caso` | Bitácora del ciclo de vida de cada caso |
| `bitacora_auditoria` | Auditoría inmutable |

### Sobre `casos`

No existe una tabla `intervenciones`. **Una intervención es un caso abierto con responsable asignado.** El indicador `intervenciones_activas` cuenta exactamente eso, y distingue el trabajo en marcha del que sigue esperando asignación — que para una jefatura son dos problemas distintos.

Un caso puede tener padre (`caso_padre_id`): una denuncia puede generar tareas de campo hijas.

La restricción `ck_casos_creador` obliga a que el creador sea **o** un usuario institucional **o** un ciudadano, nunca ambos.

### El flujo de estados

Cada categoría declara su flujo en `estados_flujo` (JSONB). El flujo sembrado por defecto es:

```
pendiente → en_revision → en_obra → resuelta | rechazada
```

`estado_codigo` es **texto libre, no una clave foránea**, porque cada categoría puede tener su propio flujo. Eso da flexibilidad y quita una red de seguridad: nada impide escribir un estado que no exista en el flujo. Ver la sección 9.

---

## 6. Seguridad — RLS, no validación en el cliente

La seguridad **no está en el frontend**. Está en Row Level Security de PostgreSQL. El frontend oculta botones por comodidad; la base de datos es la que niega.

Consecuencia práctica: **una consulta que devuelve cero filas no siempre es un error de la consulta.** Muchas veces es la RLS haciendo su trabajo.

### Las funciones de alcance

```
auth_distritos_visibles()      → smallint[]
auth_departamentos_visibles()  → bigint[]
auth_categorias_visibles()     → bigint[]
auth_tiene_permiso(mod, acc)   → boolean
mi_alcance()                   → jsonb   (RPC que consume el frontend)
```

**Devuelven arrays, no un booleano por fila. Esa es la decisión de rendimiento del modelo.** Permite escribir la policy como:

```sql
distrito_id = any ((select auth_distritos_visibles()))
```

El subselect no está correlacionado con la fila, así que PostgreSQL lo compila como **InitPlan** y lo evalúa **una sola vez por consulta**. Con una función booleana que recibiera columnas de la fila, se ejecutaría N veces y cada ejecución dispararía sus propias subconsultas. Además `= any(array)` sí aprovecha índice B-tree.

### Los nueve roles

`superadmin` · `admin` · `alcalde` · `directivo` · `jefe_distrito` · `jefe_area` · `operador` · `lector` · `empleado`

> ⚠️ `docs/arquitectura/recomendacion_de_mejoras.md` menciona los roles `supervisor`, `cuadrilla` y `solo_lectura`. **Ese documento está desactualizado y esos roles nunca existieron.** La fuente de verdad son las migraciones v11, v12, v13 y v16.

---

## 7. Realtime

`assets/js/stores/denuncias.js` abre un canal sobre la tabla `casos`.

> **Trampa (nos costó una tarde).** Supabase Realtime **exige que la tabla esté en la publicación `supabase_realtime`**. Si no lo está, el canal reporta `SUBSCRIBED` igualmente y no emite nunca un solo evento. No hay error, no hay aviso: silencio. Lo resolvió la migración v19.

> **Trampa 2.** Hay que esperar a `db.auth.getSession()` antes de suscribirse. Si no, el socket arranca con la clave anónima —se ve en la URL del aviso, `"role":"anon"`—, la RLS filtra todo, y milisegundos después el SDK derriba la conexión para reconectar autenticado. Ese era el origen del aviso «WebSocket is closed before the connection is established».

**Deuda conocida:** la suscripción actual hace `cargarDenuncias()` completo ante cualquier evento. Recarga 200 filas en todos los clientes conectados por cada cambio. Hay que pasar a parcheo incremental con un `Map` id→índice.

---

## 8. Migraciones

`database/` contiene `schema.sql` y 29 migraciones numeradas `migration_vN_<tema>.sql`.

**Convenciones obligatorias:**

- **Idempotentes.** `create ... if not exists`, `drop policy if exists` antes de crearla, upserts por código de negocio y no por id.
- **Encabezado explicativo.** Cada migración empieza con un comentario que dice qué problema resuelve, cuál era la causa y por qué esta solución. No es adorno: es lo que permite entender una decisión dos años después.
- **Bloque de verificación al final**, comentado, con las consultas que confirman que la migración hizo lo que dice.
- **Se aplican en orden.** Cada una declara sus requisitos.

> ⚠️ **Cambiar el `RETURNS TABLE` de una función exige `drop function` primero.** Y **añadir un parámetro crea una sobrecarga**, no reemplaza la función: PostgREST resuelve entre sobrecargas de forma impredecible. Siempre borrar antes de recrear.

### Pendiente de aplicar

**`migration_v29_estado_inicial_del_flujo.sql` está escrita y NO se ha ejecutado.** Ver la sección siguiente.

---

## 9. Trampas conocidas

Cada una de estas nos costó tiempo real. Están aquí para que no vuelva a pasar.

### PostgreSQL

**Los DEFAULT de columna se aplican ANTES de los triggers BEFORE INSERT.**
`casos.estado_codigo` tiene `default 'recibida'`, y existe un trigger que debía rellenar el estado desde `categorias_caso.estado_inicial` con la condición `if new.estado_codigo is null`. Nunca se ejecuta: cuando el trigger ve la fila, el default ya la rellenó. El respaldo estaba escrito y era inalcanzable. Resultado: **todo caso levantado en campo nace fuera de su propio flujo** — no lo cuentan los indicadores de activos, sí lo cuenta el de fuera de plazo, y el filtro por estado no lo alcanza nunca.
Lo corrige la v29 quitando el default. Las restricciones `NOT NULL`, en cambio, se comprueban **después** de los triggers, así que la columna puede seguir siendo obligatoria.

**PostgreSQL aplica las policies de SELECT a la salida de `INSERT ... RETURNING`.**
Por eso `crear_caso_campo` tiene que ser `SECURITY DEFINER`: sin eso, el insert funcionaba y el `RETURNING` devolvía vacío.

**Filtrar el lado débil de un LEFT JOIN en el `WHERE` hace desaparecer filas.** El filtro va en el `JOIN` o en una CTE previa.

**No usar `now()` en el predicado de un índice parcial:** no es IMMUTABLE. Filtrar la vigencia dentro de la función.

### PostgREST

**`.single()` devuelve HTTP 406 cuando no hay filas.** Si cero filas es un resultado legítimo, usar `.maybeSingle()`, que devuelve `null`.

**Una columna `geography` se serializa como WKB hexadecimal, no como GeoJSON.** Leer `ubicacion.coordinates[1]` devuelve `undefined`. Hay que usar una vista con `st_y`/`st_x` o decodificar el WKB.

### Leaflet

**Nunca meter un objeto de Leaflet dentro de un `ref` o `reactive` de Vue.** El proxy reactivo rompe los métodos internos y produce `TypeError: ... '_latLngToNewLayerPoint'`. Usar `let` plano o `markRaw`.

**`invalidateSize({pan:false})` ancla la esquina superior izquierda; `pan:true` ancla el centro.** Ninguna de las dos mantiene el contenido quieto cuando lo que se mueve es el borde izquierdo del contenedor —al plegar un panel lateral—. La solución es medir el desplazamiento del contenedor y compensarlo con `panBy`.

### Estadística

**No sumar métricas intensivas.** Densidad (hab/km²) y tasas (casos/1000 hab) son razones: sumarlas no produce nada. Solo las métricas aditivas admiten «cuota del total». Rotular un «% del total» sobre una densidad produce números con aspecto de dato y sin significado.

### Entorno de trabajo

`core.autocrlf=true` junto a la sincronización bidireccional de MEGA produce archivos que difieren **solo en los finales de línea**. Al resolver conflictos, comparar con `l.replace(/\r$/,'')`.

---

## 10. Convenciones de código

- **Nombres en español** para funciones, clases, variables y constantes. El equipo que mantendrá esto es salvadoreño; la legibilidad en el idioma de trabajo pesa más que la costumbre.
- **Comentarios que explican el porqué, no el qué.** El código ya dice qué hace. El comentario existe para la decisión que no es evidente.
- **Sin datos de ejemplo en producción.** Un distrito sin dato muestra «sin dato», nunca un cero fabricado.
- **Complejidad consciente.** Mapas para búsquedas O(1) en lugar de recorrer arrays; paginación por cursor en lugar de `OFFSET`.

---

## 11. Restricciones del plan gratuito

Están detalladas en [`../arquitectura/CONTEXTO_CRITICO.md`](../arquitectura/CONTEXTO_CRITICO.md). Lo imprescindible:

| Límite | Regla que impone |
|---|---|
| BD 500 MB | Purga periódica de la bitácora. **Prohibido guardar Base64 en Postgres** |
| Storage 1 GB | Comprimir en el navegador a 1024×1024, JPEG 0.6, ≤500 KB. Traspaso a cPanel |
| Pausa a los 7 días sin tráfico | Programar acceso durante asuetos |
| Sin respaldos automáticos | `pg_dump` semanal |
| 200 conexiones Realtime | Suficiente para el personal operativo |

**Prohibido `OFFSET` en listados.** Paginación por cursor: `where id > ultimo_visto limit 20`.

---

## 12. Estado del trabajo

Los bloques 0 a 5 se cerraron entre el 11 y el 12 de agosto de 2026, y con ellos los ocho requisitos que planteó la Alcaldía.

| Bloque | Qué aportó | Migración |
|---|---|---|
| 0 | El estado inicial sale del flujo de la categoría, no de un literal | **v29** |
| 1 | Cuadrillas y su composición | — solo frontend |
| 2 | Asignar responsable/cuadrilla y mover el caso por su flujo | **v30** |
| 3 | Cada jefatura gestiona su catálogo de atenciones | — solo frontend |
| 4 | Fotografías a cPanel y Realtime incremental | — |
| 5 | Documentación al día | — |

### Archivos que nacieron en esos bloques

```
database/migration_v29_estado_inicial_del_flujo.sql
database/migration_v30_gestion_de_caso.sql
assets/js/stores/cuadrillas.js
assets/js/stores/gestion-casos.js
assets/js/stores/catalogo-categorias.js
assets/js/services/evidencias.js
assets/js/components/admin/vista-cuadrillas.js      (+ plantilla)
assets/js/components/admin/vista-catalogo.js        (+ plantilla)
cpanel/subir_evidencia.php
cpanel/jwt-monitoreo.php
cpanel/config-monitoreo.example.php
cpanel/api-monitoreo.htaccess
.cpanel.yml · .htaccess · .gitattributes
```

### Deuda viva

| Asunto | Detalle |
|---|---|
| **Tope de 200 casos** | `cargarDenuncias()` sigue limitado. `hayMasCasos` ya lo expone, pero **ninguna vista lo muestra todavía**: los indicadores se quedarían cortos sin avisar. La solución de fondo es paginación por cursor o filtro por período |
| **`vista-mi-perfil-empleado.js`** | Última pantalla con datos simulados |
| **`markRaw`** | Pendiente en 4 archivos con objetos de Leaflet |
| **Fotos huérfanas** | Una foto se sube antes de que exista el caso; un formulario abandonado deja el archivo sin fila en `casos_adjuntos`. Sin limpieza automática todavía |
| **Fotos y buzón offline** | No viajan juntas: `localStorage` solo guarda texto y dos fotos en base64 son ~1,4 MB de los ~5 MB disponibles |
| **13 dependencias de CDN** | Sin vendorizar |
| **Tres esquemas divergentes** | En `database/` |
| **Límite por hora** | Se consume también en subidas rechazadas por formato |

---

## 12 bis. Lo que enseñó el despliegue real

Nada de esto estaba en la documentación de arquitectura, y todo costó tiempo. Va aquí porque quien mantenga el sistema se lo va a encontrar.

### El hosting no es el que suponía la documentación

| Suposición | Realidad |
|---|---|
| PHP 8.x | **PHP 7.4.33**. `match` y los tipos unión son un error de análisis: 500 en blanco |
| Extensiones habituales | **Sin `fileinfo` ni `exif`** de fábrica |
| `Authorization` llega a PHP | **Apache la descarta** con PHP en CGI/FastCGI |
| Raíz del subdominio separada del repositorio | **La raíz ES el clon de git** |

### Supabase migró a JWT Signing Keys

El proyecto firma con **ES256**, no con HS256. El «JWT Secret» heredado ya no sirve para verificar los tokens nuevos.

`cpanel/jwt-monitoreo.php` valida la firma asimétrica contra el JWKS del proyecto
(`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), con caché en disco de 6 horas y
refresco forzado —como mucho uno por minuto— cuando aparece un `kid` desconocido.

**Es mejor que lo anterior:** el servidor guarda solo la clave pública. Puede comprobar
tokens y no puede fabricarlos. Con HS256 tenía el mismo secreto con el que se firman.

### La cabecera propia

Como Apache descarta `Authorization`, el token viaja **además** en `X-Monitoreo-Token`,
que sí pasa intacta. El servidor acepta la primera que llegue. Las reglas de reescritura
del `.htaccess` no bastaron; `CGIPassAuth On` queda comentado porque exige Apache 2.4.13+
y no se pudo confirmar la versión.

### Despliegue

La raíz del subdominio es el clon del repositorio, así que:

- **Todo el repositorio se servía por HTTP.** `/database/schema.sql`, `/docs/` y una
  segunda copia de los endpoints en `/cpanel/` eran públicos. Lo cierra el `.htaccess`
  de la raíz.
- **Editar archivos en el servidor deja la copia de trabajo sucia** y el siguiente
  «Update from Remote» aborta. Ver el runbook: [`../despliegue-produccion.md`](../despliegue-produccion.md).
- `.cpanel.yml` copia los endpoints de `cpanel/` a `api-monitoreo/` en el despliegue.
  **`config-monitoreo.php` no está en el repositorio** y no se toca nunca.

### Dos fallos propios que conviene recordar

**Un `FormData` con un DataURL no envía un archivo.** `FormData.append(campo, valor, nombre)`
ignora el tercer argumento cuando `valor` es una cadena: viaja como campo de texto y
`$_FILES` llega vacío. Por eso `utils/image-compressor.js` tiene tres salidas separadas
y documentadas.

**Probar solo los caminos de rechazo no prueba nada.** Un fallo en `subir_evidencia.php`
—una variable que se perdió al refactorizar— solo se manifestaba con un token *válido*.
Los sondeos con token falso daban todo en verde. La prueba que lo cazó fue montar el
sitio completo en local, firmar un token real y subir una imagen real, con un PHP
configurado igual que el del servidor.

---

## 13. Antes de tocar código

1. Leer los documentos de `docs/` relevantes al módulo. **Si `docs/` contradice una solución estándar, manda `docs/`.**
2. Consultar el grafo de `graphify` antes de una refactorización que cruce módulos.
3. Verificar que el cambio no rompa acoplamientos adyacentes.
4. Si se toca el `return` de un `setup()`, **revisar la plantilla**.
5. Si se toca la base de datos, **escribir una migración**, no editar `schema.sql`.

### Sobre los documentos de `docs/arquitectura/`

Son **históricos**: explican por qué se eligió esta arquitectura, no cómo está construida
hoy. Llevan aviso de vigencia desde agosto de 2026. Dos avisos que conviene no olvidar:

- `recomendacion_de_mejoras.md` proponía roles (`supervisor`, `cuadrilla`, `solo_lectura`)
  que nunca existieron.
- `ANALISIS_PROFUNDO_LIMITANTES_VIABILIDAD_REAL.md` §9 trae un SQL de propuesta que
  difiere del implementado.

**La fuente de verdad del modelo de datos es `database/schema.sql` y sus migraciones.**
La del procedimiento de despliegue, [`../despliegue-produccion.md`](../despliegue-produccion.md).

---

## Documentos relacionados

- [`01-DIRECCION_Y_TOMA_DE_DECISIONES.md`](01-DIRECCION_Y_TOMA_DE_DECISIONES.md) — propósito y estado para dirección.
- [`03-PERSONAL_DE_CAMPO.md`](03-PERSONAL_DE_CAMPO.md) — manual del empleado en territorio.
- [`../arquitectura/CONTEXTO_CRITICO.md`](../arquitectura/CONTEXTO_CRITICO.md) — límites del plan gratuito.
- [`../despliegue.md`](../despliegue.md) — guía de despliegue.
- `DOCUMENTACION_TECNICA.md` (raíz) — detalle exhaustivo por módulo.
