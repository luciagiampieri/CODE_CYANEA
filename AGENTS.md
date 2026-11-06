ciones al regresar.
- Tests backend de US 113 suman agregaciones, limites de mes UTC/Argentina, comparacion, meses vacios, precision decimal, totales de mas de una pagina, periodicidad historica, permisos y filtros combinados. Tests frontend verifican la entrada ejecutiva, navegacion al detalle filtrado, busqueda, historial y errores.

### Visualizar planes disponibles (US 115)

- Acceso autenticado desde Configuracion > Mi cuenta > Mi plan y consumo (`Planes`) y los avisos de limite existentes (`irAPlanes`). `AppNavigator` registra `Planes` y `MiSuscripcion` en el stack autenticado. Se elimina el banner anterior de Configuracion que hardcodeaba plan gratuito, cupos incorrectos y viajes ilimitados.
- Contrato de solo lectura: `GET /users/me/planes`, con `Cache-Control: no-store`. `planes_disponibles.consultar` reutiliza el lector vigente de configuracion de la US 112; expone los cinco limites de ambos planes, precios ARS, plan actual de Usuarios, ahorro anual y ultimo periodo de suscripcion exclusivamente de la cuenta autenticada. No acepta ids de terceros. No crea suscripciones, inicia cobros ni cambia planes. No requiere migracion.
- Ahorro anual = max(0, (1 - precioAnual / (12 * precioMensual)) * 100), redondeado a dos decimales con Decimal. Sin ambos precios configurados devuelve NULL y no promete ahorro; un anual mas caro devuelve cero. Un limite NULL se presenta como Sin limite, nunca como cero. La tarjeta distingue plan actual por datos del backend, independiente del estado de la suscripcion.
- `useAvailablePlans` vuelve a consultar sin cache al enfocar la pantalla y al actualizar manualmente; conserva manejo de carga/error/reintento y descarta respuestas al desenfocar. La comparacion identifica viajes activos como administrador, participantes (incluido administrador), sugerencias diarias por viaje, escaneos mensuales por usuario y almacenamiento MB por viaje.
- Beneficios compartidos: los limites de participantes/sugerencias/almacenamiento del viaje dependen del administrador; el cupo de escaneos es individual. La UI informa que los participantes gratuitos reciben los beneficios del viaje administrado por Pro.
- Para gratuito se muestra Suscribirme a Pro, que informa contratacion proxima (pagos reales fuera del alcance actual); se deshabilita si faltan precios. Para Pro se reemplaza por Gestionar mi suscripcion, que abre la solapa "Mi plan" (`SubscriptionPanel`): consulta plan actual, ultimo periodo, estado, modalidad, fechas, cancelacion y precio historico congelado; informa conservacion de beneficios en canceladas aun vigentes. Contratar, cancelar y reactivar se implementaron en las US 116 y 119; cambiar de modalidad sigue pendiente.
- "Mi plan" (`components/plans/SubscriptionPanel.js`) muestra primero plan, modalidad, estado, precio corto (`precioCorto` de `planStyles.js`, sin ",00" si es entero) y la fecha de renovacion o fin; el pago pendiente se informa con un aviso `dangerSurface` y un unico boton "Actualizar medio de pago"; historial, cancelar/reactivar y comparar planes son filas `ListRow`. La recarga es por pull-to-refresh en `PlanSubscriptionScreen` (prop `recarga` + `onRecargado`), sin boton "Actualizar"
- El historial de pagos (`PaymentHistoryScreen`) muestra todos los pagos en una sola tarjeta con icono por estado, periodo corto y monto con su estado; las fechas de suscripciones y pagos se formatean con `fechaCorta` y `formatearPeriodo` de `frontend/src/utils/fechasSuscripcion.js` (hora Argentina, meses abreviados fijos)
- Pruebas: `test_planes_disponibles.py` verifica CP1/CP2/CP3/CP5, edicion real desde backoffice, ahorro, precios faltantes, plan desactivado y privacidad de suscripcion. `PlanesDisponibles.test.js`, `SettingScreen.test.js` y `AppNavigator.test.js` verifican comparacion, actualizacion, aviso de limite, accesos autenticados y gestion propia.

