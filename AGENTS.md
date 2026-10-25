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

- Pagos reales
- Venta de pasajes o reservas
- Integraciones externas complejas

## Stack tecnologico

- Frontend activo: Expo (React Native + react-native-web)
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
|  |- Dockerfile
|  |- pyproject.toml
|  `- README.md          (stub requerido por pyproject y Dockerfile)
|- frontend/
|  |- assets/
|  |- src/
|  |  |- components/
|  |  |- context/
|  |  |- database/
|  |  |- hooks/
|  |  |- navigation/
|  |  |- screens/
|  |  |- services/
|  |  |- tests/
|  |  |- theme/
|  |  `- utils/
|  |- .env.example
|  |- App.js
|  |- app.json
|  |- app.config.js
|  |- eas.json
|  |- index.js
|  `- package.json
`- docs/
   |- testing-backend.md
   `- testing-frontend.md
```

Reglas estructurales vigentes:

- `frontend/` es el unico frontend activo del proyecto (el frontend anterior `frontend-ant/` fue retirado)
- No crear carpetas paralelas tipo `frontend-mobile/`, `frontend-web/` o similares
- El backend activo es solo `backend/` con FastAPI
- La documentacion para personas vive en el `README.md` raiz (instalacion, tests, despliegue) y en `docs/` (guias de testing); las convenciones tecnicas viven en este `AGENTS.md`. No agregar README por carpeta que dupliquen ese contenido
- No versionar artefactos generados: exports web (`frontend/dist/`, `frontend/.expo-export-check/`), reportes de jest/cobertura, lockfiles vacios ni archivos de sistema (`desktop.ini`)

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
- Para evitar errores `EPERM` de empaquetado local en Windows al subir builds EAS, el frontend incluye el workflow `frontend/.eas/workflows/create-production-builds.yml`; puede dispararse desde `frontend/` con `eas workflow:run .eas/workflows/create-production-builds.yml --ref main`
- El login con Google en Android requiere `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` en el build Expo/EAS y `GOOGLE_ANDROID_CLIENT_ID` en el backend; el client id Android vigente es `564342960055-g2p6m77qh93siqh7ljta8ffc4qhdl6gd.apps.googleusercontent.com` para el package `com.ticigaticasteam.cyanea`. El OAuth Client de Google Cloud debe tener registrados los SHA-1/SHA-256 de la firma usada por EAS/Play; si falta esa huella Google responde `Error 400: invalid_request`.
- En Android, `expo-auth-session` debe usar como redirect nativo `com.googleusercontent.apps.<client-guid>:/oauth2redirect` y ese scheme debe figurar en `frontend/app.json`; con el redirect por defecto `com.ticigaticasteam.cyanea:/oauthredirect`, Google puede rechazar la solicitud antes de devolver token con `Error 400: invalid_request`.

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
- `Planes`
- `EstadosSuscripciones`

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

### Aceptar sugerencia de actividad (US 88)

- Contrato: `POST /trips/{trip_id}/sugerencias-actividades/{sugerencia_id}/aceptar` con `HoraInicio`, `HoraFin` (opcionales, por defecto los de la sugerencia) y `ConfirmarSuperposicion`; responde `AceptacionSugerenciaRead`
- Esta llamada es la confirmación explícita del usuario (RNF-31). Si el horario se superpone con actividades del día y `ConfirmarSuperposicion=false`, no se crea nada y se responde 200 con `RequiereConfirmacion=true` y `Superpuestas`; la app pide confirmación y reenvía con `ConfirmarSuperposicion=true`
- Validaciones: participante `aceptado` (`require_trip_edit_access`), viaje no finalizado (409 `TRIP_FINISHED`), sugerencia del viaje (404 `SUGGESTION_NOT_FOUND`), solo estado `pendiente` (409 `SUGGESTION_ALREADY_ACCEPTED`, `SUGGESTION_IN_VOTING` o `SUGGESTION_NOT_PENDING`), fin posterior al inicio (400 `SLOT_INVALID`)
- Crea la `ActividadItinerario` en el día de la sugerencia con nombre, descripción, horario y lugar (reutiliza `obtener_o_crear_lugar` de `resolucion_votaciones.py`, el mismo que usa la US 91), pasa la sugerencia a `aceptada`, emite `actividad_creada` y `sugerencias_actualizadas` por websocket, sincroniza la ruta del día y notifica `NUEVA_ACTIVIDAD` con `dispatch_trip_notification` (respeta preferencias). Fallos de tiempo real o notificación no revierten la aceptación
- Frontend: `SuggestionCompactCard` muestra "Agregar al itinerario" solo en pendientes (prop `onAceptar`); `DaySuggestionsScreen` abre `components/trip/AcceptSuggestionModal.js` (horario editable, validación en `utils/aceptarSugerencia.js`, advertencia con `confirmar()`) y al aceptar muestra la confirmación y quita la sugerencia de la lista
- Tests: `backend/tests/test_aceptar_sugerencia.py` y `frontend/src/tests/AceptarSugerencia.test.js` (CP1 a CP10)

### Completar días libres con IA (US 92)

