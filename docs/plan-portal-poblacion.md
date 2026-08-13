# Plan — Portal de Población y módulo de Comunicados

> Base: commit `70e7a30` (versión 1.1.7).
> Todo lo que se afirma aquí sobre el estado actual está verificado contra el
> código y contra `database/`, no supuesto.
>
> **Avance**
> - Decidido: registro con **correo y contraseña**; **cuenta siempre
>   obligatoria**, y «anónima» pasa a significar que el operador no ve el
>   nombre del denunciante.
> - Hecho antes de empezar: el panel «Incidentes Prioritarios» ya no se calcula
>   sobre los 200 casos más recientes, y la lista avisa cuando está recortada.
> - **Bloque 1 · v32 identidad ciudadana** — aplicada y verificada.
> - **Bloque 2 · registro y sesión reales** — hecho. El correo sale por el SMTP
>   institucional de cPanel, no por el de Supabase.
> - **v33 catálogo público** — la pantalla de registro consulta como `anon` y la
>   RLS le ocultaba los distritos. Pendiente de aplicar.
> - Bloques 3-9 — pendientes. **Ojo con la numeración**: la v33 se consumió con
>   el arreglo del catálogo, así que el alta de denuncias pasa a ser la **v34** y
>   los comunicados la **v35**.

---

## 0. Punto de partida

### 0.1 Lo que hay en el navegador

Ocho vistas, **ninguna llama a Supabase**. Ni una sola vez. Todo vive en ocho
claves de `localStorage`.

| Vista | Líneas | Qué hace hoy | Dónde guarda |
|---|---:|---|---|
| `vista-registro-poblacion` | 395 | Formulario de 9 campos. **No crea cuenta**: `signUp` aparece cero veces | `ciudadano_datos` |
| `vista-pwa-poblacion` | 73 | Portada del portal | — |
| `vista-crear-denuncia` | 713 | Asistente de 3 pasos: categoría → ubicación en mapa → descripción y fotos. Incluye casilla «anónima» | `denuncias_poblacion` |
| `vista-mis-denuncias` | 109 | Lista el arreglo local, con paginación | lee la misma clave |
| `vista-detalle-denuncia` | 96 | Ficha de una denuncia | ídem |
| `vista-mapa-distrito` | 312 | Mapa con las denuncias propias y filtro por radio | ídem |
| `vista-noticias` | 236 | Lee `utils/noticias-demo.js`, **cuatro noticias escritas a mano** | ninguna |
| `vista-mi-perfil-poblacion` | 189 | Muestra lo que se escribió en el registro | `ciudadano_datos` |

Consecuencia operativa: **una denuncia ciudadana no llega al Centro de
Monitoreo.** Se queda en el teléfono de quien la puso y desaparece si borra los
datos del navegador.

Y la sesión es ficticia: `ciudadano_autenticado` es un booleano en
`localStorage` que cualquiera pone a `true` desde la consola del navegador.

### 0.2 Lo que ya está listo en la base

Más de lo que parece:

- **`ciudadanos`** — tabla con sus cuatro policies desde la v10
  (`select`/`insert`/`update` propio, `delete` solo admin).
- **`casos.creado_por_ciudadano_id`** — con un CHECK que impide que un caso
  tenga a la vez autor empleado y autor ciudadano.
- **`canales_reporte` id 4 = `portal_ciudadano`** — sembrado en la v11.
- **`noticias` y `noticias_distritos`** — con relación a distritos, trazado
  geográfico e imagen.
- **El endpoint de fotos en cPanel** ya funciona en producción, verifica el JWT
  de Supabase contra el JWKS y limita subidas por hora.

### 0.3 Los tres huecos

**1 · No existe la identidad del ciudadano.** Sin fila en `auth.users` no hay
`auth.uid()`, y sin `auth.uid()` ninguna regla de RLS puede funcionar. Es la
pieza de base: todo lo demás depende de ella.

**2 · La RLS vigente deja ciego al ciudadano.** La `casos_select` de la v18
tiene una rama de autoría, pero compara contra `creado_por_usuario_id` —la
columna de *empleados*— y está dentro de `auth_tiene_permiso('casos','ver')`,
que lee `from public.usuarios where id = auth.uid()`.

Un ciudadano no tiene fila en `usuarios`. `bool_or` sobre cero filas devuelve
NULL, el `coalesce(...,false)` lo vuelve falso, y el resultado es que **no
vería ni sus propias denuncias**. `casos_insert` tiene el mismo problema: no
podría ni crearlas.