### Control de consumo de la cuenta

- La ruta `Planes` se presenta como Tu plan y consumo: entra con Comparar planes seleccionado y permite alternar a Mi consumo. Acceso desde Mi cuenta > Mi plan y consumo y desde los avisos de limite. Se elimina el boton Actualizar precios y limites; la comparacion vuelve a consultar al seleccionarla y al enfocar la pantalla. `AccountUsage` consulta tambien al enfocar/remontar; conserva reintento si falla.
- Contrato autenticado de solo lectura: `GET /users/me/consumo?pagina`, con no-store. No acepta ids de usuario o de viajes. Resume viajes activos administrados (incluidos borradores) y escaneos personales del mes, usando los mismos contadores de `limites_planes`. No requiere migracion ni persiste contadores derivados.
- Lista viajes en estado activo/borrador administrados por el usuario o donde tiene participacion aceptada. Excluye invitaciones pendientes, rechazadas, viajes ajenos y cerrados; no suma viajes como mero participante al cupo personal. Paginacion estable de seis viajes, primero los administrados, luego FechaCreacion/id descendentes; el resumen personal abarca todas las paginas.
- Cada viaje muestra rol del usuario, plan vigente de su administrador, participantes aceptados (incluye administrador si esta aceptado), solicitudes de sugerencias del dia y MB almacenados. Consultas SQL agrupadas solo sobre los ids de la pagina evitan una consulta por viaje. Limites de viaje proceden del administrador, no del participante que consulta; cupo de escaneos es personal.
- Solicitudes de sugerencias usan la zona AI_SUGGESTIONS_TIMEZONE y los estados contables en_proceso/completada, igual que la validacion del dominio. Los escaneos usan mes calendario argentino. Almacenamiento suma TamanoBytes y se presenta con la misma conversion MB del dominio. Porcentaje y marcas alcanzado/excedido se calculan sobre bytes sin redondear; la barra visual se recorta al 100%, sin ocultar el valor consumido. NULL se muestra Sin limite, no cero. No bloquear ni modificar recursos desde esta consulta.
- `AccountUsage` muestra medidores accesibles y fechas de renovacion, diferencia limites alcanzados/superados y permite paginar; conserva carga/error/vacio y aviso de fecha de consulta. Tests en `test_consumo_cuenta.py` y `AccountUsage.test.js` verifican contadores, cortes diarios UTC/Argentina, privacidad, plan del administrador, exceso, ilimitados, paginacion y errores.

### Historial comercial en el detalle de usuario