- La detección es pura y vive en `backend/app/services/activity_ai/franjas_libres.py`: día del cronograma sin actividades = día libre (09:00 a 22:00); en días con actividades, franja libre = tramo de al menos 3 h dentro de 09:00 a 22:00 (las actividades se recortan a la ventana y las superpuestas se unen); solo cuentan días posteriores a hoy (zona `AI_SUGGESTIONS_TIMEZONE`)
- Contratos: `GET /trips/{trip_id}/sugerencias-actividades/franjas-libres` (`Franjas`, `ItinerarioCompleto`, `Mensaje`, `SolicitudesRestantes`, `LimiteDiario`, `MaxSugerenciasPorFranja`) y `POST /trips/{trip_id}/sugerencias-actividades/completar-dias-libres` con `Franjas` (`IdDiaCronograma`, `HoraInicio`, `HoraFin`), `ContinuarSinPreferencias` y `DistanciaMaximaKm`
- Ambos exigen participante `aceptado` y viaje no finalizado. El POST valida antes de llamar a la IA: al menos una franja, día del viaje y posterior a hoy (400 `DAY_IN_PAST`), franja de 3 h o más dentro de 09:00 a 22:00 y sin repetir (400 `SLOT_INVALID`), cantidad de franjas <= solicitudes restantes del día (429 `SUGGESTION_LIMIT_REACHED`, no se genera ninguna) y preferencias (409 `NO_PREFERENCES`, igual que la US 87)
- Cada franja reutiliza `_generar_sugerencias_franja` de `sugerencias.py` (el mismo núcleo que `POST /sugerencias-actividades` de la US 87): crea su propia solicitud (cuenta para el límite diario, RNF-36), tiene su propio tiempo máximo y pide hasta 3 sugerencias que quedan `pendiente`. Un error en una franja (por ejemplo `SLOT_FULL`) se informa en su resultado (`CodigoError`, `Mensaje`) sin cancelar las demás
- Frontend: acceso "Completar días libres con IA" en el tab Itinerario de `TripDetailScreen` (solo si `lock.canEdit("itinerario")`), que abre `screens/CompleteFreeDaysScreen.js`: lista franjas agrupadas por día con selección, avisa y bloquea si la selección supera las solicitudes disponibles, y muestra los resultados agrupados por día. Helpers puros en `utils/diasLibres.js`
- Tests: `backend/tests/test_completar_dias_libres.py` (detección pura + endpoints con IA y Google Places simulados) y `frontend/src/tests/CompletarDiasLibres.test.js` (CP1 a CP8)

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
- Fuera de alcance de esta US: guardar la foto del comprobante en el repositorio del viaje. El limite de escaneos por usuario (RNF-36) se implemento en la US 118 y paso a ser mensual en la US 112 (ver "Planes y limites de uso")

## Confirmar gasto precargado desde un comprobante (US 94)

- Se reutiliza `AddGastoScreen`: las reglas de esta US aplican cuando el formulario se precargo desde un comprobante (`escaneoAplicado`, tanto por `ReceiptScanButton` como por `initialData` de la US 84); la carga manual no cambia
- `ReceiptScanButton` llama `onScanned(datos, imagen)`; `imagen.uri` (JPEG comprimido) se muestra como vista previa ampliable junto al formulario (AC1). La imagen no se persiste: se borra del cache con `expo-file-system` (`File.delete`) al registrar, al cancelar o al re-escanear (AC9)
- Cancelar (boton "Cancelar", cruz o back de Android) pide confirmacion con `confirmar()` de `frontend/src/utils/dialogs.js` y no llama a `createExpense`
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

## Planes y limites de uso (US 118 y US 112)

### Gestion comercial desde el backoffice (US 112)

- `GET/PUT /backoffice/planes` y `GET /backoffice/planes/auditoria` pertenecen al router protegido por `require_admin_sistema`. La pantalla `BackofficePlanesScreen` se abre desde "Planes y limites" en el inicio del backoffice y usa exclusivamente `backofficeApi.js`.
- El PUT reemplaza precios mensual/anual de Pro en ARS (`PrecioMensualARS`, `PrecioAnualARS`, Numeric(12,2)) y los cinco limites de ambos planes. Precios > 0 con hasta dos decimales; limites enteros > 0; cada limite de Pro >= gratuito. La configuracion nueva no permite NULL/ilimitado; los valores heredados NULL pueden leerse y deben completarse al guardar.
- Los cambios se confirman con `confirmar`/`AppDialog` (opciones `backoffice:true`), mostrando valores anteriores y nuevos. El servicio `backoffice/planes_service.py` bloquea ambos planes en orden de id y guarda configuracion y una fila por campo modificado en `AuditoriaPlanes` en la misma transaccion (administrador, fecha UTC, IP, valor anterior y nuevo). Los valores iguales no generan auditoria; la consulta muestra los ultimos 100 cambios.
- Migracion `f112a1b2c3d4` y script `019_planes_precios_y_limites.sql`: renombra `MaxEscaneosSemanales` a `MaxEscaneosMensuales`, conservando sus valores numericos (3/50 inicialmente). Desde esta US los escaneos se cuentan por usuario y mes calendario en hora Argentina, con renovacion el dia 1. Los registros historicos de escaneos se conservan y participan del conteo del mes en curso.
- `GET /users/me/limites` devuelve `escaneosMensuales`; mantiene `escaneosSemanales` como alias obsoleto para APKs anteriores, con los mismos datos mensuales. La UI nueva y `tipoLimite=escaneos_mensuales` usan el periodo mensual. No mantener dos cupos distintos.
- Los limites se consultan en base en cada operacion y se aplican inmediatamente sin borrar contenido ni expulsar participantes. Los precios base aprobados son ARS 4900 mensual y ARS 49000 anual: migracion `f112b2c3d4e5` y script `020_precios_base_pro.sql` completan solo tarifas NULL del plan Pro, sin sobrescribir cambios del administrador ni modificar precios contratados. El downgrade de esa semilla no borra tarifas comerciales.
- `SuscripcionesUsuarios.PrecioPeriodoARS` y `MesesPeriodo` (1 o 12) congelan la tarifa de cada periodo. `services/precios_suscripciones.crear_periodo` toma el precio vigente al crear cada periodo nuevo o renovacion, sin modificar el anterior. Las suscripciones heredadas conservan NULL si no se conoce su precio; no se recalculan desde la tarifa actual. Esta US no agrega cobros, activacion Pro ni renovaciones automaticas: los futuros flujos de suscripcion deben llamar a ese servicio dentro de su transaccion.
- Tests: `test_backoffice_planes.py` cubre CP1-CP6, autorizacion y validacion; `test_limites_planes_uso.py` cubre meses, renovacion y conteos. Frontend: `BackofficePlanesScreen.test.js` cubre formulario, confirmacion/cancelacion, errores e historial.

