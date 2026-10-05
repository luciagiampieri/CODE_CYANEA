# AGENTS.md

Guia operativa de Cyanea para colaboradores humanos y agentes como Codex.

Si trabajas con Codex, pide primero que lea este archivo completo antes de proponer o implementar cambios.

Regla permanente:

- Toda nueva definicion tecnica, convencion, criterio de implementacion, decision de arquitectura o cambio de estructura del proyecto debe actualizarse en este `AGENTS.md` dentro del mismo trabajo.

## Objetivo del proyecto

Cyanea es una aplicacion para organizacion colaborativa de viajes grupales.

Alcance actual del MVP:

- Creacion de viajes
- Incorporacion de participantes registrados
- Invitaciones externas por correo
- Estructura base para viajes, usuarios, participaciones e invitaciones
- Frontend unico con Expo para mobile y web
- Backend FastAPI
- Persistencia en PostgreSQL

Fuera de alcance por ahora:

- Autenticacion real
- Pagos reales
- Venta de pasajes o reservas
- Integraciones externas complejas

## Stack tecnologico

- Frontend activo: Expo + React Native + React Navigation + Expo Web
- Frontend de resguardo: `frontend-ant/` con React + Vite, solo referencia historica
- Backend: FastAPI + SQLAlchemy + Alembic
- Base de datos: PostgreSQL
- Entorno local esperado:
  - Python 3.12
  - Node.js 20
  - PostgreSQL 16 o compatible

Nota de entorno actual:

- Expo 56 requiere Node `>= 20.19.4`
- si una maquina tiene `20.18.x`, conviene actualizar dentro de Node 20 antes de ejecutar el frontend Expo

## Estructura del repositorio

```text
CODE_CYANEA/
|- AGENTS.md
|- README.md
|- docker-compose.yml
|- backend/
|  |- app/
|  |  |- api/
|  |  |  `- routes/
|  |  |- core/
|  |  |- db/
|  |  |- models/
|  |  |- schemas/
|  |  |- services/
|  |  |  |- mail/
|  |  |  `- notifications/
|  |  |- templates/
|  |  |  `- emails/
|  |  `- main.py
|  |- alembic/
|  |- scripts/
|  |  `- sql/
|  |- tests/
|  |- .env.example
|  |- pyproject.toml
|  `- README.md
|- frontend/
|  |- assets/
|  |- src/
|  |  |- components/
|  |  |- hooks/
|  |  |- navigation/
|  |  |- screens/
|  |  |- services/
|  |  `- theme/
|  |- .env.example
|  |- App.js
|  |- app.json
|  |- index.js
|  |- package.json
|  `- README.md
|- frontend-ant/
|  `- ... resguardo del frontend anterior
`- logs/
```

Reglas estructurales vigentes:

- `frontend/` es el unico frontend activo del proyecto
- `frontend-ant/` queda solo como respaldo y referencia visual/funcional
- No crear carpetas paralelas tipo `frontend-mobile/`, `frontend-web/` o similares
- No continuar nuevas funcionalidades en `frontend-ant/`
- El backend activo es solo `backend/` con FastAPI
- No reintroducir restos de backend Node/Express

## Instalacion local

### 1. Requisitos

Instalar:

- Python 3.12
- Node.js 20
- PostgreSQL

Notas:

- Se recomienda usar `nvm` o equivalente para manejar varias versiones de Node.
- No asumir que todos usan el mismo puerto de PostgreSQL.

### 2. Backend

Desde `backend/`:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
```

Variables esperadas en `backend/.env`:

```env
APP_NAME=Cyanea API
APP_ENV=development
API_V1_PREFIX=/api/v1
DATABASE_URL=postgresql+psycopg://usuario:password@127.0.0.1:5432/cyanea
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006
MAIL_ENABLED=false
MAIL_PROVIDER=smtp
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_USE_TLS=true
MAIL_FROM_EMAIL=no-reply@cyanea.local
MAIL_FROM_NAME=Cyanea
MAIL_REPLY_TO=
MAIL_FRONTEND_BASE_URL=http://127.0.0.1:8081
```

Levantar backend:

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 3. Frontend

Desde `frontend/`:

```powershell
copy .env.example .env
npm install
npm run web
```

Variable esperada en `frontend/.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

Comandos utiles:

```powershell
cd frontend
npm run start
npm run web
npm run web:clear
npm run android
```

Build Android nativa en carpetas sincronizadas:

- Si el repositorio esta dentro de OneDrive y Gradle falla con `AccessDeniedException` sobre `frontend/android/app/build`, ejecutar la build con `CYANEA_ANDROID_BUILD_ROOT` apuntando a una carpeta local fuera de OneDrive, por ejemplo `$env:TEMP\cyanea-android-build`
- `frontend/android/build.gradle` solo redirige el `buildDir` del modulo `:app` cuando esa variable esta definida; el root Android y los modulos de dependencias conservan su `buildDir` para no romper autolinking ni React Native Codegen
- Si la development build Android abre Metro pero falla con `Compiling JS failed` sobre `transform.bytecode=1`, levantar Expo con `CYANEA_DISABLE_HERMES_BYTECODE=1`; `frontend/metro.config.js` conserva Hermes y solo quita `transform.bytecode` de las URLs servidas por Metro en desarrollo

Notas del frontend Expo:

- `npm run web` levanta el frontend en `http://localhost:8081`
- Los scripts ya incluyen `EXPO_NO_METRO_WORKSPACE_ROOT=1`
- `frontend/metro.config.js` conserva el resolver por defecto de Expo 57; no fijar dependencias base con `resolver.extraNodeModules` ni desactivar `resolver.unstable_enablePackageExports`, porque puede romper la resolucion del paquete `expo` en web
- Mantener `react` y `react-dom` exactamente en la misma version
- El proyecto EAS activo del frontend es `@lcorrea87s-team/cyanea` con `extra.eas.projectId=0dddd612-ef66-4470-9a77-ce206f823efd`; `frontend/eas.json` define perfiles `development` y `production`
- Los builds EAS deben excluir `logs/` y temporales locales mediante `.easignore`, y las carpetas locales `eas-tmp/`, `eas-tmp-build/` y `eas-tmp-clean/` deben estar ignoradas por Git; en repos dentro de OneDrive, usar `TEMP`/`TMP` fuera de `C:` cuando falte espacio o Windows bloquee carpetas temporales

### 4. Base de datos

Crear la base `cyanea` y configurar `DATABASE_URL`.

Para crear estructuras y seeds del MVP usar los scripts SQL en `backend/scripts/sql`.

## API util

- Swagger: `http://127.0.0.1:8000/docs`
- Health: `GET /health`

## Convenciones generales

### Idioma

- Dominio, tablas, entidades y columnas: espanol
- Codigo tecnico de framework, nombres de funciones utilitarias y estructuras internas: puede convivir con ingles si ya sigue el stack

### Regla de oro

Respetar el modelo de dominio en espanol. No introducir nombres tipo `trip_id`, `user_id`, `trip_member` o equivalentes en ingles para entidades del dominio.

## Convenciones de base de datos

### Tablas

- Nombre en espanol
- Nombre en plural
- Ejemplos:
  - `Usuarios`
  - `Viajes`
  - `ParticipantesViajes`
  - `EstadosViajes`

### Columnas

- Nombre en espanol
- Formato camelCase con inicial mayuscula en persistencia actual del proyecto
- Ejemplos:
  - `IdViaje`
  - `IdUsuario`
  - `FechaCreacion`
  - `NombreUsuario`

### Normalizacion

- Mantener estructura normalizada
- No persistir estados o roles funcionales como texto libre si existe tabla maestra
- Relaciones por ids a tablas maestras cuando corresponda

### Tablas maestras actuales

- `EstadosViajes`
- `RolesParticipantes`
- `EstadosParticipaciones`
- `EstadosInvitaciones`
- `EstadosTransferenciasLiquidaciones`

Datos maestros y seed:

- `backend/scripts/sql/007_datos_maestros.sql`
- `backend/scripts/sql/008_seed_minimo.sql`

## Liquidacion de gastos

Reglas vigentes para la HU de balance y liquidacion:

- El balance neto de cada participante se calcula siempre desde `Gastos` y `ParticipantesGastos`
- No persistir balances derivados por participante
- La persistencia se hace por version de liquidacion en:
  - `LiquidacionesViajes`
  - `TransferenciasLiquidaciones`
  - `EstadosTransferenciasLiquidaciones`
- Una liquidacion representa un plan ejecutable de transferencias para un viaje en un momento dado
- Cuando cambian los gastos del viaje se invalida la liquidacion activa anterior y se genera una nueva version
- Marcar una transferencia como realizada solo cambia su estado dentro de la liquidacion activa; no modifica los gastos base
- Al eliminar un gasto se eliminan tambien sus asignaciones en `ParticipantesGastos` y se debe recalcular la liquidacion activa para que balances y transferencias queden consistentes
- Un gasto no puede eliminarse si el viaje tiene alguna liquidacion con transferencias en estado `realizada`; en ese caso el backend bloquea con 409 para preservar la trazabilidad de pagos ya ejecutados
- La UI de esta HU se muestra dentro del tab `Gastos` del detalle del viaje, no en una pantalla paralela
- El contrato `GET /trips/{trip_id}/settlement` concentra el resumen financiero del viaje para la solapa `Gastos`, incluyendo total gastado del viaje, gasto individual asignado por participante, total pagado por participante y saldo neto/pendiente


## Asistente inteligente de planificacion

### Preferencias de planificacion (US 86)

- Las preferencias se modelan por participacion, no por usuario: `PreferenciasPlanificacion.IdParticipanteViaje` es UNIQUE, asi cada participante tiene una sola fila por viaje y las preferencias de un viaje no se aplican a otro (RNF-14)
- Intereses y ritmos son tablas maestras (`InteresesPlanificacion`, `RitmosViajes`) sembradas por la migracion `b86a1c2d3e4f`; la relacion N a N con los intereses elegidos vive en `PreferenciasPlanificacionIntereses`
- `PresupuestoDiarioARS` es opcional, se expresa en pesos argentinos (RN-39) y tiene CHECK `> 0`; `Consideraciones` es opcional, hasta 300 caracteres, y se guarda `NULL` si queda en blanco
- Contrato: `GET /trips/{trip_id}/preferencias-planificacion` devuelve las preferencias propias, las opciones activas y `PuedeEditar`; `PUT` en la misma ruta crea o reemplaza las preferencias propias
- `GET /users/me/preferencias-planificacion` lista los viajes vigentes del usuario (participacion `aceptado`, viaje no finalizado, cancelado ni eliminado) con el estado de sus preferencias; alimenta la pantalla de Configuracion
- Solo pueden configurar los participantes con estado `aceptado` y mientras el viaje no este finalizado (409 `TRIP_FINISHED`); las reglas de negocio se validan en la ruta y devuelven 400 con mensajes en espanol
- Las preferencias se envian anonimizadas al servicio de IA; la UI lo informa debajo del campo de consideraciones
- En el frontend las preferencias se gestionan desde Configuracion > Preferencias > "Planificacion de viajes" (`PlanningPreferencesListScreen`, ruta `PreferenciasPlanificacion`), que lista los viajes vigentes y abre el formulario `PlanningPreferencesScreen` como modal para el viaje elegido
- No se agrega un acceso fijo en el detalle del viaje: la US 87 pide completar las preferencias en contexto al solicitar sugerencias si el usuario todavia no las configuro
- Los tests reutilizan la fixture `planificacion_master_data` de `backend/tests/conftest.py`