- Gestion de usuarios > detalle incorpora `FinanzasUsuario`: total pagado aprobado historico, cantidad de intentos por estado, ultimo periodo, tabla paginada de suscripciones y acceso a pagos de un periodo o de toda la cuenta. El plan actual se obtiene de `Usuarios.IdPlan`, separado del estado del ultimo periodo registrado. `usuarios_service.obtener_detalle` ya devuelve ese ultimo estado en `estadoSuscripcion`, antes siempre NULL.
- Contrato de solo lectura y exclusivo del administrador: `GET /backoffice/usuarios/{id}/historial-comercial?pagina`. Reutiliza los periodos y pagos existentes; no agrega migraciones ni inventa fechas de cambios. Los usuarios inexistentes y administradores del sistema responden 404, igual que la gestion de usuarios. Admite viajeros activos, suspendidos, pendientes y anonimizados.
- La evolucion de suscripciones se calcula en SQL con LAG sobre todo el historial de esa cuenta, antes de paginar; orden cronologico por FechaInicio e id. Distingue primer periodo registrado, cambio de plan, cambio de periodicidad conocida, renovacion (fin anterior exactamente igual a inicio nuevo) y nuevo periodo. La tabla muestra fecha de cancelacion solo cuando esta persistida; no atribuye una fecha de vencimiento de estado a FechaFin ni deduce un cambio al gratuito por vencimiento/cancelacion.
- La UI informa que no existe una auditoria completa de cambios manuales de plan anteriores: las transiciones visibles proceden de periodos efectivamente persistidos. El plan actual y el estado de una suscripcion son conceptos diferentes y pueden diferir.
- `GET /backoffice/pagos` suma `idUsuario` (entero positivo), que restringe filas y total aprobado por propietario de la suscripcion; si tambien llega `idSuscripcion`, aplica la interseccion. `ConsultaPagos` conserva esa restriccion al cambiar fechas, estado, pagina o limpiar filtros; nunca busca por email para delimitar la cuenta. Se oculta el buscador de otros usuarios en este contexto.
- El componente se remonta al cambiar de usuario para no conservar filtros o datos de otra cuenta. Las consultas son cancelables logicamente al desmontar; un error comercial tiene reintento propio y no oculta los datos de la cuenta. Tests backend verifican aislamiento, movimientos, total exacto, antecedentes fuera de pagina, permisos y vacios; frontend cubre pagos por cuenta/periodo, filtros y reintento.

### Datos sinteticos para demostracion local

- No distribuir en el repositorio generadores de datos demo del backoffice ni ejecutarlos desde migraciones Alembic, despliegues o inicializaciones de otros entornos. Los datos sinteticos cargados para pruebas locales se conservan unicamente en la base local; esta restriccion no afecta los datos maestros necesarios para el funcionamiento de la aplicacion ni las fixtures de tests.

### Gestion de categorias predefinidas (US 110)

- Las categorias de gastos (`CategoriasGastos`), documentos (`CategoriasDocumentos`) y tareas del checklist (`CategoriasChecklist`) se administran desde el backoffice sin tocar codigo. Migracion `d110a1b2c3d4` (script `017_gestion_categorias.sql`): las tres tablas suman `Icono` (nombre de FontAwesome 6, `NOT NULL DEFAULT 'tags'`) y `CategoriasDocumentos` suma `Activo` y `EsSistema`
- Rutas en `router` de `backoffice.py`: `GET /backoffice/categorias` (agrupadas por tipo con `cantidadUsos`), `POST /backoffice/categorias` (`tipo`, `nombre`, `icono`), `PUT /backoffice/categorias/{tipo}/{id}` (nombre y/o icono), `PATCH /backoffice/categorias/{tipo}/{id}/estado` (`activa`) y `DELETE /backoffice/categorias/{tipo}/{id}`. `tipo` es `gastos`, `documentos` o `checklist`
- La logica vive en `backend/app/services/backoffice/categorias_service.py`; los errores llevan `X-Error-Code`: `CATEGORY_NOT_FOUND` (404), `CATEGORY_NAME_DUPLICATED`, `CATEGORY_IN_USE`, `CATEGORY_SYSTEM_PROTECTED`, `CATEGORY_LAST_ACTIVE` (409)
- Reglas: nombre unico dentro del tipo sin distinguir mayusculas, acentos ni espacios repetidos (`normalizar_nombre`; el mismo nombre en otro tipo esta permitido), hasta 50 caracteres; una categoria en uso (gastos, documentos o tareas que la referencian) no se elimina, se desactiva; cada tipo conserva al menos una activa; las categorias con `EsSistema=true` ("Comprobantes") no se desactivan ni eliminan, pero se pueden renombrar o cambiar de icono
- `obtener_o_crear_categoria` de `comprobante_gasto.py` busca primero la categoria con `EsSistema=true`, asi el renombre desde el backoffice no rompe el guardado de comprobantes
- Categorias desactivadas: los listados para viajeros (`/gastos/categories`, `/trips/documents/categories`, `/trips/checklists/categorias`) solo devuelven activas, y crear un gasto, documento o tarea con una inactiva responde 400. Al editar, el elemento puede conservar su categoria inactiva; solo se exige que este activa si se cambia por otra
- Las respuestas para viajeros exponen el icono (`Icono` en las categorias, `IconoCategoria` en gastos y documentos). En el frontend `utils/iconosCategorias.js` resuelve el icono (`iconoDeCategoria`: primero el del backend, si falta el mapa por nombre) y `utils/categoriasActuales.js` suma la categoria actual al selector al editar. `TripDetailScreen` pasa las categorias activas a `DocumentsByCategory` y `ChecklistsByCategory` (prop `categorias`) para las secciones vacias. No se hardcodean iconos de categorias en pantallas
- El cache offline de categorias de gastos (SQLite `cache_categorias`) no guarda el icono: sin conexion se usa el mapa por nombre
- Tests: `backend/tests/test_backoffice_categorias.py` (CP1 a CP7) y `frontend/src/tests/backoffice/BackofficeCategoriasScreen.test.js`, `frontend/src/tests/CategoriasPredefinidas.test.js`