### Modelo

- Los limites viven en la tabla maestra `Planes` (migracion `c118a1b2c3d4`, script `015_limites_y_suscripciones.sql`): `MaxParticipantesViaje`, `MaxViajesActivos`, `MaxSugerenciasDiarias`, `MaxEscaneosMensuales` y `MaxAlmacenamientoMb`, todos `INTEGER NULL`. `NULL` significa ilimitado. Constantes `PLAN_GRATUITO=1` y `PLAN_PRO=2` en `app/models/plan.py`
- Valores vigentes:

| Campo | Gratuito | Pro |
|---|---|---|
| `MaxParticipantesViaje` | 3 | 10 |
| `MaxViajesActivos` | 5 | 15 |
| `MaxSugerenciasDiarias` | 10 | 20 |
| `MaxEscaneosMensuales` | 3 | 50 |
| `MaxAlmacenamientoMb` | 100 | 2048 |

- Los valores se gestionan desde el backoffice (US 112) sin reiniciar el backend
- `EstadosSuscripciones` (`activa`, `pendiente_pago`, `cancelada`, `vencida`; pendiente de pago agregado en US 113) y `SuscripcionesUsuarios` (`IdUsuario`, `IdPlan`, `IdEstadoSuscripcion`, `FechaInicio`, `FechaFin`, `FechaCancelacion`, `FechaCreacion`) se crean en la misma migracion como base para "Gestionar suscripcion Pro" y "Volver al plan gratuito"; los limites se calculan siempre desde `Usuarios.IdPlan`
- Migracion `c118b2c3d4e5` (script `016_escaneos_y_tamano_documentos.sql`): tabla `EscaneosComprobantes` (`IdUsuario`, `IdViaje`, `FechaEscaneo`, indice `IX_EscaneosComprobantes_Usuario_Fecha`) y columna `DocumentosViajes.TamanoBytes BIGINT NULL`. Los documentos anteriores a la migracion quedan con `NULL` y cuentan como 0

### Reglas de conteo

- Plan de un viaje = plan del administrador actual; si se transfiere la administracion, el limite se recalcula automaticamente con el plan del nuevo administrador
- Viajes activos: solo los que el usuario administra en estado `borrador` o `activo`. Se valida al crear un viaje y al recibir una transferencia de administracion (el destinatario no puede superar su limite)
- Participantes: solo participaciones `aceptado`, incluido el administrador; las invitaciones pendientes no reservan lugar. Se valida al aceptar una invitacion personal y al unirse por enlace (`require_trip_capacity`); generar invitaciones o enlaces no valida
- Sugerencias: por viaje y por dia (00:00 de `AI_SUGGESTIONS_TIMEZONE`); cuentan las solicitudes de todos los participantes, excepto las fallidas o sin resultados. En "Completar dias libres" cada franja cuenta como una solicitud
- Escaneos: por usuario y por mes calendario (dia 1 a las 00:00 hora Argentina), sumando todos sus viajes. Solo se registra el escaneo si la IA respondio con exito; la deteccion automatica de gastos al subir documentos (US 84) no cuenta
- Almacenamiento: suma de `TamanoBytes` de los documentos del viaje, incluidos los comprobantes guardados desde gastos. Al reemplazar un archivo solo se valida la diferencia si el nuevo es mas grande
- Superar un limite nunca elimina contenido existente: solo bloquea nuevas acciones (por ejemplo, si al transferir la administracion el viaje queda con mas participantes que el nuevo plan, nadie es expulsado)

### Contrato de errores

- Toda la logica vive en `backend/app/services/limites_planes.py` (contadores, `validar_*`, `registrar_escaneo`, `resumen_usuario`, `resumen_viaje`). Las rutas solo llaman a los validadores; no reimplementar conteos en las rutas
- Al superar un limite se responde 409 (429 para sugerencias) con header `X-Error-Code` y `detail` objeto: `{ mensaje, tipoLimite, limite, usoActual }`
- Codigos: `TRIP_ACTIVE_LIMIT_REACHED`, `TRIP_PARTICIPANT_LIMIT_REACHED`, `SUGGESTION_LIMIT_REACHED`, `RECEIPT_SCAN_LIMIT_REACHED`, `STORAGE_LIMIT_REACHED`; plan ausente o inactivo 503 `PLAN_UNAVAILABLE`
- `tipoLimite`: `viajes_activos`, `viajes_activos_destinatario`, `participantes`, `sugerencias_diarias`, `escaneos_mensuales`, `almacenamiento`

### Consulta de uso (CA 7)

- `GET /users/me/limites`: uso y limite de viajes activos y escaneos mensuales del usuario
- `GET /trips/{trip_id}/documents/almacenamiento`: espacio usado y limite del viaje, en MB (schema `UsoLimiteRead` de `app/schemas/limite_plan.py`)
- Las sugerencias informan `LimiteDiario` y `SolicitudesRestantes` en el contexto y en las franjas libres; ambos son `null` cuando el plan es ilimitado

### Frontend