## Escaneo de comprobantes con IA (US 93)

- Contrato: `POST /gastos/trips/{trip_id}/escanear-comprobante` (multipart, campo `archivo`) devuelve los datos para precargar el formulario con los mismos nombres de `GastoCreate` (`Nombre`, `MontoOriginal`, `MonedaOriginal`, `FechaGasto`, `IdCategoria`) mas `CamposBajaConfianza`; no persiste nada: el gasto se registra recien con `POST /gastos` cuando el usuario confirma (RNF-31)
- Orden de validaciones en la ruta: participante `aceptado` (`require_trip_edit_access`), viaje no finalizado (409 `TRIP_FINISHED`), consentimiento (403 `AI_CONSENT_REQUIRED`), formato por firma real JPG/PNG (415) y tamano hasta 10 MB (413), llamada a la IA con timeout, validacion de esquema y reglas de negocio
- A diferencia de la carga manual, el escaneo se bloquea en viajes finalizados (decision de la US: limita el consumo de IA); la carga manual de gastos sigue permitida como define `tripLock.js`
- Los errores llevan `X-Error-Code`: `AI_CONSENT_REQUIRED`, `RECEIPT_INVALID_FORMAT`, `RECEIPT_TOO_LARGE`, `RECEIPT_NOT_RECOGNIZED` (422), `AI_UNAVAILABLE` (503), `AI_TIMEOUT` (504), `AI_RATE_LIMITED` (429), `AI_INVALID_RESPONSE` (502); todos los mensajes ofrecen la carga manual (RNF-30) y cualquier excepcion inesperada del proveedor se degrada a 503
- El servicio vive en `backend/app/services/receipt_ai/`: los proveedores (`gemini.py`, `mock.py`) solo devuelven el JSON crudo; `processing.py` valida el esquema (`ExtraccionComprobanteIA`) y aplica las reglas de negocio igual para cualquier proveedor (RNF-32, RNF-37)
- Proveedor por configuracion: `AI_RECEIPT_PROVIDER=gemini|mock`, `GEMINI_API_KEY`, `AI_RECEIPT_MODEL` (por defecto `gemini-3.8-flash`; Google ya no habilita `gemini-2.5-flash` a usuarios nuevos). El razonamiento se baja al minimo segun la familia: `thinkingBudget: 0` en 2.5 y `thinkingLevel: "low"` en Gemini 3 o posterior (`minimal` no esta soportado en 3.8 Flash) y `AI_RECEIPT_TIMEOUT_SECONDS` (12 s, deja margen para los 15 s del RNF-34); Gemini se llama por REST `generateContent` con `responseJsonSchema` usando httpx, sin SDK
- Modelo de respaldo (RNF-30): `AI_RECEIPT_FALLBACK_MODEL` (por defecto `gemini-3.5-flash-lite`, vacio = sin respaldo). Si el modelo principal responde con error HTTP (saturado 503, limite 429, retirado 404, etc.), falla la red o no responde a tiempo, se reintenta una sola vez con el de respaldo; si el principal respondio (imagen bloqueada, JSON invalido) no se reintenta. Ambos intentos comparten `AI_RECEIPT_TIMEOUT_SECONDS`: el principal usa hasta el 60% y el respaldo el resto, y el log registra cuando se uso el respaldo
- Al proveedor solo viajan la imagen y los nombres de las categorias activas; ningun dato de participantes (RNF-33). Se recomienda usar Gemini con facturacion activa: en el plan gratuito Google puede usar los datos enviados para mejorar sus modelos
- Reglas de negocio: un dato inutilizable deja el campo vacio (nunca se inventa, AC9): fecha futura o mal formada, moneda inexistente en `Monedas`, categoria desconocida, monto <= 0 o fuera de `Numeric(12,2)`; al nombre del comercio se le quita el CUIT y se corta a 150 caracteres. Se marcan para revision la baja confianza informada por el modelo, la moneda inferida (`moneda_explicita=false`, por ejemplo solo "$") y las fechas de mas de un ano
- El consentimiento se persiste en `Usuarios.ConsienteProcesamientoIA` y `Usuarios.FechaConsentimientoIA` (migracion `c93e5a7b1d20`), viaja en `/users/me` como `consienteProcesamientoIA` y se otorga o revoca con `PUT /users/me/consentimiento-ia`; se resetea al anonimizar la cuenta
- Los tests nunca llaman al servicio real: reemplazan la dependencia `get_receipt_extractor` con `app.dependency_overrides` y prueban el cliente de Gemini con `httpx.MockTransport`
- La precision (RNF-35) y los tiempos (RNF-34) se miden con `python -m scripts.evaluar_escaneo_comprobantes <carpeta>` sobre tickets reales y un `esperado.csv`
- Frontend: `frontend/src/components/trip/ReceiptScanButton.js` concentra el flujo (camara o galeria, consentimiento la primera vez, validacion, compresion, progreso con tiempo maximo de 15 s y banner de error con "Completar manualmente"); `frontend/src/utils/receiptImage.js` valida formato y tamano sobre la imagen original (en mobile acepta tambien HEIC/HEIF, el formato de las fotos de iPhone, porque la compresion siempre genera JPEG; en web los rechaza porque el navegador no los decodifica; el picker pide `preferredAssetRepresentationMode: "compatible"` para que iOS entregue JPEG cuando puede) y comprime con `expo-image-manipulator` (API `ImageManipulator.manipulate`, no `manipulateAsync` que esta deprecada) a 1600 px en el lado mayor, JPEG calidad 0,7
- `AddGastoScreen` recibe `puedeEscanear` (TripDetail pasa `!lock.isFinished`) y precarga con `aplicarEscaneo`: los campos a revisar se resaltan con `colors.warning`/`warningSurface` hasta que el usuario los edita; sin fecha legible el campo queda vacio y el formulario exige completarla; si no se detecto la moneda se mantiene la del viaje y se pide revisarla, porque el selector no puede quedar vacio
- Fuera de alcance de esta US: guardar la foto del comprobante en el repositorio del viaje y limitar usos por viaje (RNF-36)

