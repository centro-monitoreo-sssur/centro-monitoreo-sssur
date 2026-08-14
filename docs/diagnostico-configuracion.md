# Configuración — diagnóstico antes de rediseñar

> Estado: **diagnóstico**. Ninguna línea de código cambiada por este documento.
> Base: commit `69e7ae5`.
> Lo que se afirma aquí está comprobado contra el código, no supuesto. Donde no
> he podido comprobarlo, lo digo.

Dijiste que Configuración se está quedando corta. Antes de rediseñar quise
saber **qué hay realmente dentro**, porque un rediseño a ciegas ordena mejor lo
que ya está mal.

---

## 1. Lo que hay

Nueve pestañas y **48 ajustes**, repartidos así:

| Pestaña | Qué configura |
|---|---|
| Diagnóstico | Chequeos del estado de la base |
| Apariencia | Paleta de indicadores y gráficos, iconos de categorías |
| Notificaciones | Preferencias de aviso |
| Mapa | 26 ajustes del Mapa en Vivo |
| Sistema | Ajustes generales |
| Acceso URL | Kill switches de las dos PWA |
| Fotografías | Topes por formulario *(añadida hoy)* |
| Seguridad | Sesiones activas |
| Exportación | Importar y exportar la configuración |

**La mitad de todo está en «Mapa».** Veintiséis ajustes en una sola pestaña, y
casi todos son estado inicial de paneles y acordeones de una única vista.

---

## 2. Ajustes que no lee nadie

Comprobado buscando cada clave distintiva fuera del propio panel:

| Ajuste | Lectores |
|---|---:|
| `mapa.umbralHeatmap` | **0** |
| `mapa.tamanoMarcador` | **0** |
| `mapa.radioCluster` | **0** |
| `mapa.animarNuevas` | **0** |
| `mapa.segundosResaltado` | **0** |

Cinco controles que la gerencia puede mover y **no hacen absolutamente nada**.
Peor que si no existieran: quien los toque creerá que configuró algo.

> **Cómo lo medí, y por qué desconfío de los automatismos.** Mi primera pasada
> dijo «41 de 48 sin consumidor» y era falso: `vista-mapa.js` copia
> `config.value.mapa` a una variable local y lee de ahí, así que buscar
> `config.value.mapa.X` no encontraba nada. La segunda pasada, buscando solo el
> nombre de la clave, dijo «0 sin consumidor» y también era falso: nombres como
> `estilo` o `activo` casan en cualquier archivo.
>
> La tabla de arriba usa solo claves con nombre distintivo, donde una
> coincidencia no puede ser casual. **Los 43 ajustes restantes no están
> auditados uno a uno**; haría falta revisarlos a mano y es parte del trabajo
> que propongo.

---

## 3. Lo que no está y debería

Cosas que hoy se cambian tocando código o SQL, y que son decisiones de gestión:

**Tope diario de denuncias por ciudadano.** Está fijado en 10 dentro de
`crear_caso_ciudadano` (v34). Es una constante de PL/pgSQL: cambiarla exige una
migración.

**Qué categorías se abren al público.** Se hace desde Catálogo, que es su sitio,
pero no hay ningún lugar donde ver de un vistazo el estado del portal ciudadano.

**Umbral de reincidencia por teléfono, ventana de duplicados, SLA por
prioridad.** Viven repartidos entre el código y la base.

**Datos de la institución** —nombre, logotipo, teléfono de contacto, correo del
remitente—. Están escritos a mano en varios archivos.

**Nada sobre el portal ciudadano.** No hay una sola opción que hable de él,
cuando es el módulo que más decisiones de política tiene pendientes.

---

## 4. El problema de fondo, que no es la UI

Las pestañas están organizadas por **dónde se aplica** el ajuste —Mapa, Sistema,
Seguridad— y no por **quién decide**. Eso mezcla en la misma pantalla:

- decisiones de gobierno del servicio: qué se abre al público, cuántas denuncias
  admite un vecino al día, quién puede publicar comunicados;
- preferencias de operación: si el panel de capas arranca plegado;
- diagnóstico técnico: si la v34 está aplicada.

Un Alcalde y un administrador de TI necesitan cosas distintas, y hoy comparten
un cajón de nueve pestañas donde el color de un gráfico pesa lo mismo que el
tope de denuncias.

Y hay una asimetría que lo confirma: **26 ajustes para el Mapa en Vivo y cero
para el portal ciudadano**, que es el módulo con más decisiones abiertas.

---

## 5. Lo que propongo

Tres bloques, y el primero es el que más devuelve por lo que cuesta.

### Bloque A · Limpiar antes de ordenar

Auditar los 43 ajustes no verificados y, para cada uno: conectarlo si tiene
sentido, o retirarlo. **Retirar un control muerto es una mejora de UX**, no una
pérdida de funcionalidad.

Los cinco confirmados como muertos se resuelven decidiendo uno por uno: el
tamaño de marcador y el radio de clúster probablemente merecen conectarse; el
umbral del heatmap y el destello de las nuevas, probablemente retirarse.

### Bloque B · Reagrupar por quién decide

Tres grupos en vez de nueve pestañas planas:

**Gobierno del servicio** — lo que compromete a la institución: portal
ciudadano, topes, quién publica comunicados, datos de la Alcaldía. Es lo que
mira el Alcalde o la gerencia.

**Operación** — preferencias de las consolas: mapa, apariencia, notificaciones.

**Sistema** — diagnóstico, sesiones, importar y exportar. Es lo de TI.

Con eso, «Configuración» deja de ser un cajón y pasa a tener tres puertas.

### Bloque C · Lo que falta

Traer a la interfaz lo que hoy vive en el código: tope diario, datos de la
institución, y un resumen del estado del portal ciudadano —cuántas categorías
abiertas, cuántos vecinos registrados, cuántas denuncias hoy—.

---

## 6. Lo que necesito de ti

**El tope diario de denuncias, ¿lo quieres configurable?** Sacarlo del RPC
significa que la función lea una tabla en cada alta. Es una consulta más por
denuncia, despreciable con volumen municipal, pero conviene decidirlo a
sabiendas.

**¿Quién debe entrar a Configuración?** Hoy el módulo es `config` y lo tiene la
gerencia. Si el Alcalde va a mirar el bloque de Gobierno, hace falta un permiso
distinto para ese bloque.

**Los cinco ajustes muertos: ¿conectar o retirar?** Mi recomendación: conectar
`tamanoMarcador` y `radioCluster`, retirar los otros tres. Pero el mapa lo usas
tú más que yo.

---

## 7. Lo que NO haría

**Un rediseño visual sin la limpieza previa.** Reordenar 48 controles de los
que cinco no hacen nada, y 43 sin verificar, es maquillar el problema.

**Meter todo en la base de datos.** Las preferencias de interfaz —qué panel
arranca abierto— están bien en el dispositivo. Llevarlas a Postgres añade una
consulta al arranque y un fallo posible, sin ganar nada.