- `frontend/src/utils/limitesPlan.js`: `esErrorDeLimite(error)`, `irAPlanes()` y `mostrarLimiteAlcanzado(error, { titulo, ofrecerPlanes, antesDeIr })`. `antesDeIr` cierra el modal abierto antes de navegar, para que la pantalla de planes no quede tapada
- `api.js` conserva el `detail` objeto en `error.detalle` (tambien en las subidas mobile, via `buildUploadError`) y expone `getMyLimits()` y `getTripStorage()`
- La pantalla de planes es la ruta `Planes`; mientras no exista, `irAPlanes()` navega a `Configuracion`
- "Ver planes" se ofrece solo cuando el usuario puede resolverlo cambiando su propio plan: no al unirse a un viaje lleno ni al aceptar una invitacion (el limite es del administrador), ni cuando el destinatario de una transferencia esta en su limite
- Donde se informa el uso: `CreateTripScreen` (viajes activos, bloquea "Siguiente" si no hay cupo), `ReceiptScanButton` (escaneos restantes del mes; prop `onVerPlanes` para cerrar `AddGastoScreen`), `DocumentsScreen` (barra de almacenamiento y aviso previo si el archivo no entra), `ActivitySuggestionsScreen` y `CompleteFreeDaysScreen` (solicitudes restantes del dia)
- Tests: `backend/tests/test_limites_planes.py` (viajes activos, participantes, transferencias), `test_limites_planes_uso.py` (escaneos y almacenamiento a nivel servicio), `test_limites_planes_endpoints.py` (409 por API de escaneo y documentos), `test_limites_sugerencias.py` (sugerencias y completar dias libres) y `test_almacenamiento_api.py`

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
- Las migraciones Alembic que eliminen indices, constraints u objetos heredados opcionales deben tolerar bases locales con historia parcial usando `IF EXISTS` o chequeos equivalentes.

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
- `012_backoffice.sql`
- `013_enlaces_invitacion_viajes.sql`
- `014_planes_y_cupos.sql`
- `015_limites_y_suscripciones.sql`
- `016_escaneos_y_tamano_documentos.sql`
- `017_gestion_categorias.sql`
- `018_monitoreo_consumo_ia.sql`
- `019_planes_precios_y_limites.sql`
- `020_precios_base_pro.sql`
- `021_consulta_suscripciones_pagos.sql`

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
- Cambio de contraseña (US 101): `PUT /users/me/password` con `passwordActual`, `passwordNueva` y `confirmacion`, lógica en `backend/app/services/auth/password_change_service.py`. Solo cuentas `ProveedorAutenticacion="local"` (403 `PASSWORD_CHANGE_NOT_AVAILABLE`); la contraseña actual incorrecta responde 400 `CURRENT_PASSWORD_INVALID` (no 401, que cerraría la sesión en la app); las reglas de la nueva son las de `validar_reglas_password` (400 `PASSWORD_WEAK`), distinta de la actual (`PASSWORD_SAME_AS_CURRENT`) y igual a la confirmación (`PASSWORD_MISMATCH`)
- Al cambiar la contraseña se guarda `Usuarios.FechaCambioPassword` (migración `f101a2b3c4d5`, sin microsegundos) y `_verificar_sesion_vigente` invalida los tokens con `iat` anterior a esa fecha o al último restablecimiento por correo: así se cierran las sesiones de los demás dispositivos. La respuesta incluye un `access_token` nuevo para el dispositivo actual. Se envía el correo `password_updated.html/.txt` sin bloquear si el proveedor falla
- En el frontend, `api.js` emite `onSessionExpired` ante un 401 con detalle "No autenticado" y `AuthContext` cierra la sesión; la opción "Cambiar contraseña" está en Configuración > Mi cuenta (`ChangePasswordScreen`, ruta `CambiarPassword`) solo para cuentas locales. Las reglas de contraseña del frontend viven en `frontend/src/utils/passwordRules.js` (compartidas con `ResetPasswordScreen`). Tests: `backend/tests/test_cambiar_password.py`, `frontend/src/tests/CambiarPassword.test.js` y `frontend/src/tests/apiSugerenciasPassword.test.js`
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
- La barra inferior de `MainTabs` usa `useSafeAreaInsets`: suma `insets.bottom` tanto a su altura base de 74 como al padding inferior `spacing.sm`, para mantener los botones por encima de la navegacion del sistema (gestos o tres botones) sin reducir el espacio de los tabs. No reemplazar estos valores por medidas fijas ni agregar otro padding inferior global que duplique el area segura.
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
- Todos los mensajes son pop-ups de la app, tambien en web: no usar `window.alert`, `window.confirm` ni `window.prompt` ni ramas `Platform.OS === "web"` para dialogos; `AppDialog` funciona igual en web y mobile
- En tests, `simularDialogos` de `frontend/src/tests/helpers/dialogosSimulados.js` espia `Alert.alert` y simula al usuario: acepta los avisos y responde las confirmaciones segun `confirma`
- `<DialogHost root />` se monta una sola vez en `App.js`; sin ese host (tests) `appAlert` delega en `Alert.alert` con los mismos argumentos, asi que los tests pueden seguir espiando `Alert.alert`
- No importar `Modal` de `react-native`: usar `import Modal from ".../components/ui/AppModal"` (mismas props). AppModal monta su propio `DialogHost` y `appAlert` dibuja el dialogo en el modal visible mas reciente; con el `Modal` de react-native el dialogo quedaria detras del modal abierto (Android nueva arquitectura / iOS)
- El tipo (icono y color) se deduce del titulo (`Éxito`, `Error`, `¿...?`, `Atención`) o se fuerza con `appAlert(titulo, mensaje, botones, { tipo: "success" | "error" | "warning" | "info" | "confirm" })`
- Botones: el de `style: "cancel"` queda como secundario a la izquierda; el ultimo boton no-cancelar es el principal; `style: "destructive"` lo pinta de rojo
- Para avisos simples o confirmaciones con promesa, preferir `avisar` y `confirmar` de `frontend/src/utils/dialogs.js`

### Expulsion de participantes

- La expulsion desde Grupo usa `appAlert` de `AppDialog.js` para la confirmacion previa (advertencia con "Cancelar" y "Expulsar del viaje", destructivo) y el resultado exitoso; tambien al quitar una invitacion externa. En web y mobile se muestra el dialogo del producto. Cancelar o cerrar no ejecuta la expulsion; se conserva el aviso de saldo pendiente y el historial de gastos.

### Transferencia de administracion del viaje