## Confirmar gasto precargado desde un comprobante (US 94)

- Se reutiliza `AddGastoScreen`: las reglas de esta US aplican cuando el formulario se precargo desde un comprobante (`escaneoAplicado`, tanto por `ReceiptScanButton` como por `initialData` de la US 84); la carga manual no cambia
- `ReceiptScanButton` llama `onScanned(datos, imagen)`; `imagen.uri` (JPEG comprimido) se muestra como vista previa ampliable junto al formulario (AC1). La imagen no se persiste: se borra del cache con `expo-file-system` (`File.delete`) al registrar, al cancelar o al re-escanear (AC9)
- Cancelar (boton "Cancelar", cruz o back de Android) pide confirmacion con `confirmar()` de `frontend/src/utils/dialogs.js` y no llama a `createExpense`. `dialogs.js` usa `window.confirm`/`window.alert` en web porque `Alert.alert` de React Native Web no muestra botones
- Pagador por defecto (AC4): `GET /gastos/trips/{trip_id}/participants` devuelve `EsUsuarioActual`; el formulario precarga `IdPagador` con ese participante. En gasto personal se informa "Pagado por ... (vos)"; para cambiar el pagador se elige "Compartido". El cache offline `cache_participantes` guarda `es_usuario_actual` para precargar el pagador sin conexion
- Validaciones (AC3): `frontend/src/utils/comprobanteGasto.js` concentra las reglas puras (`parsearMonto` acepta coma decimal y exige numero > 0 segun RN-21, `requiereConversionARS`, `fechaFueraDelViaje`). El backend valida `MontoOriginal > 0` (400) y, en gasto compartido, `IdPagador` obligatorio y participante activo del viaje (RN-19)
- Conversion a ARS (AC6, AC7, RN-39): si la moneda del comprobante no es `ARS` se informa la moneda detectada y el monto en pesos se completa automaticamente con `GET /monedas/cotizacion?origen&destino=ARS&monto&fecha` (mismo servicio de la US-85, cotizacion de la fecha del gasto o de hoy si es futura; requiere sesion; 503 `EXCHANGE_RATE_UNAVAILABLE` si no responde). El usuario puede corregir el monto (queda "manual" y no se recalcula) y volver a "Usar la cotizacion automatica". Solo si la cotizacion falla se exige ingresarlo a mano; mientras se calcula no se puede confirmar. `GastoCreate` suma `DesdeComprobante` y `MontoConvertidoARS` (el frontend siempre envia el monto en ARS que ve el usuario):
  - con `MontoConvertidoARS` (moneda distinta de ARS) se usa ese monto en lugar de la cotizacion automatica de la US-85; `TipoCambio = Monto / MontoOriginal`. Si la moneda base del viaje no es ARS, el monto en ARS se lleva a la moneda base con el servicio de cotizacion
  - con `DesdeComprobante=true`, moneda distinta de ARS y sin `MontoConvertidoARS` se responde 400 con `X-Error-Code: CONVERSION_REQUIRED`
  - sin `DesdeComprobante` (carga manual) se mantiene la conversion automatica de la US-85
  - la division personalizada se compara contra el monto convertido a ARS cuando el viaje esta en ARS
- Modo offline: `gastos_pendientes` guarda `desde_comprobante` y `monto_convertido_ars`, y `sincronizarGastosOffline` los reenvia solo para gastos de comprobante (los manuales mantienen el payload de la US-85). Sin esto, al sincronizar se aplicaria la cotizacion automatica en lugar del monto en ARS ingresado. Las columnas nuevas se agregan a instalaciones existentes desde `inicializarBaseDeDatos` (reconstruccion de `gastos_pendientes` y `ALTER TABLE` en `cache_participantes`)
- Fecha fuera del viaje (AC8): `AddGastoScreen` recibe `FechaInicioViaje`/`FechaFinViaje` (TripDetail las pasa directo y a `DocumentsScreen` como `tripFechaInicio`/`tripFechaFin`) y muestra una nota informativa, sin dialogo ni bloqueo: pagar antes del viaje (reservas, excursiones, pasajes) es normal, y la nota sirve para detectar una fecha mal leida del comprobante (por ejemplo un ano equivocado). El backend tampoco lo bloquea
- Tests: `backend/tests/test_confirmar_gasto_comprobante.py` y `frontend/src/tests/ConfirmarGastoComprobante.test.js` (mapean CP1 a CP10); la persistencia offline en `GastosLocal.test.js` y las migraciones SQLite en `DatabaseNative.test.js`

## Integraciones externas

