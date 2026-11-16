# Diagramas de secuencia de Cyanea

Estos diagramas documentan los doce procesos seleccionados a partir del comportamiento del código actual. La contratación de Pro y la recepción del webhook se separan en **11a y 11b** porque tienen disparadores distintos: en total se incluyen **13 diagramas**.

Cada secuencia cuenta con una fuente editable PlantUML (`.puml`) y una vista SVG (`.svg`). Los diagramas presentan el recorrido principal y las alternativas que cambian una decisión, una confirmación o la persistencia; no enumeran todas las validaciones ni sustituyen los contratos de la API o los casos de prueba.

## Criterios de lectura

- Las rutas se muestran sin el prefijo común `/api/v1`. Los parámetros `{viaje}`, `{dia}` e `{id}` representan identificadores, no nombres literales de parámetros del contrato.
- Las líneas de vida de API, servicios, orquestadores y herramientas son **componentes lógicos del mismo backend FastAPI**, no microservicios ni despliegues adicionales. PostgreSQL y los proveedores externos sí se representan por separado.
- `COMMIT` indica persistencia confirmada y `FLUSH` preparación dentro de una transacción todavía abierta. Los correos, WebSockets y llamadas externas no comparten una transacción distribuida con la base de datos.
- `alt` representa alternativas, `opt` un paso condicional y `loop` una repetición. Las secciones separadas por un título pueden ocurrir en momentos diferentes; las acciones posteriores suponen que se cumplieron las precondiciones indicadas.
- En los recorridos con advertencias se dibuja la continuación confirmada. Si el usuario cancela, se termina ese recorrido antes del guardado.
- Los nombres de tablas se vinculan con los [diccionarios y DER de los once módulos](../modelo-datos/inventario-tablas.md). Los números de los diagramas identifican procesos y no coinciden necesariamente con los números de módulo.
- El catálogo documenta la implementación disponible; no afirma que una integración esté habilitada, configurada o certificada para producción. No se incluyen credenciales, tokens reales, contenido de viajes ni datos de tarjetas.

## Catálogo

| Proceso | Módulo principal / colaboración | Fuente editable | Vista |
| --- | --- | --- | --- |
| 01. Registro y confirmación de correo | 1 | [PlantUML](01-registro-confirmacion-correo.puml) | [SVG](01-registro-confirmacion-correo.svg) |
| 02. Creación de viaje con destinos y recorrido | 2 | [PlantUML](02-creacion-viaje.puml) | [SVG](02-creacion-viaje.svg) |
| 03. Invitación e incorporación de un participante | 2 y 10 | [PlantUML](03-invitacion-participante.puml) | [SVG](03-invitacion-participante.svg) |
| 04. Creación de actividad con validación de horarios | 3, con colaboración de 4 y 10 | [PlantUML](04-creacion-actividad.puml) | [SVG](04-creacion-actividad.svg) |
| 05. Solicitud y aceptación de sugerencias de IA | 4 y 3 | [PlantUML](05-sugerencias-ia.puml) | [SVG](05-sugerencias-ia.svg) |
| 06. Propuesta y confirmación de una acción del asistente | 4 | [PlantUML](06-asistente-confirmacion-accion.puml) | [SVG](06-asistente-confirmacion-accion.svg) |
| 07. Votación de sugerencias y resolución de ganadora | 5, con colaboración de 4 y 3 | [PlantUML](07-votacion-sugerencias.puml) | [SVG](07-votacion-sugerencias.svg) |
| 08. Escaneo de comprobante y confirmación del gasto | 6 y 4, con colaboración de 7 | [PlantUML](08-escaneo-confirmacion-gasto.puml) | [SVG](08-escaneo-confirmacion-gasto.svg) |
| 09. Liquidación de gastos y confirmación de transferencias | 6 | [PlantUML](09-liquidacion-transferencias.puml) | [SVG](09-liquidacion-transferencias.svg) |
| 10. Carga de documentos con permisos y almacenamiento | 7, con colaboración de 9 | [PlantUML](10-carga-documentos.puml) | [SVG](10-carga-documentos.svg) |
| 11a. Contratación de Pro e inicio del pago | 9 | [PlantUML](11a-contratacion-pro.puml) | [SVG](11a-contratacion-pro.svg) |
| 11b. Confirmación de un cobro mediante webhook | 9 y 10 | [PlantUML](11b-webhook-pago.puml) | [SVG](11b-webhook-pago.svg) |
| 12. Cambio administrativo de planes y límites con auditoría | 11 y 9 | [PlantUML](12-planes-limites-auditoria.puml) | [SVG](12-planes-limites-auditoria.svg) |

## Alcance y trazabilidad por proceso

### 01. Registro y confirmación de correo

Alta local con aceptación de términos y confirmación posterior por correo. El registro no inicia sesión automáticamente. La vinculación de una invitación externa no acepta la participación en el viaje.

Referencias de implementación: [auth.py](../../backend/app/api/routes/auth.py), [email_confirmation_service.py](../../backend/app/services/auth/email_confirmation_service.py).

### 02. Creación de viaje con destinos y recorrido

Incluye destinos reutilizables, orden y noches del recorrido, cronograma si hay fechas y participación aceptada del administrador. Los demás participantes quedan invitados hasta responder.

Referencias de implementación: [trips.py](../../backend/app/api/routes/trips.py).

### 03. Invitación e incorporación de un participante