- `POST /trips/{trip_id}/transferir-administracion` recibe `nuevoAdministradorId` (id de usuario entero positivo). Solo el administrador actual con participacion aceptada puede transferir a otro participante aceptado del mismo viaje y con cuenta activa sin baja. Solo aplica a viajes activos no finalizados; se conserva `TRIP_FINISHED` (409) si ya paso la fecha de fin.
- La transferencia es inmediata tras confirmacion explicita; no requiere aceptacion del destinatario. El administrador anterior sigue como participante aceptado. No cambia fechas de incorporacion, estados de participacion, gastos, asignaciones, actividades ni invitaciones.
- `backend/app/services/administracion_viajes.py` mantiene en la misma transaccion `Viajes.IdAdministrador`, ambos `IdRolParticipante` y `FechaActualizacion`; `cambiar_administrador` tambien se reutiliza al abandonar. Transferencia, abandono y expulsion bloquean primero la fila del viaje con `SELECT FOR UPDATE` y recargan su estado para serializar operaciones concurrentes.
- Antes de cambiar el administrador, `transferir_administracion` valida que el destinatario no supere su limite de viajes activos (`validar_viajes_activos_destinatario`, 409 con `tipoLimite=viajes_activos_destinatario`; ver "Planes y limites de uso").
- La UI ofrece "Transferir organización" en el menu del integrante aceptado en Grupo > Participantes. `GroupMemberList` recibe `onTransferAdministration`; confirmacion, exito y error usan `appAlert` de `AppDialog.js` tambien en web, sin `window.confirm` ni `window.alert`. La confirmacion resuelve una promesa y cancelar/cerrar no ejecuta la transferencia. Se muestra progreso y se actualizan los permisos locales y el detalle despues de confirmar. Los candidatos a administrador al abandonar tambien se filtran por estado `aceptado`.
- Tras persistir, el evento WebSocket `administracion_transferida` recarga el detalle y cierra la gestion de invitaciones. Se notifica al nuevo administrador mediante `dispatch_user_notification`, tipo interno `nuevo_administrador` y preferencia `CAMBIO_VIAJE` para correo/push; el evento push `administration_transferred` abre Grupo. Fallos externos no revierten la transferencia. No requiere nuevas tablas ni migraciones.
- Pruebas de negocio en `backend/tests/test_transferir_administracion.py`; regresion de abandono y expulsion en `test_trips.py`. Frontend: `GroupMemberList.test.js`, `TripDetailScreen.test.js`, `api.test.js` y `notificationTarget.test.js`.

### Invitaciones a viajes

#### Enlace compartible para unirse

- Los enlaces compartibles son independientes de las invitaciones personales por correo: no modifican `InvitacionesViajes` ni su vinculacion automatica en registro/login. La URL es `{MAIL_FRONTEND_BASE_URL}/unirse/{token}` y la ruta compartida `UnirseViaje` existe con y sin sesion.
- Se persiste un enlace por viaje en `EnlacesInvitacionViajes` (migracion `e1710c0f1a02`, script manual `013_enlaces_invitacion_viajes.sql`). El token aleatorio `token_urlsafe(32)` es unico, se guarda igual que los tokens de invitacion personales y solo se devuelve al administrador autenticado. Su vigencia es 7 dias; el estado se deriva de `FechaRevocacion` y `FechaVencimiento`.
- Gestion: `GET/POST/DELETE /trips/{trip_id}/enlace-invitacion`. Solo el administrador de un viaje activo no finalizado puede consultar, generar, renovar o revocar. `POST {renovar:false}` reutiliza el enlace vigente; `renovar:true` cambia el token y reinicia los 7 dias. Revocar o renovar no quita integrantes ya aceptados.
- Consulta publica: `GET /invitaciones/enlaces/{token}` expone unicamente titulo, nombres de destinos, fechas y `administrador` como nombre de usuario publico (sin nombre real, foto ni email antes de pertenecer al grupo), con `Cache-Control: no-store`. Nunca incorpora al usuario ni expone integrantes, gastos o documentos. La vista previa de la US 104 muestra los cuatro datos antes de confirmar.
- Incorporacion: `POST /invitaciones/enlaces/{token}/unirse`, con sesion, cuenta activa sin baja y correo confirmado. Solo se ejecuta tras confirmar en `AppDialog`. Crea o reactiva una participacion `aceptado` con rol `participante`; actualiza fechas de respuesta/incorporacion y limpia salida/snapshot. Si ya esta aceptado, rechaza con 409 `ALREADY_TRIP_PARTICIPANT`, sin cambiar fechas ni emitir avisos (CA5). Las invitaciones personales `pendiente` de ese viaje para el email verificado del usuario pasan a `aceptada` con `IdUsuarioRegistrado` y `FechaAceptacion` en la misma transaccion (CA4).
- Participaciones `expulsado` y `cancelada` no pueden reactivarse con el enlace: requieren una nueva invitacion personal del administrador. `invitado`, `rechazado` y `salio` pueden incorporarse al confirmar. No se permite entrar a viajes finalizados (409 `TRIP_FINISHED`), cancelados ni eliminados. Enlaces inexistentes/renovados responden 404 `INVITATION_INVALID`; vencidos/revocados 410 `INVITATION_EXPIRED`; participacion bloqueada 403 `INVITATION_MEMBERSHIP_BLOCKED`.
- Generacion, revocacion e incorporacion bloquean la fila de `Viajes` mediante `bloquear_viaje`, igual que transferencia/expulsion/abandono. Al incorporarse se revalida el enlace bajo el bloqueo y la unicidad de participacion evita duplicados. Fallos de correo/push/WebSocket no revierten la incorporacion ya persistida.
- `TripInvitationLink` ofrece generar, copiar, renovar y revocar en Grupo; usa `expo-clipboard` y `appAlert`. Sin sesion, `JoinTripScreen` conserva el token y redirige automaticamente a Login, desde donde se puede ir a registro. El token se conserva en `AuthContext.pendingInvitation` mediante `rememberInvitation`: `localStorage` en web y `expo-secure-store` en nativo, clave `cyanea_pending_invitation`. Se mantiene durante login, registro y confirmacion de cuenta y se limpia al incorporarse o elegir "Ahora no". `AppNavigator` retoma la invitacion al autenticarse, sin aceptar automaticamente. Al incorporarse se muestra el mensaje de exito con `appAlert` y un texto accesible antes de abrir el detalle (CA12).
- El ingreso emite `participante_acepto` para refrescar el grupo y registra un aviso al administrador mediante `dispatch_user_notification`, tipo `participante_incorporado`, categoria `CAMBIO_VIAJE` y evento `member_joined` que abre Grupo. No requiere aprobacion posterior del administrador ni depende de SMTP.
- Tests: `backend/tests/test_enlaces_invitacion.py` y regresion `test_invitaciones_externas.py`; frontend `SharedInvitation.test.js`, `AuthContext.test.js`, `AppNavigator.test.js`, `api.test.js` y `notificationTarget.test.js`. Los enlaces web usan el hosting configurado; la apertura automatica de URLs HTTPS en una app instalada requiere configurar Universal/App Links en el dominio y queda fuera de este flujo.