- Ninguna integracion externa no esencial debe impedir los flujos base del dominio
- Si falla la resolucion automatica de portada, lugares o metadata externa, el viaje debe poder crearse o actualizarse igual, degradando funcionalidad en forma controlada y registrando warning
- El asistente IA del viaje se expone desde `POST /trips/{trip_id}/assistant/messages` y usa el proveedor configurado por `AI_ASSISTANT_*`; para pruebas automatizadas debe poder usarse `AI_ASSISTANT_PROVIDER=mock`
- El asistente IA reutiliza `GEMINI_API_KEY` cuando `AI_ASSISTANT_PROVIDER=gemini`; si `AI_ASSISTANT_MODEL` o `AI_ASSISTANT_FALLBACK_MODEL` quedan vacios, usa `AI_RECEIPT_MODEL` y `AI_RECEIPT_FALLBACK_MODEL`; el backend consume Gemini por REST y no debe requerir SDK adicional para esta funcionalidad
- En redes locales con inspeccion TLS o certificados corporativos, `GEMINI_VERIFY_SSL=false` permite probar Gemini desde Python/httpx; mantener `true` por defecto y no desactivar verificacion SSL fuera de entornos controlados
- El uso del asistente IA requiere consentimiento explicito del usuario en `Usuarios.ConsienteAsistenteIA`, gestionado por `PUT /users/me/consentimiento-asistente-ia`
- Toda accion mutante propuesta por el asistente debe persistirse primero en `AccionesAsistenteViaje` con estado `propuesta` y ejecutarse solo tras confirmacion explicita del usuario
- Las herramientas permitidas inicialmente para el asistente son: crear actividad de itinerario, crear tarea de checklist, registrar gasto, crear votacion y generar ruta diaria; no habilitar acciones destructivas ni pagos reales desde el asistente
- Las recomendaciones, resumenes e ideas de viaje del asistente deben resolverse como respuesta conversacional directa; solo se crea una accion confirmable cuando el usuario pide guardar, registrar, crear o generar algo concreto
- El frontend del asistente debe enviar el historial conversacional reciente al backend; el backend lo expone al LLM como `conversacionReciente` y el modelo debe combinar datos de varios mensajes antes de pedir informacion nuevamente
- Si el usuario envia nuevos datos mientras existe una accion propuesta pendiente, el frontend debe marcar la accion anterior como resuelta/descartada para evitar confirmar operaciones viejas con informacion incompleta
- El proveedor IA del asistente actua como capa de extraccion estructurada: debe devolver `AssistantIntent` con `intent`, `confidence`, `payload`, `missingFields`, `clarifyingQuestion` y `response`; la clasificacion semantica de intencion y parametros corresponde al LLM, no a listas de palabras en backend
- El backend del asistente valida la extraccion, construye la propuesta confirmable y ejecuta tools solo tras confirmacion; puede normalizar formatos mecanicos y bloquear datos genericos, pero no debe clasificar la intencion de usuario mediante palabras hardcodeadas
- Las tools del asistente deben normalizar payloads conversacionales antes de ejecutar acciones: aceptar alias habituales de campos (`monto`, `importe`, `titulo`, `dia`, etc.), importes con formato local (`10.000`, `$ 10.000`, `10000`) y booleanos textuales (`si`, `no`, `true`, `false`)
- Para `registrar_gasto`, el concepto (`nombre`) y la categoria deben ser inferidos por el LLM desde la conversacion y validados por backend contra categorias activas; no guardar gastos con nombres genericos como "Gasto registrado por IA" ni asignar una categoria por fallback silencioso
- Las acciones propuestas por el asistente deben conservar el mensaje original del usuario en el payload interno (`_userMessage`) para permitir recuperacion defensiva de datos obvios si el proveedor IA devuelve un payload incompleto
- El contexto del asistente debe incluir los lugares guardados del viaje para que `crear_actividad` pueda asociar `idLugarInteresViaje`; si el proveedor solo devuelve un nombre de ubicacion, la tool debe intentar vincularlo con lugares existentes antes de crear la actividad sin ubicacion
- Para actividades creadas por el asistente con una ubicacion textual no guardada previamente, el backend puede crear un `LugarInteres` sintetico vinculado al viaje con `GooglePlaceId` prefijado por `assistant:` y `MetadataJson.approximate=true`; si no hay coordenadas del lugar, usa el centro del primer destino del viaje como referencia aproximada
- Toda tool nueva o modificada del asistente debe quedar cubierta por tests backend en `backend/tests/test_assistant_ai.py`, verificando propuesta, confirmacion y persistencia real de la accion ejecutada
- El contexto enviado al modelo debe ser un resumen operativo del viaje y no debe incluir credenciales, hashes, tokens ni datos sensibles innecesarios

## Convenciones de scripts SQL

- Carpeta base: `backend/scripts/sql/`
- Un script por tabla o estructura principal
- Prefijo numerico para ordenar ejecucion
- Incluir script agregador `run_all.sql`
- Los scripts deben ser idempotentes cuando sea razonable

Orden actual:

- `001_estados_viajes.sql`
- `002_roles_participantes.sql`
- `003_estados_participaciones.sql`
- `004_usuarios.sql`
- `005_viajes.sql`
- `006_participantes_viajes.sql`
- `006a_estados_invitaciones.sql`
- `006b_invitaciones_viajes.sql`
- `007_datos_maestros.sql`
- `008_seed_minimo.sql`
- `009_actividades_itinerario.sql`
- `010_tokens_push_usuarios.sql`
- `011_recordatorios_actividades_notificados.sql`

## Convenciones de backend