### Monitoreo de consumo de IA (US 114)

- Cada llamada a un proveedor de IA deja una fila en `SolicitudesIA` (migracion `d114a1b2c3d4`, script `018_monitoreo_consumo_ia.sql`) con `Servicio`, `Modelo`, `Exitosa`, `DuracionMs`, `TokensEntrada`, `TokensSalida`, `Imagenes` y `CostoEstimadoUSD`. Nunca se guarda el contenido de la solicitud ni datos del usuario o del viaje (RNF-33)
- El registro vive en `backend/app/services/registro_ia.py`: los proveedores envuelven la llamada con `medir_solicitud_ia(servicio, modelo)` y pasan la respuesta a `medicion.usar_respuesta(data)` para tomar `usageMetadata` de Gemini (el razonamiento cuenta como salida). Un fallo al registrar no interrumpe el flujo. Toda integracion nueva con IA debe registrarse asi
- Funcionalidades (`SERVICIO_*`): `sugerencia_actividades`, `escaneo_comprobantes`, `deteccion_gastos_documentos`, `generacion_portadas`, `analisis_horarios` (validacion de horarios), mas `recomendacion_entradas` y `asistente_viaje`. El lector de comprobantes es el mismo para el escaneo (US 93) y la deteccion al subir documentos (US 84): la ruta de documentos marca la funcionalidad con `servicio_ia(SERVICIO_DETECCION_GASTOS_DOCUMENTOS)` (contextvar). Los proveedores `mock` no registran consumo
- Costo estimado: `estimar_costo_usd` con precios de referencia configurables (`AI_COST_INPUT_USD_PER_MILLION_TOKENS`, `AI_COST_OUTPUT_USD_PER_MILLION_TOKENS`, sus variantes `AI_COST_LITE_*` para modelos "lite" y `AI_COST_IMAGE_USD` por imagen generada). Se persiste por solicitud para que cambiar precios no altere el historico. Los valores por defecto salen del tier pago Standard de https://ai.google.dev/gemini-api/docs/pricing (`gemini-3.8-flash` y `gemini-3.5-flash-lite`) y de https://developers.cloudflare.com/workers-ai/platform/pricing/ para `flux-1-schnell` (imagen 1024x1024 con 4 steps = 4 tiles + 4 steps). Gemini 3.8 Flash pasa de 0.75/3.75 a 1.50/7.50 USD por millon de tokens el 1/1/2027, y en ese momento hay que actualizar `AI_COST_INPUT_*`/`AI_COST_OUTPUT_*` en Railway
- Contratos (router protegido del backoffice): `GET /backoffice/monitoreo-ia?desde&hasta` (por defecto ultimos 30 dias, mismas reglas de rango que `/backoffice/metricas`) devuelve `funcionalidades` (solicitudes, fallidas, tiempo promedio, costo), `totales` y `umbral`; `PUT /backoffice/monitoreo-ia/umbral` con `umbralMensualUSD` (> 0, o `null` para quitarlo)
- Umbral: una sola fila en `ConfiguracionesMonitoreoIA`. Se evalua sobre el mes calendario en curso (hora Argentina): `nivel` es `sin_umbral`, `normal`, `advertencia` (mas del 80%) o `superado` (mas del 100%). Al superarlo, `verificar_umbral_costo` (llamado tras cada registro y al configurar el umbral) envia `ai_cost_threshold.html/.txt` a los administradores del sistema activos y confirmados una sola vez por mes y valor de umbral (`PeriodoUltimaAlerta`, `UmbralUltimaAlertaUSD`); si el envio falla no se marca y se reintenta con la proxima solicitud
- La logica vive en `backend/app/services/backoffice/monitoreo_ia_service.py`. Tests: `backend/tests/test_backoffice_monitoreo_ia.py` (CP1 a CP7, con Gemini simulado por `httpx.MockTransport`) y `frontend/src/tests/backoffice/BackofficeMonitoreoIAScreen.test.js`, `frontend/src/tests/formatoMonitoreo.test.js`