#### Cupos de participantes por plan (US 104, CA8)

- `Planes` es una tabla maestra con `IdPlan`, `Nombre`, `MaxParticipantesViaje` y `Activo`; `Usuarios.IdPlan` referencia el plan vigente. Migracion `e1710c0f1a03` y script `014_planes_y_cupos.sql`. Las cuentas existentes y nuevas quedan en `gratuito` por defecto. Esta estructura no implementa cobros.
- Desde la US 118 el cupo vale 3 en gratuito y 10 en Pro, y `MaxParticipantesViaje` admite `NULL` (ilimitado). Las reglas generales de limites (plan del administrador actual, conteo de aceptados, contrato de errores) estan en "Planes y limites de uso (US 118)".
- `require_trip_capacity` de `backend/app/services/cupos_viajes.py` delega en `limites_planes.validar_participantes`, manteniendo bloqueado el viaje hasta el commit; se usa en ingreso por enlace y en aceptacion de invitaciones personales. Viaje lleno responde 409 `TRIP_PARTICIPANT_LIMIT_REACHED`; plan ausente/inactivo responde 503 `PLAN_UNAVAILABLE`.

#### Invitaciones personales

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


## Backoffice

### Acceso

- el backoffice es exclusivo para administradores del sistema: `Usuarios.IdRolSistema = ROL_ADMIN_SISTEMA`, cuenta activa, email confirmado y proveedor `local`
- el registro publico nunca crea administradores
- las rutas viven en `backend/app/api/routes/backoffice.py`:
  - `router_publico`: solo `POST /backoffice/auth/login`
  - `router`: todo lo demas, protegido a nivel router con `require_admin_sistema` (`backend/app/api/deps_backoffice.py`)
- toda ruta nueva del backoffice se agrega en `router`, nunca en `router_publico`
- los tokens de la app de viajeros son rechazados por el backoffice con 401
- tras 5 intentos fallidos consecutivos se bloquea el acceso por 15 minutos
- la sesion se cierra por 30 minutos de inactividad; las sesiones se persisten en `SesionBackoffice` y cada intento de acceso se audita en `AuditoriaAccesoBackoffice`
- la logica del backoffice vive en `backend/app/services/backoffice/`
- el esquema de backoffice se versiona en Alembic (`9f4c2d1a0b3e_backoffice_schema.py`); `backend/scripts/sql/012_backoffice.sql` queda como referencia/idempotente para inicializaciones manuales.

### Gestion de usuarios (US 107)

- `GET /backoffice/usuarios`: listado paginado de a 20 con busqueda `q` (nombre completo, nombre de usuario o email, sin distinguir mayusculas) y filtros `estado`, `plan`, `metodoRegistro` y `pagina`
- `GET /backoffice/usuarios/{id_usuario}`: detalle con datos de cuenta, cantidad de viajes con participacion `aceptado`, plan y estado de suscripcion
- el detalle nunca expone contenido de los viajes (gastos, documentos, itinerario)
- los administradores del sistema no aparecen en el listado ni en el detalle
- el estado de cuenta no se persiste; se deriva en este orden:
  - `FechaBaja` informada -> `inactiva`
  - `EmailConfirmado = false` -> `pendiente`
  - `Activo = false` -> `suspendida`
  - resto -> `activa`
- el metodo de registro es `Usuarios.ProveedorAutenticacion`
- el plan informado y los filtros `gratuito`/`pro` se resuelven desde `Usuarios.IdPlan` y la tabla `Planes`; `estadoSuscripcion` sigue en `null` hasta que se implemente "Gestionar suscripcion Pro", aunque la tabla `SuscripcionesUsuarios` ya existe (US 118)
- los usuarios dados de baja ya estan anonimizados en base (`_anonimizar_usuario`, RN-07); el backoffice no enmascara datos, solo informa `anonimizado` segun `FechaBaja`

### Consulta de suscripciones y pagos (US 113)