- FastAPI expone rutas en `backend/app/api/routes/`
- Modelos ORM en `backend/app/models/`
- Schemas pydantic en `backend/app/schemas/`
- Acceso a base en `backend/app/db/`
- Servicios reutilizables en `backend/app/services/`
- El modulo de mail es compartido y debe servir para invitaciones, notificaciones futuras, recuperacion de password y casos similares
- Las notificaciones funcionales por correo deben pasar por un servicio central `NotificationService` en `backend/app/services/notifications/`
- Los correos transaccionales de registro y bienvenida no deben bloquear la creacion de cuenta si el proveedor SMTP falla; se registra warning y el flujo principal responde correctamente
- Aunque la pantalla de perfil todavia no exista, las preferencias y el consentimiento de email se modelan desde `Usuarios` y deben viajar en `/users/me`
- La aceptacion de terminos y condiciones se persiste en `Usuarios.AceptaTerminos`, `Usuarios.FechaAceptacionTerminos` y `Usuarios.VersionTerminosAceptada`; todos los flujos de registro deben exigirla y guardar la version vigente configurada por `TERMS_VERSION`
- El texto vigente de terminos y condiciones se expone publicamente desde `GET /legal/terms` para que el frontend lo muestre antes de crear la cuenta
- La foto de perfil del usuario se almacena en Supabase Storage dentro del bucket configurado, bajo el prefijo `profile-photos/`, y la URL resultante se persiste en `Usuarios.FotoUrl`
- La busqueda de destinos para alta y edicion de viaje se resuelve desde backend contra Google Places y se configura con `GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAPS_API_KEY` es una credencial server-side del backend para Google Places/Directions; no debe reutilizar una key restringida a Android o a referrers web, porque Google bloquea esas llamadas desde FastAPI
- La portada visual del viaje se resuelve desde Google Places usando el primer destino seleccionado como referencia
- El backend persiste `Viajes.GooglePlaceIdPortada` y expone la imagen por proxy propio para no exponer la API key de Google en el frontend
- La exploracion de lugares de interes del viaje usa Google Places para busqueda y Google Maps JavaScript en web para visualizacion interactiva
- La key de Google Maps para Android nativo de `react-native-maps` se configura en build con `GOOGLE_MAPS_ANDROID_API_KEY` desde `frontend/.env`, variables de entorno locales o secretos EAS; no debe quedar hardcodeada en `frontend/app.json`
- En mobile nativo Expo, la fase 1 de parity usa `react-native-maps` en `frontend/src/components/map/MapCanvas.native.js`; la logica de busqueda, detalle y recomendados sigue centralizada en backend
- En mobile nativo Expo, la fase 2 de parity habilita seleccion de POIs desde el mapa nativo con `onPoiClick` y presenta recomendados en formato bottom-sheet en lugar de panel lateral
- El ranking de atracciones populares en exploracion se calcula dinamicamente desde Google Places segun el centro visible del mapa
- El ranking de atracciones populares en exploracion debe presentarse en un panel lateral o modal dedicado, no intercalado en el flujo principal de seleccion y guardado de lugares
- Los destinos base del viaje contextualizan busquedas y recomendaciones de lugares, pero no restringen geograficamente lo que se puede guardar o agendar: un viaje puede incluir escapadas a otras ciudades, provincias o paises
- Los componentes del feature de mapa viven en `frontend/src/components/map/`
- Toda llamada a Google Places desde una ruta debe capturar la excepcion y responder 502 (o 503 si falta `GOOGLE_MAPS_API_KEY`), usando `_error_servicio_lugares` en `places.py`: un 500 no controlado sale sin headers CORS y el navegador lo informa como error de CORS. El helper deja en el log la respuesta textual de Google
- Las rutas de coleccion se declaran con `""` (no `"/"`) para que `/recurso` responda sin redireccion 307; si una ruta necesita aceptar ambas variantes, se agrega un segundo decorador `"/"` con `include_in_schema=False`
- uvicorn corre con `--proxy-headers --forwarded-allow-ips='*'` porque en Railway queda detras de un proxy HTTPS: sin eso cualquier redireccion sale como `http://` y el navegador la bloquea por mixed content
- La HU 23 de visualizacion de recorridos se considera cerrada cuando:
  - la ruta generada puede abrirse en un mapa interactivo desde el dia correspondiente del itinerario
  - si no existe una ruta generada para ese dia, no debe mostrarse el mapa ni el CTA de visualizacion
  - en ausencia de ruta, la UI debe mostrar un mensaje informativo explicito indicando que todavia no hay un recorrido disponible y, cuando corresponda, que primero se debe generar la ruta o completar actividades con ubicacion
- El flujo vigente del feature es:
  - buscar lugar con Google Places
  - al seleccionar un lugar, consultar Place Details para cargar rating y reseñas on-demand
  - guardar lugar en el viaje
  - visualizarlo en mapa junto a destinos base
  - sugerir atracciones populares segun la ciudad o zona actualmente visible
  - agendarlo en un `DiaCronograma`
  - crear una `ActividadItinerario` vinculada a `IdLugarInteresViaje`

### Convenciones de notificaciones

- El consentimiento general de notificaciones por email se persiste en `Usuarios.ConsienteNotificacionesEmail`
- El consentimiento general de notificaciones push se persiste en `Usuarios.ConsienteNotificacionesPush`
- Las preferencias iniciales por tipo tambien se persisten en `Usuarios`
- Flags actuales:
  - `RecibeEmailsNuevaVotacion`
  - `RecibeEmailsCambiosViaje`
  - `RecibeEmailsNuevosGastos`
  - `RecibeEmailsRecordatoriosDeuda`
  - `RecibeEmailsRecordatoriosActividad`
  - `RecibeEmailsRecordatoriosReserva`
  - `RecibePushNuevaVotacion`
  - `RecibePushCambiosViaje`
  - `RecibePushNuevosGastos`
  - `RecibePushRecordatoriosDeuda`
  - `RecibePushRecordatoriosActividad`
  - `RecibePushRecordatoriosReserva`