### Frontend del backoffice

- punto de entrada: `BackofficeApp`, con navegacion por estado (`inicio`, `usuarios`, `detalleUsuario`, `categorias`, `monitoreoIA`, `terminos`, `planes`, `suscripciones`, `auditoria`); no usa React Navigation
- `BackofficeApp` monta su propio `<DialogHost root />` (es una raiz distinta de `App.js`) para que `appAlert`, `confirmar` y `appToast` funcionen en el backoffice
- `backofficeApi.js` toma el mensaje del primer error de validacion cuando el `detail` es una lista (422) y expone el header `X-Error-Code` en `error.codigo`
- `BackofficeLayout` (`frontend/src/components/backoffice/`) concentra la barra superior; las pantallas solo renderizan su contenido
- los filtros del listado de usuarios se guardan en `BackofficeApp` para conservarse al volver del detalle y se reinician al cerrar sesion
- pantallas en `frontend/src/screens/backoffice/`, componentes en `frontend/src/components/backoffice/`
- acceso HTTP exclusivo en `frontend/src/services/backofficeApi.js`; el token se guarda en `sessionStorage`
- la identidad visual oscura del backoffice se toma de `frontend/src/theme/backofficeTokens.js`, combinada con `spacing`, `radii` y `textStyles` de `tokens.js`


## Estado funcional actual

### Votaciones

- Las votaciones se pueden editar y eliminar solo mientras están abiertas y
  únicamente por su creador.
- El título y la fecha de cierre se pueden editar mientras la votación está
  abierta.
- El tipo y las propuestas no se pueden modificar después de que exista un
  voto, para conservar la coherencia del histórico de resultados.
- Eliminar una votación elimina también sus propuestas y votos relacionados.
- Modificar voto (US 139): `PUT /votaciones/{id}/voto` con `idPropuestas`. Solo cambia el voto propio de quien ya voto, con la votacion abierta y no cancelada (400 si esta cancelada o si todavia no voto). Opcion unica reemplaza; opcion multiple agrega y quita con minimo una seleccion, y las opciones que se mantienen conservan su `FechaVoto`. La seleccion se valida con `_validar_seleccion`, compartida con `emitir_voto`: las propuestas tienen que ser de la votacion.
- La votacion se bloquea con `with_for_update` durante la modificacion y el cierre se chequea dentro de la misma transaccion: si cerro, responde 409 y se conserva el voto anterior. Asi tampoco se cruza con la resolucion automatica de votaciones de sugerencias (US 91), que aplica igual a esas votaciones.
- Quien salio o fue expulsado no puede modificar (`require_trip_edit_access`) y su voto queda como historico. Se emite `votacion_actualizada` para el progreso en tiempo real (US 52) y no se notifica a nadie. Si la seleccion no cambia, responde 200 "Tu voto no cambió." sin emitir eventos.
- Frontend: como en WhatsApp, el voto se cambia tocando una opcion de los resultados mientras la votacion esta abierta. `ResultadosVotacion` recibe `onElegirOpcion` y `cambiandoVoto`, solo vuelve tocables las opciones si la votacion esta `abierta` y llega `onElegirOpcion`, y en ese caso muestra el circulo (opcion unica) o el cuadrado (multiple) marcado en el voto propio y la ayuda "Tocá otra opción para cambiar tu voto" junto a "Ver votos". `TripDetailScreen` (`cambiarVoto`) arma la nueva seleccion desde `MisPropuestas`: en opcion unica reemplaza y en multiple suma o quita, sin dejar el voto vacio. Llama a `modificarVoto` de `api.js` y recarga el progreso, sin dialogo de exito. Ante un 409 descarta el progreso guardado y recarga las votaciones para mostrar los resultados finales.
- Tests: `backend/tests/test_modificar_voto.py` y `frontend/src/tests/ResultadosVotacion.test.js`.