**3 · No hay RPC de alta ciudadana.** Existe `crear_caso_campo` para
empleados, y no sirve tal cual: deja elegir canal y adjuntos, cosas que un
ciudadano no debe decidir.

Esto no fue un olvido. El propio `schema.sql` lo dejó anotado:

> *«Si se aprueba el portal ciudadano, agregar políticas de RLS para ciudadanos
> que solo pueden ver sus propios casos.»*

Se construyó la interfaz por delante de esa aprobación.

---

## 1. Comunicados: la decisión de fondo

Es el punto que planteaste, y condiciona el resto.

### 1.1 El problema real: dos tablas que se solapan

Hoy conviven dos cosas parecidas y ninguna hace lo que necesitas:

| | `notificaciones` (v5) | `noticias` (v4) |
|---|---|---|
| Para quién | un usuario concreto (`usuario_id`) | el portal ciudadano |
| Quién la escribe | el sistema, y también un admin a mano | la alcaldía |
| Marca de leída | `leida` en la propia fila | no tiene |
| Distritos | no | sí, con tabla puente |
| Mapa e imagen | no | sí, trazado y `imagen_url` |
| Módulo en el Centro de Monitoreo | sí | **no existe** |
| **Audiencia** | **no existe** | **no existe** |

Ninguna de las dos puede expresar «esto es para empleados» ni «esto es solo
para el Centro de Monitoreo». Y la policy actual de `noticias` es
`select ... using (activa = true)` para cualquier autenticado: hoy **un
ciudadano vería también los avisos internos** en cuanto se conecte de verdad.

### 1.2 La separación que propongo

No unificarlas. Son dos cosas legítimamente distintas, y mezclarlas es lo que
crea el lío:

- **`noticias` → editorial.** Alguien la escribe y decide publicarla. Tiene
  título, cuerpo, imagen, vigencia y **audiencia**. Es lo que tú llamas
  «notificaciones que emite la municipalidad».
- **`notificaciones` → transaccional.** La genera el sistema: «se te asignó el
  caso #412», «tu denuncia cambió de estado». Va dirigida a una persona y no
  se «publica».

El módulo nuevo del Centro de Monitoreo trabaja sobre `noticias`. En la
interfaz conviene llamarlo **«Comunicados»** y no «Noticias», justamente para
que nadie lo confunda con la campana de notificaciones que ya existe.

### 1.3 El eje de audiencia

Una columna `audiencias text[]` sobre `noticias`, con tres valores:

| Valor | Quién lo ve | Dónde aparece |
|---|---|---|
| `publico` | ciudadanos | PWA Población → «Noticias» |
| `empleados` | personal de campo | PWA Campo → «Notificaciones» |
| `interno` | usuarios del Centro de Monitoreo | panel web |

**Un arreglo y no un solo valor**, porque los casos reales son mixtos: un
cierre de vía por fiestas patronales le importa al vecino *y* a la cuadrilla
que tiene que rodear la zona. Con un único valor habría que publicar el mismo
aviso dos veces y mantenerlos sincronizados a mano.

Se combina con los distritos que ya existen: audiencia responde *a qué
público*, `noticias_distritos` responde *en qué territorio*. Sin distritos
asociados, el comunicado es municipal.

### 1.4 Cómo se traduce a RLS

Hace falta un ayudante que hoy no existe:

```sql
create or replace function public.auth_es_ciudadano() returns boolean
language sql stable security definer parallel safe set search_path = public as $$
    select exists (select 1 from public.ciudadanos where id = auth.uid());
$$;
```

Y la policy pasa a ramificar por tipo de solicitante:

```sql
activa = true
and (fecha_publicacion is null or fecha_publicacion <= now())
and (fecha_expiracion  is null or fecha_expiracion  >  now())
and (
        'publico' = any (audiencias)
     or ('empleados' = any (audiencias) and not (select public.auth_es_ciudadano()))
     or ('interno'   = any (audiencias)
         and coalesce((select public.auth_tiene_permiso('noticias','ver')), false))
)
```

Tres detalles que no son cosméticos:

- **`(select ...)`** envolviendo cada función. Sin el subselect, PostgreSQL la
  evalúa una vez por fila; con él la compila como InitPlan y la ejecuta una
  sola vez por consulta. Es el mismo criterio que ya sigue la v16.
- **`coalesce(..., false)`** sobre `auth_tiene_permiso`. Devuelve NULL cuando
  el solicitante no está en `usuarios`, y un NULL en un `or` no deniega: deja
  la expresión indeterminada. Hoy la RLS acierta por casualidad, no por diseño.
- **La rama `empleados` se define por negación** (`not es_ciudadano`) y no por
  pertenencia a `usuarios`, para que un empleado sin permisos de módulo siga
  recibiendo los avisos que le tocan.