- El backend no debe enviar notificaciones funcionales si el usuario no esta activo, no confirmo email, no otorgo consentimiento o desactivo el tipo correspondiente
- En Expo Go para Android no se inicializa `expo-notifications` para push remotas, porque Expo Go no soporta esa funcionalidad desde SDK 53; las pruebas reales de token push requieren una development build o app nativa instalada
- En Android, la development build para push remotas requiere Firebase/FCM configurado con `google-services.json` correspondiente al package `com.ticigaticasteam.cyanea`, referenciado desde `expo.android.googleServicesFile`, y una recompilacion nativa; sin ese archivo `expo-notifications` no puede obtener el token Expo Push
- `frontend/app.json` espera `frontend/google-services.json` para builds Android con push; ese archivo y `GoogleService-Info.plist` no se versionan, usar `frontend/google-services.example.json` solo como referencia de ubicacion/forma
- El proyecto nativo Android aplica `com.google.gms.google-services` con classpath `com.google.gms:google-services:4.5.0`; al recompilar localmente copiar `frontend/google-services.json` a `frontend/android/app/google-services.json`
- Las credenciales FCM V1 de Expo/EAS estan asignadas en `@lcorrea87s-team/cyanea` para `com.ticigaticasteam.cyanea`, usando la service account de Firebase `cyanea-8aba1`; si cambia el `projectId` de EAS hay que regenerar el Expo Push Token en el dispositivo y actualizar `TokensPushUsuarios`
- Para pruebas locales de push en development build Android, si Metro/Hermes falla al cargar el bundle con bytecode, usar `CYANEA_DISABLE_HERMES_BYTECODE=1` al levantar Expo; no reemplaza la prueba posterior de una build productiva
- Los tokens push de Expo se persisten en `TokensPushUsuarios`; el frontend solo debe registrarlos despues de obtener permiso explicito del sistema y el backend debe desactivarlos si el usuario revoca `ConsienteNotificacionesPush`
- Los links incluidos en correos de notificacion deben resolverse desde `MAIL_FRONTEND_BASE_URL`
- Las notificaciones push funcionales se despachan desde el backend mediante el dispatcher central `dispatch_trip_notification`; los endpoints de dominio solo deben construir el evento y no llamar directamente a Expo
- El despacho push usa Expo Push API (`EXPO_PUSH_URL`) en lotes de hasta 100 mensajes; `EXPO_PUSH_ACCESS_TOKEN` es opcional y `PUSH_ENABLED=false` desactiva el envio externo sin desactivar las notificaciones internas
- Los eventos de viaje deben registrar siempre notificacion interna en `Notificaciones`; el envio push es complementario, respeta consentimiento, usuario activo, email confirmado, preferencias por tipo y tokens activos
- Si Expo devuelve `DeviceNotRegistered`, el token en `TokensPushUsuarios` se desactiva con `FechaBaja`; otros errores de push se registran como warning/error y no bloquean la operacion principal del dominio
- Los gastos nuevos usan `NotificationType.NUEVO_GASTO`; los recordatorios de deuda/liquidacion usan `NotificationType.RECORDATORIO_DEUDA` y se configuran por separado
- Los recordatorios de inicio de actividades usan `NotificationType.RECORDATORIO_ACTIVIDAD`; el scheduler de FastAPI escanea actividades proximas segun `ACTIVITY_REMINDER_MINUTES_BEFORE` y registra envios en `RecordatoriosActividadesNotificados` para no duplicar avisos
- La respuesta a una push en mobile se resuelve desde `frontend/src/services/notificationNavigation.js`; el payload debe incluir `tripId` y, si corresponde, `eventType`, `activityId`, `expenseId` o `votingId` para abrir `TripDetail` en la solapa adecuada

### Checklist de incorporacion push/FCM

Para retomar o replicar la configuracion de push Android:

- Subir al repo `frontend/eas.json`, los cambios de `frontend/app.json`, `frontend/google-services.example.json`, `.gitignore`, `frontend/.gitignore`, migraciones/modelos/servicios de notificaciones y `backend/.env.example`
- No subir `frontend/google-services.json`, `GoogleService-Info.plist`, service account JSON de Firebase, `.env`, `frontend/android/`, `cyfb/`, caches ni logs
- Cada integrante que compile Android debe obtener su `frontend/google-services.json` desde Firebase para el package `com.ticigaticasteam.cyanea`
- Las credenciales FCM V1 se administran desde EAS con `npx eas-cli credentials -p android`; usar `NODE_OPTIONS=--use-system-ca` si la red local agrega certificados self-signed
- El proyecto EAS activo es `@lcorrea87s-team/cyanea`; verificar con `npx eas-cli project:info`
- Despues de cambiar `extra.eas.projectId` o credenciales FCM, regenerar el Expo Push Token en cada dispositivo: desactivar y activar push en la app, o reinstalar si no se renueva
- Para Android emulador, `frontend/.env` debe apuntar al backend con `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api/v1`; para web local usar `http://127.0.0.1:8000/api/v1`
- Verificar en base que `TokensPushUsuarios` tenga solo tokens activos vigentes y que los tokens anteriores queden con `Activo=false` y `FechaBaja`
- Probar punta a punta creando una notificacion de viaje con `dispatch_trip_notification`; Expo debe responder ticket `status=ok`
- Si Expo responde `InvalidCredentials`, revisar que el token se haya emitido con el `projectId` EAS actual y que FCM V1 este asignado al package correcto

## Convenciones de frontend

### Regla estructural