- Solo consulta desde el router protegido del backoffice: `GET /backoffice/suscripciones?estado&pagina`, `GET /backoffice/suscripciones/{id}` y `GET /backoffice/pagos?estado&desde&hasta&idSuscripcion&pagina`. Paginacion de 20 filas, orden descendente por fecha e id; filtros invalidos responden 422 y suscripcion inexistente 404 `SUBSCRIPTION_NOT_FOUND`.
- Los estados de suscripcion se mantienen en `EstadosSuscripciones`: `activa`, `pendiente_pago`, `cancelada`, `vencida`. `MesesPeriodo` define mensual (1) o anual (12); para historicos NULL se informa sin periodicidad registrada, sin inferirla de las fechas. La proxima renovacion es `FechaFin` solo para estado activa; el fin del periodo se expone aparte. Esta consulta no cambia estados ni activa/cancela/vence suscripciones.
- Migracion `f113a1b2c3d4` y script `021_consulta_suscripciones_pagos.sql`: agregan el estado pendiente de pago y las tablas `EstadosPagosSuscripciones` (aprobado/rechazado/pendiente) y `PagosSuscripciones`. Cada pago contiene suscripcion, estado maestro, fecha, monto ARS positivo Numeric(12,2) e identificador unico de operacion de pasarela (nullable mientras no se haya asignado). No se almacena payload crudo de pasarela, datos de tarjeta, CVV, vencimiento ni tokens de tarjeta. No se agregan cobros reales, webhooks ni registros financieros ficticios.
- Los pagos se filtran por estado, rango de fechas y opcionalmente suscripcion. Fechas desde/hasta inclusivas por dia calendario de Argentina (UTC-3), convertidas a UTC al consultar; ambos extremos pueden omitirse. Rango invertido responde 422 `PAYMENT_DATE_RANGE_INVALID`. `totalIngresosAprobadosARS` suma con Decimal todos los pagos aprobados que coinciden con esos mismos filtros, antes de paginar; filtrar rechazados/pendientes devuelve total aprobado cero. No se calcula desde los precios vigentes de los planes.
- La pantalla `BackofficeSuscripcionesScreen` se abre desde el inicio del backoffice y ofrece listado de suscripciones, detalle con historial asociado y listado global de pagos. Conserva el filtro/pagina de suscripciones al volver del detalle. `ConsultaPagos` comparte filtros, total, estados de carga/error/reintento y vacios; `FinanzasPresentacion` concentra etiquetas, importes y fechas. El acceso HTTP pasa por `backofficeApi.js` y no hay acciones mutantes.
- Pruebas: `backend/tests/test_backoffice_suscripciones.py` cubre CP1-CP6, estados, fechas UTC/Argentina, paginacion, importes exactos, registros historicos y ausencia de datos de tarjeta. `frontend/src/tests/backoffice/BackofficeSuscripcionesScreen.test.js` cubre listas, filtros, detalle, total, vacios y errores; `BackofficeApp.test.js` cubre la navegacion desde el inicio.
- El regreso automatico al plan gratuito, avisos de vencimiento y cambios diferidos de limites de IA quedan fuera de la US 113; no agregar schedulers para ese flujo en esta historia.

### Resumen ejecutivo de suscripciones y pagos

- La seccion abre en `Resumen ejecutivo`, con indicadores, evolucion mensual, tabla de cobros por mes y accesos al detalle de operaciones. Mantiene la identidad visual del backoffice; `TablaFinanzas` comparte filas compactas, encabezados, estados y desplazamiento horizontal para pantallas pequenas.
- Contrato protegido de solo lectura: `GET /backoffice/finanzas/resumen?desde&hasta`, implementado en `resumen_financiero_service.py`. Por defecto abarca desde el primer dia de hace once meses hasta hoy, hasta 366 dias inclusivos y sin fechas futuras. Agrupa y suma en SQL sobre todo el periodo, sin depender de la paginacion. Usa dias y meses de Argentina (UTC-3), completa meses vacios con ceros y recorta los meses extremos al filtro.
- Los ingresos son exclusivamente pagos aprobados por fecha de cobro: el importe anual entra completo en el mes cobrado. Se desglosan mensual/anual/sin periodicidad, preservando historicos NULL; no se calculan devengamientos, ganancias, saldos de deuda ni MRR desde estos totales. Pendientes y rechazos son operaciones/intentos, no deudas unicas ni ingresos.
- La variacion compara contra el intervalo inmediatamente anterior con igual cantidad de dias. Si ese intervalo tiene ingresos cero, la variacion es NULL y la UI indica que no hay base comparable. La tasa de aprobacion divide aprobados entre todos los intentos del periodo (aprobados, pendientes y rechazados). `suscripcionesActivasHoy` es una instantanea independiente del filtro: usuarios distintos con estado activa y periodo que incluye el instante actual; canceladas no se incluyen en ese indicador.
- `GET /backoffice/suscripciones` suma `q` (nombre completo/email/usuario, hasta 150 caracteres, comodines escapados), `tipoPlan=mensual|anual` y `soloUltima`. La API conserva por defecto todo el historial; la UI inicia con `soloUltima=true`, usando la ultima fila por usuario ordenada por FechaInicio e id descendentes, seleccionada antes de aplicar estado/periodicidad/busqueda. Esto evita mostrar como vigente un periodo anterior al filtrar. No cambia estados ni fechas persistidos.
- `GET /backoffice/pagos` suma la misma busqueda `q` por usuario; el total aprobado usa exactamente los filtros de la tabla completa. La UI conserva el periodo del resumen al volver desde las operaciones; seleccionar un mes o indicador abre Pagos con las fechas y estado correspondientes. Los detalles individuales conservan el historial de pagos y los filtros de suscripciones al regresar.
- Tests backend de US 113 suman agregaciones, limites de mes UTC/Argentina, comparacion, meses vacios, precision decimal, totales de mas de una pagina, periodicidad historica, permisos y filtros combinados. Tests frontend verifican la entrada ejecutiva, navegacion al detalle filtrado, busqueda, historial y errores.

### Visualizar planes disponibles (US 115)