### 1.5 Marca de leído

Tabla aparte, no una columna:

```sql
create table public.noticias_lecturas (
    noticia_id bigint not null references public.noticias(id) on delete cascade,
    lector_id  uuid   not null,          -- auth.uid(); puede ser usuario o ciudadano
    leida_at   timestamptz not null default now(),
    primary key (noticia_id, lector_id)
);
```

`lector_id` **sin clave foránea a propósito**: apunta a `auth.users`, que puede
ser un empleado o un ciudadano, y una FK solo puede apuntar a una tabla. La
integridad la da el `on delete cascade` de `auth.users` si algún día se borra
una cuenta.

Esto arregla de paso el contador del menú inferior, que hoy cuenta sobre el
arreglo de demostración.

### 1.6 El módulo en el Centro de Monitoreo

`assets/js/components/admin/vista-comunicados.js` + su plantilla, siguiendo el
patrón de `vista-notificaciones.js`, que ya resuelve filtros, alta, borrado y
Realtime.

El editor necesita, como mínimo: título, categoría con color e icono, cuerpo,
**selector de audiencias con casillas**, selector de distritos, imagen,
vigencia (desde/hasta) y una **vista previa por audiencia** — poder ver cómo
le queda al ciudadano antes de publicar, porque un comunicado mal dirigido no
se puede «despublicar» de la memoria de quien ya lo leyó.

Registrar `noticias` en `permisos_modulos` y sembrar `roles_permisos`. Hoy la
tabla no está declarada como módulo, así que `auth_tiene_permiso('noticias',…)`
devolvería NULL para todo el mundo.

---

## 2. Migraciones

Tres, en este orden. Cada una idempotente y verificable por separado, siguiendo
el patrón de la v13 (upsert por código + bloque `do $$` con `raise warning`).

### v32 — Identidad ciudadana

**Es la migración de base. Sin ella las otras dos no se sostienen.**

**2.1 Completar `ciudadanos`.** El formulario de registro recoge nueve campos y
la tabla tiene cinco. Faltan `fecha_nacimiento`, `genero`, `direccion` y
`foto_url`. El correo **no se duplica**: vive en `auth.users.email`, que es la
fuente de verdad, y se expone por vista.

**2.2 Alta de la cuenta.** Trigger `on auth.users` que crea la fila en
`ciudadanos` leyendo `raw_user_meta_data`, que es el patrón estándar de
Supabase. La alternativa —un RPC llamado después del `signUp`— deja una ventana
en la que existe la cuenta pero no el perfil, y esa ventana es justo donde
fallan las cosas.

El trigger debe distinguir al ciudadano del empleado: solo crea fila si el
metadato dice que el alta viene del portal. Si no, cualquier alta de personal
crearía también un ciudadano fantasma.

**2.3 DUI duplicado.** `dui text unique` ya está. Hay que traducir la violación
de restricción a un mensaje legible; si no, al vecino le sale un error crudo de
PostgreSQL.

**2.4 Congelar el perfil propio.** El mismo mecanismo de la v31, por la misma
razón —**la RLS controla filas, no columnas**—: `activo` y `dui` no los toca el
ciudadano. `nombres` y `apellidos` tampoco, si el DUI se considera verificado.
Teléfono, dirección, distrito y foto sí, porque la gente se muda y cambia de
número.

Nombrar el trigger con prefijo alfabético (`a_trg_…`) para que corra antes que
el de `updated_at`, como en la v31.

**2.5 Ayudantes.** `auth_es_ciudadano()` y `auth_ciudadano_distrito()`.

### v33 — Alta y seguimiento de denuncias ciudadanas

**3.1 `categorias_caso.visible_ciudadano boolean default false`.** No todas las
categorías internas deben ofrecerse al público. Por defecto **falso**: se elige
explícitamente qué se abre, en vez de exponer todo y tener que ir cerrando.

Esto además cierra un desajuste que ya existe: el portal ofrece **27 categorías
escritas a mano** en `assets/js/utils/categorias-denuncias.js`, cuyos ids no
tienen ninguna relación con los de `categorias_caso`. Hoy no importa porque
nada se guarda; en cuanto se guarde, importaría mucho.

**3.2 `crear_caso_ciudadano(...)`.** `SECURITY DEFINER`, por la misma razón
documentada en `crear_caso_campo`: PostgreSQL aplica las policies de SELECT a
la salida de `INSERT … RETURNING`, y el caso recién creado no pasaría la policy
de lectura de su propio autor.

Diferencias respecto a la versión de campo:

- Canal forzado a `portal_ciudadano`. No es parámetro.
- **No admite prioridad ni departamento.** Salen de la categoría. Un ciudadano
  no clasifica la urgencia de su propio reporte.
- Solo acepta categorías con `visible_ciudadano = true`.
- Fija `creado_por_ciudadano_id = auth.uid()` y deja
  `creado_por_usuario_id` nulo, como exige el CHECK.
- **Tope diario por ciudadano.** Un formulario público sin límite es una
  invitación al abuso. Un `count` sobre las últimas 24 h dentro de la misma
  función.

El estado inicial lo pone el trigger `sincronizar_campos_caso` de la v29: no
hay que tocarlo.

**3.3 Rama ciudadana en `casos_select`.** Reproducir la policy de la v18 tal
cual y añadir **una** rama, **fuera** del `auth_tiene_permiso`, porque el
ciudadano nunca lo va a satisfacer:

```sql
or creado_por_ciudadano_id = (select auth.uid())
```

**3.4 No se toca `casos_insert`.** Que siga denegando al ciudadano es lo
correcto: obliga a que toda alta pase por el RPC, que es donde viven las
validaciones y el tope diario. Si se abriera el INSERT directo, el tope se
podría saltar desde la consola del navegador.

**3.5 Vista `v_mis_denuncias_ciudadano`** con `security_invoker = on`. El
ciudadano **no debe ver** `observaciones_internas`, ni el nombre del empleado
asignado, ni las derivaciones entre departamentos. Ve: estado, fecha,
categoría, ubicación, sus propias fotos y la resolución final cuando la haya.

Esto es una decisión de privacidad del personal, no solo de limpieza.

**3.6 Adjuntos.** `casos_adjuntos` hereda el alcance de `casos` por su policy
`exists (select 1 from casos …)`, que la v14 ya dejó bien planteada. **No hay
que tocarla** — hereda la rama nueva gratis.

### v34 — Comunicados

Lo descrito en la sección 1: `audiencias`, vigencia, `noticias_lecturas`, la
policy nueva, y el registro en `permisos_modulos` + `roles_permisos`.

Sembrar `audiencias = '{publico}'` en las filas existentes, para que lo ya
publicado no cambie de comportamiento al migrar.

---

## 3. Trabajo en el navegador

### 3.1 Piezas nuevas transversales

| Archivo | Responsabilidad |
|---|---|
| `stores/sesion-ciudadano.js` | `signUp`, `signIn`, `signOut`, recuperación de contraseña, perfil vigente |
| `stores/comunicados.js` | Lectura filtrada por audiencia, marca de leído, contador real |
| `stores/denuncias-ciudadano.js` | Alta por RPC, listado propio, Realtime del propio caso |
| `services/catalogo-publico.js` | Categorías con `visible_ciudadano`, sustituye el arreglo de 27 |

### 3.2 Vista por vista

**Registro** — `signUp` real con los metadatos del perfil. Confirmación por
correo, validación de DUI con su dígito verificador, y mensaje claro cuando el
DUI ya existe. Hoy son 395 líneas que terminan en un `setItem`.

**Portada** — resumen real: mis denuncias abiertas, comunicados sin leer de mi
distrito.

**Crear denuncia** — mantener el asistente de 3 pasos, que está bien resuelto.
Cambian tres cosas: las categorías salen del catálogo real; el envío llama al
RPC; y las fotos van por el endpoint de cPanel **que ya funciona**, reusando
`fotos-perfil.js` con la corrección del `FormData` —el DataURL como tercer
argumento se ignora y el archivo llega vacío—.

Añadir estado de envío y reintento: el vecino puede estar en zona sin cobertura.

**Mis denuncias / Detalle** — leer de `v_mis_denuncias_ciudadano`, con
paginación por cursor y Realtime acotado a los casos propios.

**Mapa de distrito** — las denuncias propias sobre el mapa. Aplicar aquí desde
el principio lo aprendido en la PWA de campo: `L.canvas()` y umbral de zoom
para las colonias, y `let` plano para los objetos de Leaflet, **nunca** un
`ref` —es el error que ya produjo el `TypeError: … '_latLngToNewLayerPoint'`—.

**Noticias** — pasa a leer comunicados con audiencia `publico`, filtrados por
distrito, con marca de leído.

**Mi perfil** — misma política que la PWA de campo, adaptada: el ciudadano sí
puede cambiar teléfono, dirección, distrito y foto; nombres y DUI no.

### 3.3 Tema oscuro

El portal de Población tampoco tiene una sola clase `dark:`. `pwa-oscuro.css`
está acotado a `[data-contexto="empleados"]`; hay que extenderlo a
`poblacion`. Es barato ahora y caro después.

