# Despliegue en producción — procedimiento

> **Para:** Gerencia de Tecnología.
> **Entorno:** `monitoreo.sansalvadorsur.gob.sv` · cPanel compartido · PHP 7.4 · Supabase.
> **Última revisión:** 12 de agosto de 2026.

Este documento existe porque el primer despliegue costó once rondas de subidas manuales. Todo lo que aprendimos cabe aquí.

Para la guía de instalación desde cero está [`despliegue.md`](despliegue.md). Esto es el procedimiento del día a día.

---

## 1. Lo primero que hay que entender

**La raíz del subdominio ES un clon del repositorio de GitHub.**

```
/home/sansalva/public_html/monitoreo.sansalvadorsur.gob.sv/   ← clon de git
```

De ahí se derivan las tres reglas de las que depende todo lo demás:

1. **No se editan archivos en el servidor.** Cualquier cambio manual dentro del clon deja la copia de trabajo sucia, y el siguiente «Update from Remote» aborta.
2. **Se despliega haciendo push a GitHub** y luego pulsando dos botones en cPanel.
3. **Lo que está en el repositorio se sirve por HTTP** salvo que el `.htaccess` de la raíz lo impida. Por eso ese archivo existe.

---

## 2. El procedimiento normal

### En el equipo de desarrollo

```bash
git add -A
git commit -m "Versión 1.1.x — descripción"
git push origin main
```

### En cPanel → Git Version Control → Manage → «Pull or Deploy»

| Paso | Botón | Qué hace |
|---|---|---|
| 1 | **Update from Remote** | Trae el commit. Con él se despliega el frontend entero |
| 2 | **Deploy HEAD Commit** | Ejecuta `.cpanel.yml`: copia los endpoints de `cpanel/` a `api-monitoreo/` y refresca los `.htaccess` |

El paso 2 **no toca** `config-monitoreo.php` —no está en el repositorio— ni el contenido de `uploads-monitoreo/`.

Los dos botones exigen que la copia de trabajo esté limpia.

---

## 3. Qué vive dónde

```
/home/sansalva/
├── monitoreo-privado/                       ← FUERA de la web
│   ├── cache/jwks.json                        claves públicas de Supabase
│   └── contadores/*.cnt                       límite de subidas por hora
└── public_html/
    ├── api/                                 ← OTRO sistema · no tocar
    └── monitoreo.sansalvadorsur.gob.sv/     ← el clon
        ├── .htaccess                          cierra lo que no es web
        ├── .cpanel.yml                        tareas de despliegue
        ├── index.html · assets/ · sw.js       el frontend
        ├── cpanel/                            ORIGEN de los endpoints
        ├── api-monitoreo/                     endpoints VIVOS
        │   ├── config-monitoreo.php           ⚠ SOLO en el servidor
        │   ├── jwt-monitoreo.php
        │   ├── subir_evidencia.php
        │   └── subir_foto_perfil.php
        └── uploads-monitoreo/
            ├── evidencias/AAAA/MM/
            └── perfiles/
```

**`cpanel/` y `api-monitoreo/` se confunden con facilidad.** La primera es código fuente versionado; la segunda es lo que se ejecuta. El despliegue copia de la primera a la segunda.

### El único archivo que se mantiene a mano

`api-monitoreo/config-monitoreo.php`. Está en `.gitignore` a propósito: si viajara en el repositorio, cada despliegue lo sobrescribiría y habría que reponer la configuración. Ya ocurrió antes de separarlo.

Se crea copiando [`../cpanel/config-monitoreo.example.php`](../cpanel/config-monitoreo.example.php). **Con la configuración actual no contiene ningún secreto**: los tokens se verifican con la clave pública de Supabase.

---

## 4. Cuando «Update from Remote» aborta

El mensaje típico:

```
error: Your local changes to the following files would be overwritten by merge
error: The following untracked working tree files would be overwritten by merge
```

Significa que alguien editó o subió archivos dentro del clon. Hay que devolver la copia de trabajo a un estado limpio.

### Con Terminal (cPanel → Avanzado → Terminal)

```bash
cd /home/sansalva/public_html/monitoreo.sansalvadorsur.gob.sv
git checkout -- <archivos modificados>
rm -f <archivos no rastreados que estorban>
git pull
```

> ⚠ **Rutas explícitas siempre.** Nada de `git clean -fd` ni `git reset --hard`: se llevarían por delante `api-monitoreo/` y las fotografías de `uploads-monitoreo/`, que no están en el repositorio.

### Sin Terminal, solo Administrador de archivos

El mensaje distingue dos grupos, y se tratan distinto:

| El mensaje dice | Qué hacer |
|---|---|
| *«Your local changes… would be overwritten»* (archivos **rastreados**) | **Borrarlos.** Un archivo rastreado que falta NO bloquea el merge: git lo recrea con la versión nueva. Comprobado |
| *«untracked working tree files»* (archivos **nuevos**) | **Borrarlos.** No están en el repositorio, así que no se pierde nada versionado |

Después, «Update from Remote».

> Para ver los `.htaccess` y demás archivos que empiezan por punto: **Settings → Show Hidden Files (dotfiles)**.

---

## 5. El entorno real, y en qué se aparta de lo esperado