Contempla invitación a un usuario existente o a un correo externo y aceptación explícita con validación de cupo. Los enlaces compartidos constituyen otra variante y no se desarrollan aquí.

Referencias de implementación: [trips.py](../../backend/app/api/routes/trips.py).

### 04. Creación de actividad con validación de horarios

Representa el caso exitoso y la continuación explícita ante una advertencia de horario. El recordatorio de entradas del checklist es una acción posterior opcional y queda fuera de este diagrama.

Referencias de implementación: [trips.py](../../backend/app/api/routes/trips.py).

### 05. Solicitud y aceptación de sugerencias de IA

Distingue generar opciones de incorporarlas al itinerario. Incluye control de consumo, preferencias anonimizadas y confirmación de superposición. La incorporación requiere una sugerencia disponible; un fallo de generación no conduce a esa etapa.

Referencias de implementación: [sugerencias.py](../../backend/app/api/routes/sugerencias.py).

### 06. Propuesta y confirmación de una acción del asistente

Separa la respuesta informativa de una propuesta persistida. La confirmación vuelve a comprobar identidad, viaje, estado y permisos. El historial de conversación recibido en la petición no representa una tabla persistida de mensajes.

Referencias de implementación: [assistant.py](../../backend/app/api/routes/assistant.py), [orchestrator.py](../../backend/app/services/assistant_ai/orchestrator.py).

### 07. Votación de sugerencias y resolución de ganadora

Modela la votación originada desde sugerencias, la emisión del voto y la resolución por cierre. Incluye ganadora única, empate con decisión del creador y ausencia de votos. La modificación de votos es otro caso de uso.

Referencias de implementación: [votaciones.py](../../backend/app/api/routes/votaciones.py), [resolucion_votaciones.py](../../backend/app/services/resolucion_votaciones.py).

### 08. Escaneo de comprobante y confirmación del gasto

La extracción y el alta son acciones distintas. La segunda etapa supone una extracción válida o datos completados por el usuario. Incluye revisión de campos, conversión a ARS cuando corresponde y persistencia solo tras confirmar. El guardado del comprobante es una petición posterior opcional (seleccionada por defecto); su fallo no revierte el gasto.

Referencias de implementación: [gastos.py](../../backend/app/api/routes/gastos.py), [ReceiptScanButton.js](../../frontend/src/components/trip/ReceiptScanButton.js), [AddGastoScreen.js](../../frontend/src/screens/AddGastoScreen.js).

### 09. Liquidación de gastos y confirmación de transferencias

Distingue el plan de transferencias de la ejecución del pago fuera de la aplicación. El aviso corresponde al deudor y la confirmación al acreedor; este puede confirmar directamente sin aviso previo. El rechazo y la reversión no se desarrollan en el flujo básico.

Referencias de implementación: [liquidaciones.py](../../backend/app/api/routes/liquidaciones.py), [liquidacion_service.py](../../backend/app/services/liquidacion_service.py).

### 10. Carga de documentos con permisos y almacenamiento

Incluye validación de edición, formato permitido y capacidad del plan del administrador. El binario queda en Supabase y los metadatos en PostgreSQL. Se omite el análisis opcional para sugerir un gasto desde un documento.

Referencias de implementación: [documentos.py](../../backend/app/api/routes/documentos.py), [storage.py](../../backend/app/services/supabase/storage.py).

### 11a. Contratación de Pro e inicio del pago

Inicio de la contratación con precio capturado en el período, consentimiento de renovación y checkout externo. El servidor puede reconciliar cobros al consultar el estado; la sola redirección de retorno no prueba un pago.

Referencias de implementación: [suscripciones.py](../../backend/app/api/routes/suscripciones.py), [suscripcion_pro.py](../../backend/app/services/suscripcion_pro.py).

### 11b. Confirmación de un cobro mediante webhook

Diagrama separado del checkout porque lo dispara la pasarela, sin intervención del usuario. Desarrolla una notificación de cobro; las notificaciones de suscripción utilizan sincronización. La firma depende de la configuración: existe una excepción explícita para entornos que admiten notificaciones sin firma.

Referencias de implementación: [suscripciones.py](../../backend/app/api/routes/suscripciones.py), [suscripcion_pro.py](../../backend/app/services/suscripcion_pro.py).

### 12. Cambio administrativo de planes y límites con auditoría

Incluye confirmación previa, autorización del servidor, validación, bloqueo y auditoría por campo modificado. Documenta lo implementado: el cambio no reescribe períodos contratados; no presupone una actualización automática del precio de renovación.

Referencias de implementación: [backoffice.py](../../backend/app/api/routes/backoffice.py), [planes_service.py](../../backend/app/services/backoffice/planes_service.py).

## Edición y regeneración

Editar la fuente `.puml` correspondiente y regenerar su `.svg` con PlantUML, conservando el mismo nombre base. Las fuentes son autocontenidas y no requieren includes remotos. Para estos diagramas de secuencia basta Java y PlantUML; no requieren Graphviz.

Ejemplo desde la raíz del repositorio, usando una instalación local de PlantUML:

```powershell
java -jar <ruta-local-a-plantuml.jar> -charset UTF-8 -tsvg docs/secuencias/*.puml
```

Antes de entregar cambios, verificar la sintaxis, abrir las vistas regeneradas y comprobar los enlaces del catálogo. Los SVG son documentación versionada; el JAR, los scripts temporales y las previsualizaciones PNG quedan fuera del repositorio.