- Acceso autenticado desde Configuracion > Mi cuenta > Mi plan y consumo (`Planes`) y los avisos de limite existentes (`irAPlanes`). `AppNavigator` registra `Planes` y `MiSuscripcion` en el stack autenticado. Se elimina el banner anterior de Configuracion que hardcodeaba plan gratuito, cupos incorrectos y viajes ilimitados.
- Contrato de solo lectura: `GET /users/me/planes`, con `Cache-Control: no-store`. `planes_disponibles.consultar` reutiliza el lector vigente de configuracion de la US 112; expone los cinco limites de ambos planes, precios ARS, plan actual de Usuarios, ahorro anual y ultimo periodo de suscripcion exclusivamente de la cuenta autenticada. No acepta ids de terceros. No crea suscripciones, inicia cobros ni cambia planes. No requiere migracion.
- Ahorro anual = max(0, (1 - precioAnual / (12 * precioMensual)) * 100), redondeado a dos decimales con Decimal. Sin ambos precios configurados devuelve NULL y no promete ahorro; un anual mas caro devuelve cero. Un limite NULL se presenta como Sin limite, nunca como cero. La tarjeta distingue plan actual por datos del backend, independiente del estado de la suscripcion.
- `useAvailablePlans` vuelve a consultar sin cache al enfocar la pantalla y al actualizar manualmente; conserva manejo de carga/error/reintento y descarta respuestas al desenfocar. La comparacion identifica viajes activos como administrador, participantes (incluido administrador), sugerencias diarias por viaje, escaneos mensuales por usuario y almacenamiento MB por viaje.
- Beneficios compartidos: los limites de participantes/sugerencias/almacenamiento del viaje dependen del administrador; el cupo de escaneos es individual. La UI informa que los participantes gratuitos reciben los beneficios del viaje administrado por Pro.
- Para gratuito se muestra Suscribirme a Pro, que informa contratacion proxima (pagos reales fuera del alcance actual); se deshabilita si faltan precios. Para Pro se reemplaza por Gestionar mi suscripcion, que abre `MySubscriptionScreen`: consulta plan actual, ultimo periodo, estado, modalidad, fechas, cancelacion y precio historico congelado; informa conservacion de beneficios en canceladas aun vigentes. Cambiar modalidad, cancelar y cobrar siguen pendientes de sus respectivas historias; no simular estas acciones desde la US 115.
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

- `backend/scripts/seed_demo_backoffice.py` genera un conjunto sintetico aditivo para probar el backoffice: por defecto 800 usuarios y 300 viajes, con participaciones, itinerarios, gastos y asignaciones exactas, tareas, votaciones, metadatos de consumo IA, periodos de suscripcion y pagos simulados. No son datos reales ni distribuciones calibradas con usuarios observados.
- Ejecutar desde `backend/`: `.venv\Scripts\python.exe -m scripts.seed_demo_backoffice`; opciones `--usuarios`, `--viajes`, `--semilla` (113 por defecto). Requiere migraciones, categorias activas y precios Pro configurados. Solo admite PostgreSQL en loopback y `APP_ENV=development|local|test`; no hay opcion de omitir esta proteccion.
- Una unica transaccion y advisory lock serializan la carga. Si existe algun usuario con prefijo literal `demo_cyanea_`, no vuelve a insertar ni modifica datos. Nunca borra ni actualiza usuarios ajenos al conjunto; tampoco reinicia secuencias. Cambiar cantidades despues de cargar no agrega un segundo conjunto.
- Marcadores: nombres de usuario `demo_cyanea_*`, emails bajo `demo.cyanea.invalid`, titulos de viajes `[DEMO]`, operaciones `DEMO-CYANEA-*`, modelo IA `demo-sintetico`. Password compartida de viajeros demo: `CyaneaDemo2026!`; no se crean administradores demo. No usar estas cuentas fuera del entorno local.
- Supuestos: 18 meses de altas con crecimiento reciente, actividad desigual mediante pesos lognormales, mezcla de usuarios activos/sin confirmar/suspendidos/de baja, estacionalidad de salidas, grupos mayormente pequenos y conversion Pro minoritaria. Los historiales incluyen mensual/anual, estados de suscripcion y reintentos rechazados; los importes historicos pueden simular una tarifa 15% inferior. No representan facturacion real ni una proyeccion comercial.
- Inserciones ORM directas: no envia correos/push, no invoca IA ni pasarelas, no genera tarjetas ni archivos/URLs de documentos ficticios. Los metadatos IA son simulados y no contienen identificadores de usuario o viaje. No modifica los indicadores del dashboard que aun esten sin implementar; las finanzas demo se consultan en Suscripciones y pagos.
- Pruebas en `backend/tests/test_seed_demo_backoffice.py`: no duplicacion, conservacion de cuentas existentes, coherencia de fechas y pagos, reparto exacto de gastos y rechazo de destinos remotos/produccion.

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
- Costo estimado: `estimar_costo_usd` con precios de referencia configurables (`AI_COST_INPUT_USD_PER_MILLION_TOKENS`, `AI_COST_OUTPUT_USD_PER_MILLION_TOKENS`, sus variantes `AI_COST_LITE_*` para modelos "lite" y `AI_COST_IMAGE_USD` por imagen generada). Se persiste por solicitud para que cambiar precios no altere el historico
- Contratos (router protegido del backoffice): `GET /backoffice/monitoreo-ia?desde&hasta` (por defecto ultimos 30 dias, mismas reglas de rango que `/backoffice/metricas`) devuelve `funcionalidades` (solicitudes, fallidas, tiempo promedio, costo), `totales` y `umbral`; `PUT /backoffice/monitoreo-ia/umbral` con `umbralMensualUSD` (> 0, o `null` para quitarlo)
- Umbral: una sola fila en `ConfiguracionesMonitoreoIA`. Se evalua sobre el mes calendario en curso (hora Argentina): `nivel` es `sin_umbral`, `normal`, `advertencia` (mas del 80%) o `superado` (mas del 100%). Al superarlo, `verificar_umbral_costo` (llamado tras cada registro y al configurar el umbral) envia `ai_cost_threshold.html/.txt` a los administradores del sistema activos y confirmados una sola vez por mes y valor de umbral (`PeriodoUltimaAlerta`, `UmbralUltimaAlertaUSD`); si el envio falla no se marca y se reintenta con la proxima solicitud
- La logica vive en `backend/app/services/backoffice/monitoreo_ia_service.py`. Tests: `backend/tests/test_backoffice_monitoreo_ia.py` (CP1 a CP7, con Gemini simulado por `httpx.MockTransport`) y `frontend/src/tests/backoffice/BackofficeMonitoreoIAScreen.test.js`, `frontend/src/tests/formatoMonitoreo.test.js`

### Frontend del backoffice

- punto de entrada: `BackofficeApp`, con navegacion por estado (`inicio`, `usuarios`, `detalleUsuario`, `categorias`, `monitoreoIA`, `terminos`, `planes`, `suscripciones`); no usa React Navigation
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