| | |
|---|---|
| **PHP** | **7.4.33**, no 8.x. `match` y los tipos unión son un error de análisis: 500 en blanco, sin mensaje |
| **`gd`** | Activa · imprescindible |
| **`fileinfo`** | Activada después; el código funciona sin ella con `getimagesize` |
| **`exif`** | Activada después. Sin ella, las fotos verticales se guardan giradas 90° |
| **`Authorization`** | **Apache la descarta** con PHP en CGI/FastCGI. Por eso el token viaja también en `X-Monitoreo-Token` |
| **Apache** | Oculta su versión. `CGIPassAuth On` queda comentado en el `.htaccess` porque exige 2.4.13+ |

Al cambiar de plan de hosting o de versión de PHP, **repasar esta tabla**: son las suposiciones que ya fallaron una vez.

---

## 6. Comprobaciones tras cada despliegue

Todas por navegador, sin herramientas.

### Debe estar cerrado — 403 o 404

```
/database/schema.sql
/docs/contexto/02-EQUIPO_TECNICO.md
/cpanel/subir_evidencia.php
/.cpanel.yml
/.git/config
```

Si `/database/schema.sql` devuelve 200, el `.htaccess` de la raíz no se aplicó: el modelo de datos y las policies estarían públicos.

### Debe responder — 200

```
/
/sw.js
/assets/js/services/evidencias.js
```

### Los endpoints

Abrir en el navegador:

```
/api-monitoreo/subir_evidencia.php
/api-monitoreo/subir_foto_perfil.php
```

Los dos deben devolver `{"error":"Método no permitido."}`. Ese JSON confirma tres cosas de una vez: PHP se ejecuta, el archivo está donde debe, y encontró su configuración.

| Otra respuesta | Significa |
|---|---|
| `Falta config-monitoreo.php…` | Falta crear ese archivo en `api-monitoreo/` |
| 500 en blanco | Error fatal de PHP. **Mirar `error_log`** |
| Se descarga el código | PHP no se ejecuta en esa carpeta |

### Prueba con sesión real

La única que ejercita el camino completo. En la aplicación, con sesión iniciada, consola del navegador:

```js
const API = 'https://monitoreo.sansalvadorsur.gob.sv/api-monitoreo/subir_evidencia.php';
const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
const x = c.getContext('2d');
x.fillStyle = '#0a7'; x.fillRect(0, 0, 900, 1200);
const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
const clave = localStorage.getItem('sb-sssur-monitoreo') ? 'sb-sssur-monitoreo' : 'sb-sssur-empleados';
const t = JSON.parse(localStorage.getItem(clave)).access_token;
const fd = new FormData(); fd.append('foto', blob, 'prueba.jpg');
const r = await fetch(API, { method: 'POST', headers: { 'X-Monitoreo-Token': t }, body: fd });
console.log(r.status, await r.text());
```

Debe devolver `200` con la URL de la imagen. Borrar la foto de prueba después.

> Chrome pide escribir `allow pasting` en la consola la primera vez.

---

## 7. `error_log` — el mejor diagnóstico disponible

cPanel deja un `error_log` en la carpeta donde falla un script: `api-monitoreo/error_log`.

**Acertó tres de tres** donde los sondeos externos daban todo en verde, porque muchos fallos solo aparecen con un token válido y desde fuera no se puede distinguir un 401 de otro.

Se lee con **Administrador de archivos → clic derecho → View**. También en **cPanel → Metrics → Errors**.

Conviene borrarlo tras resolver cada incidencia: así lo siguiente que aparezca es nuevo.

No se sirve por HTTP —lo bloquea el `.htaccess` de `api-monitoreo/`— y no debe servirse: publica rutas absolutas y trazas internas.

---

## 8. Base de datos

Las migraciones **no** se aplican solas con el despliegue. Van aparte, en **Supabase → SQL Editor**, pegando el archivo completo de `database/`.

Reglas:

- Se aplican **en orden**. Cada una declara sus requisitos en la cabecera.
- Son **idempotentes**: repetir una no rompe nada.
- Cada una trae al final un **bloque de verificación** comentado. Ejecutarlo.

> Las consultas de verificación que llaman a una RPC fallarán con «Sesión no válida»: el editor SQL no tiene `auth.uid()`. Es la función defendiéndose. Esas rutas se prueban desde la aplicación.

Última aplicada: **v30** (`migration_v30_gestion_de_caso.sql`).

---

## 9. Antes de tocar nada

- **Pausar la sincronización de MEGA** en el equipo de desarrollo. Ha revertido cambios en pleno trabajo más de una vez, y se descubre cuando ya se subió la versión vieja.
- Comprobar que `git status` está limpio antes del push.
- Nunca commitear `cpanel/config-monitoreo.php`.

---

## Documentos relacionados

- [`despliegue.md`](despliegue.md) — instalación desde cero.
- [`contexto/02-EQUIPO_TECNICO.md`](contexto/02-EQUIPO_TECNICO.md) — arquitectura y trampas conocidas.
- [`arquitectura/CONTEXTO_CRITICO.md`](arquitectura/CONTEXTO_CRITICO.md) — límites del plan gratuito de Supabase.
