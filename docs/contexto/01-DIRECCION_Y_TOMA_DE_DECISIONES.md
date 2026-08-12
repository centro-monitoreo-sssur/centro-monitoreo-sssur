# Centro de Monitoreo SSSur — Documento de Dirección

> **Para:** Alcalde, Directores, Gerentes y Jefaturas de Distrito de la Municipalidad de San Salvador Sur.
> **Propósito:** explicar qué es el sistema, qué decisiones permite tomar, en qué estado real se encuentra y qué requiere de la administración.
> **Última revisión:** 12 de agosto de 2026.

Este documento no requiere conocimientos técnicos. Donde se menciona un dato que aún no está confirmado, se dice explícitamente.

---

## 1. El problema que resuelve

Hoy una denuncia ciudadana llega por radio, por WhatsApp, por una llamada o de viva voz a un empleado en territorio. Cada una de esas rutas termina en un lugar distinto: un cuaderno, un chat, la memoria de alguien. Nadie puede responder con certeza tres preguntas que la administración necesita responder a diario:

1. **¿Cuántos casos abiertos tiene el municipio ahora mismo, y dónde están?**
2. **¿Cuál distrito está peor atendido en proporción a la gente que vive en él?**
3. **¿Cuánto tarda la municipalidad en cerrar un caso, y ese tiempo está mejorando o empeorando?**

El Centro de Monitoreo existe para que esas tres preguntas tengan una respuesta única, verificable y actualizada al minuto.

El principio de diseño es que **el sistema no inventa datos**. Si un distrito no tiene información censal, la pantalla dice «sin dato» en lugar de mostrar un cero. Un cero se lee como un hallazgo; la ausencia de dato es otra cosa, y confundirlas lleva a decidir mal.

---

## 2. El territorio

El municipio se organiza en cinco distritos:

| Distrito | Rol en el sistema |
|---|---|
| Panchimalco | Distrito con territorio propio |
| Rosario de Mora | Distrito con territorio propio |
| San Marcos | Sede central |
| Santiago Texacuangos | Distrito con territorio propio |
| Santo Tomás | Distrito con territorio propio |

Cada distrito tiene su polígono real cargado en el sistema, medido sobre cartografía, no declarado. Cuando un empleado levanta un caso desde su teléfono, **el sistema determina solo a qué distrito pertenece** comparando las coordenadas del GPS contra esos polígonos. El empleado no elige el distrito, y por tanto no puede equivocarse ni sesgar la estadística.

> **Dato pendiente de confirmar.** Las cifras de población por distrito (166 671 habitantes en total) están cargadas pero **no han sido verificadas contra Catastro ni DIGESTYC**. Todos los indicadores «por habitante» y de densidad dependen de ellas. Es la primera validación que conviene cerrar, porque sin ella los rankings poblacionales son orientativos, no oficiales.

---

## 3. Cómo funciona, en cuatro pasos

### Paso 1 · Un empleado levanta el caso en territorio

El empleado abre la aplicación en su teléfono, elige el tipo de incidente de un catálogo (bache, luminaria, basura, riesgo de árbol, etc.), marca el punto en el mapa, escribe qué ocurre y envía.

Puede además registrar **quién le está reportando**: buscar al ciudadano en el padrón por su DUI o teléfono —no por nombre, porque los nombres se repiten y los documentos no—, o anotar sus datos si no está registrado, o marcar el reporte como anónimo.

**El sistema siempre guarda qué empleado hizo el levantamiento**, aunque el reporte sea anónimo para el ciudadano. La trazabilidad institucional no depende de la voluntad de nadie.

### Paso 2 · El caso aparece en el Centro de Monitoreo

En cuanto el empleado pulsa enviar, el caso aparece en el mapa en vivo de la consola **sin que nadie tenga que refrescar la pantalla**. Simultáneamente el sistema:

- lo asigna al departamento responsable según el tipo de incidente;
- le pone la prioridad que corresponde a ese tipo;
- le asigna el distrito según las coordenadas;
- le genera un correlativo.

Nada de eso lo decide una persona. Es la misma regla siempre, lo que hace que las estadísticas sean comparables entre distritos y entre meses.

### Paso 3 · La municipalidad gestiona el caso

Desde la consola se abre el caso y se decide quién responde: una **persona**, una **cuadrilla**, o ambas. Y se mueve por su ciclo de vida —pendiente, en revisión, en obra, resuelta o rechazada— según el flujo que tenga configurado su tipo de incidente.

Dos reglas que el sistema hace cumplir y conviene conocer:

- **No se puede cerrar un caso sin registrar cómo se resolvió.** Un caso cerrado sin explicación no se puede auditar: seis meses después nadie sabría qué se hizo.
- **Cada movimiento queda en la bitácora del caso**, con quién lo hizo y cuándo. Se ve en la misma pantalla, y no se puede alterar desde la interfaz.