---

## 4. Orden propuesto

| # | Bloque | Depende de | Verificable con |
|---|---|---|---|
| 1 | v32 identidad | — | Un ciudadano se registra y aparece en `ciudadanos` |
| 2 | Registro y sesión reales | 1 | Cerrar y abrir la aplicación mantiene la sesión |
| 3 | v33 alta y RLS | 1 | Una denuncia del portal aparece en el Centro de Monitoreo |
| 4 | Crear denuncia + fotos | 3 | La foto se ve en el panel del operador |
| 5 | Mis denuncias, detalle, mapa | 3 | El ciudadano ve su caso y su cambio de estado |
| 6 | v34 comunicados | — | Un aviso `interno` **no** se ve desde el portal |
| 7 | Módulo Comunicados en el panel | 6 | Publicar con vista previa por audiencia |
| 8 | Noticias del portal | 6 | Contador de no leídos correcto |
| 9 | Perfil y tema oscuro | 1 | — |

Los bloques 1-5 y 6-8 son independientes: si urge lo de Comunicados, puede ir
primero.

---

## 5. Riesgos

**El tope silencioso de 200 casos sigue ahí.** `denuncias.js` limita a 200 sin
avisar. Abrir el portal ciudadano es exactamente lo que va a hacer crecer el
volumen. Conviene resolverlo **antes**, no después.

**Realtime en el portal.** Un ciudadano suscrito a toda la tabla `casos` es
insostenible. La suscripción debe filtrarse por `creado_por_ciudadano_id`.

**Plan gratuito.** Las fotos van a cPanel, no a Supabase, así que el riesgo no
son los 500 MB de disco sino las conexiones concurrentes. Conviene estimar
cuántos vecinos van a usarlo antes de anunciarlo.

**Datos personales.** Guardar DUI, dirección y fecha de nacimiento de vecinos
tiene implicaciones legales distintas a guardar datos de empleados. Hace falta
una política de retención y un aviso de privacidad en el registro. **Esto no lo
puedo decidir yo.**

**Fotos huérfanas.** Si el ciudadano sube la foto y abandona el formulario, el
archivo queda en cPanel sin caso. Ya pasa con la PWA de campo y sigue pendiente.

---

## 6. Decisiones que necesito de tu parte

Ninguna es técnica. Las seis cambian el diseño de las migraciones.

**1 · ¿Cómo se registra el vecino?** Correo y contraseña es lo más simple y
permite recuperar la cuenta. Teléfono con código SMS es más natural para el
vecino promedio pero **cuesta dinero** (Supabase cobra el envío) y no está en
el plan gratuito.

**2 · ¿Se permite denunciar sin cuenta?** El formulario ya tiene casilla de
«anónima», pero hoy significa otra cosa. Mi recomendación: **exigir cuenta
siempre**, y que «anónima» quiera decir que el operador no ve el nombre del
denunciante. Un `insert` público sin cuenta no se puede proteger del abuso, y
sin cuenta tampoco hay «Mis Denuncias» ni forma de avisarle del resultado.

**3 · ¿Quién responde las denuncias ciudadanas?** En cuanto entren a `casos`
entran al flujo real y alguien tiene que atenderlas. Hoy no hay nadie asignado
a esa bandeja. Es la decisión más importante de la lista y no es de software.

**4 · ¿Qué categorías se abren al público?** De las 27 del portal actual, hay
que decidir cuáles se ofrecen. Por defecto quedan todas cerradas.

**5 · ¿Qué ve el ciudadano cuando su denuncia se rechaza?** ¿Motivo, o solo el
estado? ¿Puede insistir?

**6 · ¿Quién publica comunicados?** ¿Solo Comunicaciones, o también las
jefaturas de distrito para su territorio? Determina si `noticias_write` se
queda en admin o necesita alcance territorial.

---

## 7. Lo que ya está resuelto y conviene reusar

No hay que reinventar:

- **El endpoint de fotos de cPanel** funciona en producción con verificación
  ES256 contra el JWKS y límite por hora. Un JWT de ciudadano es igual de
  válido; solo hay que confirmar que el límite se aplique por `sub`.
- **`services/mapa/teselas.js`** — catálogo único de capas base.
- **`stores/preferencias-campo.js`** — el mismo patrón sirve para el portal.
- **`vista-notificaciones.js`** del panel — plantilla del módulo de Comunicados.
- **La v31** — patrón exacto para congelar columnas del perfil propio.
- **`crear_caso_campo`** — plantilla del RPC, con las diferencias de la §2 v33.