- El frontend activo vive en `frontend/`
- No crear variantes paralelas del mismo frontend
- La navegacion principal vive en `frontend/src/navigation/`
- Las pantallas completas viven en `frontend/src/screens/`
- Los componentes reutilizables viven en `frontend/src/components/`
- El acceso HTTP vive en `frontend/src/services/api.js`
- Los tokens de diseno viven en `frontend/src/theme/tokens.js`
- Antes de crear estilos nuevos para una pantalla, revisar si el patron ya puede resolverse con componentes base como `PrimaryButton`, `Avatar`, `AvatarStack`, `IconCircleButton`, `MetricCard`, `AuthSwitch` o `StatusPill`

### Estilo e identidad visual

- Color primario: `#1e3e7b`
- Color acento: `#ffec80`
- Estilo limpio, profesional y mobile-first
- En Expo no se usa un `styles.css` global; la identidad visual debe centralizarse en tokens compartidos y helpers de estilo
- Evitar hardcodear colores, radios o espaciados por componente si ya existe token equivalente
- Los módulos de infraestructura nativa con dependencias exclusivas de dispositivo, como SQLite offline, deben resolverse con archivos por plataforma (`*.native.js` / `*.web.js`) para no romper el bundle web
- Los contenedores con area segura deben importar `SafeAreaView` desde `react-native-safe-area-context`, no desde `react-native`, para evitar la API deprecada en Expo/React Native
- La interfaz activa toma como referencia una app de viajes mobile-first con header azul profundo, superficies marfil y tarjetas con imagen protagonista
- Usar serif editorial para wordmark de marca, titulos grandes de pantalla, nombres de viajes y valores KPI
- Usar sans para labels, formularios, navegacion, metadata, tabs y acciones
- Los avatares del grupo deben mostrarse en formato circular, con borde claro y posibilidad de stack solapado
- Los CTAs primarios usan fondo azul y texto blanco; el manteca se reserva para acentos, badges, FABs y highlights
- Login y registro comparten shell visual con cabecera azul, superficie marfil y selector segmentado `Iniciar sesion / Crear cuenta`
- La home base usa saludo superior, KPI cards, cards de viaje con imagen, badge de estado, fecha, avatares y progreso, mas un FAB para crear viaje
- El detalle de viaje usa hero con imagen, acciones circulares flotantes, stack de avatares, tabs secundarios visuales y cards de agenda por dia
- Las estadisticas de viajes del perfil solo consideran viajes cuya fecha de inicio ya llego; los años futuros no se muestran como filtros

### Responsive

- El frontend nuevo se construye con enfoque mobile-first
- Debe funcionar en mobile y web
- En pantallas amplias, el layout debe aprovechar ancho sin estirarse en exceso
- Usar hooks o helpers responsive compartidos, no condicionales dispersos por toda la app

### Dialogos y mensajes

- No usar `Alert.alert` directamente: usar `appAlert` de `frontend/src/components/ui/AppDialog.js`, que tiene la misma firma y muestra el dialogo con la identidad visual de Cyanea
- `<DialogHost root />` se monta una sola vez en `App.js`; sin ese host (tests) `appAlert` delega en `Alert.alert` con los mismos argumentos, asi que los tests pueden seguir espiando `Alert.alert`
- No importar `Modal` de `react-native`: usar `import Modal from ".../components/ui/AppModal"` (mismas props). AppModal monta su propio `DialogHost` y `appAlert` dibuja el dialogo en el modal visible mas reciente; con el `Modal` de react-native el dialogo quedaria detras del modal abierto (Android nueva arquitectura / iOS)
- El tipo (icono y color) se deduce del titulo (`Éxito`, `Error`, `¿...?`, `Atención`) o se fuerza con `appAlert(titulo, mensaje, botones, { tipo: "success" | "error" | "warning" | "info" | "confirm" })`
- Botones: el de `style: "cancel"` queda como secundario a la izquierda; el ultimo boton no-cancelar es el principal; `style: "destructive"` lo pinta de rojo
- Para avisos simples o confirmaciones con promesa, preferir `avisar` y `confirmar` de `frontend/src/utils/dialogs.js`

### Invitaciones a viajes

- Se puede volver a invitar a un usuario cuya participacion este en `cancelada`, `rechazado`, `expulsado` o `salio`: el backend la reactiva como `invitado` y limpia `FechaRespuesta` (`ESTADOS_REINVITABLES` y `_reinvitar_participante` en `backend/app/api/routes/trips.py`). La misma regla aplica al invitar por `userId` y por `email`
- `invitado` o `aceptado` siguen respondiendo 409 ("El usuario ya está agregado al viaje")
- En el frontend, `SentInvitationsList` muestra "Volver a invitar" en las invitaciones rechazadas (prop `onResend`); `TripDetailScreen` pide confirmacion y reutiliza `addTripParticipant`

### Navegacion

- Usar React Navigation para la navegacion principal del frontend Expo
- No reintroducir `react-router-dom` en el frontend activo

### Componentes del dominio viaje

El flujo minimo actual incluye:

- Home de viajes
- Alta de viaje
- Buscador predictivo de participantes registrados
- Invitacion externa por correo desde el mismo flujo
- Lista unica de participantes agregados, distinguiendo registrados vs invitados pendientes

## Estado funcional actual

### Votaciones

- Las votaciones se pueden editar y eliminar solo mientras están abiertas y
  únicamente por su creador.
- El título y la fecha de cierre se pueden editar mientras la votación está
  abierta.
- El tipo y las propuestas no se pueden modificar después de que exista un
  voto, para conservar la coherencia del histórico de resultados.
- Eliminar una votación elimina también sus propuestas y votos relacionados.

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