### Paso 4 · El caso se cierra y alimenta los indicadores

Cuando el caso se resuelve, entra en el histórico y pasa a contar en los indicadores de eficiencia y tiempo de respuesta.

---

## 4. Qué puede ver y decidir cada quien

El sistema distingue **nueve roles**. La diferencia entre ellos no es solo qué botones ven, sino **qué filas de datos existen para ellos**. Un Jefe de Distrito no ve los casos de otro distrito: no es que estén ocultos en la pantalla, es que la base de datos no se los entrega.

| Rol | Alcance | Puede |
|---|---|---|
| **Alcalde** | Todo el municipio | Ver y exportar todo. No modifica |
| **Director / Gerente** | Todo el municipio | Ver y exportar la operación |
| **Jefe de Distrito** | Solo su distrito | Ver y gestionar los casos de su territorio |
| **Jefe de Área** | Su departamento, en los cinco distritos | Gestionar los casos y el catálogo de su área |
| **Administrador** | Todo | Gestión operativa completa |
| **Superadministrador** | Todo | Incluye configuración del sistema |
| **Operador** | Según se configure | Gestión de denuncias e intervenciones |
| **Lector** | Según se configure | Solo consulta y exportación |
| **Empleado** | Solo lo suyo | Únicamente la aplicación de campo |

Esta separación es configurable desde el propio sistema, sin tocar programación. Se pueden además otorgar **excepciones temporales con fecha de vencimiento**: por ejemplo, que la jefatura de Santo Tomás cubra Panchimalco durante una suplencia, con motivo registrado y caducidad automática.

**Por qué importa esto para la administración:** significa que dar acceso a una persona nueva es una decisión administrativa, no un trabajo de programación. Y que retirar el acceso es inmediato.

---

## 5. Las herramientas de decisión

### Mapa en Vivo
Todos los casos abiertos sobre el mapa del municipio, actualizándose solos. Filtros por tipo, estado y distrito. Es la pantalla de sala de situación.

### Cartograma
La herramienta analítica. Deforma los cinco distritos según la métrica elegida, de modo que el territorio que más pesa se ve más grande. Cinco lecturas:

| Vista | Responde a |
|---|---|
| **Geográfico** | El municipio tal cual es |
| **Densidad poblacional** | Dónde se concentra la gente |
| **Carga de denuncias** | Dónde se concentran los casos abiertos |
| **Por habitante** | **Dónde hay más casos en proporción a su población** |
| **Eficiencia** | Dónde se cierra y dónde se acumula |

La cuarta es la que más cambia una decisión. San Marcos siempre encabezará cualquier lista por volumen: tiene la mayor población. Eso no es un hallazgo, es demografía. Normalizado por habitante aparece qué territorio está realmente peor atendido.

Sobre cada distrito el mapa rotula **el porcentaje que representa del municipio**, de modo que las cifras del mapa cuadran con las de la cabecera. Donde la métrica es una razón —densidad, casos por mil habitantes— el porcentaje del mapa es el peso demográfico y la métrica exacta se lee en el panel de ranking; sumar densidades no significa nada y el sistema no finge lo contrario.

### Comparación contra el período anterior
Con un rango de fechas puesto, cada indicador muestra su variación frente al período equivalente anterior. «34 casos» no dice nada; «34, un 18 % menos que el trimestre pasado» sí.

---

## 6. Estado real del sistema — lo que funciona y lo que falta

Esta sección es deliberadamente franca. Un tablero que promete lo que no hace es peor que no tener tablero.

### El circuito completo está operativo

Desde agosto de 2026 el sistema hace el recorrido entero: el empleado levanta el caso con fotografía en territorio, llega al instante al Centro de Monitoreo, se le asigna cuadrilla, se le sigue el estado y se cierra con constancia de lo que se hizo.

| Capacidad | Estado |
|---|---|
| Alta de usuarios y asignación de roles desde la consola | ✅ |
| Aislamiento de datos por distrito y por departamento | ✅ |
| El empleado levanta un caso desde territorio | ✅ |
| **Fotografía adjunta al caso** | ✅ |
| Registro del ciudadano que reporta (o anónimo) | ✅ |
| El caso aparece en el mapa en vivo al instante | ✅ |
| **Asignar responsable y cuadrilla desde la consola** | ✅ |
| **Cambiar el estado del caso, con bitácora** | ✅ |
| **Administrar cuadrillas y sus integrantes** | ✅ |
| **Cada jefatura administra su catálogo de atenciones** | ✅ |
| Consulta y exportación por parte de dirección | ✅ |
| Cartograma con indicadores reales | ✅ |
| Bitácora de auditoría de las acciones | ✅ |

### Lo que conviene mejorar

Nada de esto impide operar, pero conviene tenerlo presente:

| Asunto | Por qué importa |
|---|---|
| **Las fotografías no viajan si no hay señal** | El caso sí se guarda y se envía después, pero sus fotos se pierden. En zonas sin cobertura conviene enviar el reporte al recuperarla |
| **La consola trabaja sobre los 200 casos más recientes** | Por debajo de esa cifra todo es exacto. Al superarla, los indicadores empezarían a quedarse cortos. Con el volumen actual queda lejos, pero hay que resolverlo antes de llegar |
| **La ficha del empleado sigue siendo de demostración** | Es la última pantalla con datos de ejemplo. No afecta a la operación |

### Requiere una acción administrativa

- **Verificar las cifras de población** con Catastro o DIGESTYC.
- **Diez colonias** tienen su centro fuera de todos los polígonos distritales. Catastro debe aclarar a qué distrito pertenecen.

---

## 7. Costo

La arquitectura se eligió para que la municipalidad **no tenga que administrar ni pagar un servidor**.

| Concepto | Costo | Situación |
|---|---|---|
| Alojamiento del sistema | **$0** | Usa el cPanel institucional que ya se paga |
| Base de datos y servicios (plan gratuito) | **$0/mes** | En uso actualmente |
| Base de datos y servicios (plan de producción) | **$25/mes** — $300/año | **Decisión pendiente** |

### Por qué el plan gratuito no sirve para producción

Tres razones concretas:

1. **Se apaga solo.** El proveedor suspende los proyectos gratuitos tras 7 días sin actividad. Una semana de asueto institucional deja el sistema caído.
2. **No tiene respaldos automáticos.** Si algo se corrompe, no hay a qué volver.
3. **Límite de espacio.** 500 MB de base de datos y 1 GB de fotografías. Con purga a los 15 días alcanza para la prueba, no para operar.

El plan de producción resuelve los tres, más respaldos diarios y capacidad para años de operación.

**La alternativa —un servidor propio— cuesta menos en hardware y muchísimo más en horas de personal:** habría que programar el backend completo, configurar la seguridad, aplicar parches y responder a las caídas. Esas horas son el gasto real, y no se ven en la factura.

---

## 8. Las cuatro decisiones que corresponden a la administración

**1. Autorizar los $25 mensuales del plan de producción.**
Sin esto el sistema no puede considerarse operativo: se apaga solo tras una semana de asueto y no tiene respaldo.

**2. Instruir a Catastro** para que valide las cifras de población por distrito y resuelva la jurisdicción de las diez colonias pendientes.

**3. Designar quién gestiona los casos.**
La pantalla ya existe y funciona; lo que falta es la instrucción administrativa. Alguien tiene que asignar cuadrillas y cambiar estados a diario, y hoy cualquiera con permiso de edición puede hacerlo. El sistema admite repartir esa responsabilidad como se decida —centralizada en el Centro de Monitoreo, delegada a cada Jefatura de Distrito, o mixta— y los permisos se ajustan desde el propio panel, sin tocar programación.

Mientras no se decida, el riesgo no es técnico sino de gestión: **un caso que nadie tiene asignado como responsabilidad suya no se atiende**, aunque el sistema lo muestre correctamente.

**4. Dar de alta las cuadrillas reales.**
La pantalla está lista y vacía. Hasta que se registren los equipos con sus integrantes, «asignar cuadrilla» no tiene a quién apuntar. Es trabajo de media mañana de una jefatura, no de programación.

---

## 9. Lo que el sistema responde hoy

- ¿Cuántos casos abiertos hay ahora, por distrito y por tipo?
- ¿Qué distrito acumula más casos en proporción a su población?
- ¿Cuánto tardamos en promedio en cerrar un caso, por tipo y por distrito?
- ¿Qué casos llevan más tiempo del comprometido sin atenderse?
- ¿Qué departamento tiene trabajo acumulado y en qué territorio?
- ¿La gestión de este trimestre mejoró respecto al anterior, y en cuánto?
- ¿Qué cuadrilla atendió un caso concreto, cuándo, y con qué evidencia?

Las siete. La última —qué cuadrilla atendió un caso, cuándo y con qué evidencia— es la que se cerró en agosto de 2026 con la gestión de casos y la subida de fotografías.

Lo que todavía no responde bien es **cuánto trabajo tiene cada cuadrilla en este momento**: hace falta que estén dadas de alta y que la asignación se use a diario. Es cuestión de puesta en marcha, no de sistema.

---

## Documentos relacionados

- [`02-EQUIPO_TECNICO.md`](02-EQUIPO_TECNICO.md) — arquitectura y funcionamiento interno.
- [`03-PERSONAL_DE_CAMPO.md`](03-PERSONAL_DE_CAMPO.md) — manual para el empleado en territorio.
- [`../arquitectura/ANALISIS_PROFUNDO_LIMITANTES_VIABILIDAD_REAL.md`](../arquitectura/ANALISIS_PROFUNDO_LIMITANTES_VIABILIDAD_REAL.md) — análisis de costos a cinco años.