Backoffice:

- inicio de sesion de administradores con bloqueo por intentos fallidos, auditoria y cierre por inactividad
- consulta de usuarios de la plataforma con busqueda, filtros, paginacion y detalle
- gestion de categorias predefinidas de gastos, documentos y tareas del checklist (US 110)
- monitoreo del consumo, fallas y costo estimado de los servicios de IA con umbral mensual y alerta por correo (US 114)

Backend:

- Listado de viajes
- Alta de viaje
- Listado de usuarios
- El usuario actual se resuelve desde la autenticación vigente; no documentar ni asumir usuarios hardcodeados
- Invitaciones externas persistidas y preparadas para envio de mail

Frontend activo:

- Home en Expo
- Tabs base del producto
- Pantalla de perfil con lectura y edicion de nombre, apellido, nombre de usuario y foto
- Pantalla de nuevo viaje en Expo
- Busqueda de usuarios contra backend
- Agregado de participantes registrados
- Invitacion externa desde el mismo buscador


## Reglas de colaboracion

- Antes de cambiar stack, estructura o criterio visual base, conversar el cambio
- Si se toma una nueva convencion, actualizar este archivo en el mismo trabajo
- No dejar decisiones arquitectonicas relevantes solo en chat o commits


### Reenvio de confirmacion de cuenta

- `POST /auth/resend-confirmation` es publico y recibe `email` normalizado; responde un mensaje generico para cuentas inexistentes, confirmadas, sociales o inactivas. Solo envia a cuentas locales activas, sin baja y con email pendiente.
- Registro y reenvio comparten `backend/app/services/auth/email_confirmation_service.py` y las plantillas `confirm_email`; los fallos u omisiones del proveedor se registran sin revertir el alta ni revelar la existencia de la cuenta en el reenvio.
- Cada enlace JWT tiene 24 horas de vigencia; reenviar no invalida enlaces anteriores. Confirmar nuevamente con un enlace valido es idempotente.
- `SolicitudesConfirmacionEmail` (migracion `e1710c0f1a01`, sobre `a1060d4b5c7e`) registra hash de email, IP y fecha para todos los intentos admitidos: espera de 60 segundos por email y maximo 5 por hora por email o IP. PostgreSQL serializa la validacion y registro con advisory locks transaccionales para evitar saltarse limites con solicitudes concurrentes.
- Los limites devuelven 429 y `Retry-After`; CORS expone ese header. El login devuelve `X-Error-Code: EMAIL_CONFIRMATION_REQUIRED` solo tras verificar la password de una cuenta activa pendiente.
- El reenvio se ofrece tras el registro, desde el login bloqueado por confirmacion y desde un enlace invalido/vencido. `ResendConfirmationForm` comparte validacion, progreso, resultado y espera; `ResendConfirmationScreen` permite ingresar el email cuando se abre desde un enlace vencido. Nunca indicar volver a registrarse por un enlace vencido.