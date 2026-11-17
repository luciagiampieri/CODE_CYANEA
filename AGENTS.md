# AGENTS.md

Guia operativa de Cyanea para colaboradores humanos y agentes como Codex.

Si trabajas con Codex, pide primero que lea este archivo completo antes de proponer o implementar cambios.

Regla permanente:

- Toda nueva definicion tecnica, convencion, criterio de implementacion, decision de arquitectura o cambio de estructura del proyecto debe actualizarse en este `AGENTS.md` dentro del mismo trabajo.

## Objetivo del proyecto

Cyanea es una aplicacion para organizacion colaborativa de viajes grupales.

Alcance implementado:

- autenticacion con email (con confirmacion) y login social con Google y Facebook
- viajes con uno o varios destinos, reparto de noches y traslados
- participantes, invitaciones por usuario, correo o link, y transferencia de administracion
- itinerario (timeline y calendario), sugerencias con IA, rutas diarias y exportacion
- exploracion de lugares con Google Places
- gastos, liquidacion y transferencias
- votaciones
- documentos, informacion relevante y checklist
- notificaciones por email y sincronizacion en tiempo real por WebSocket
- consulta offline del itinerario y documentos guardados

Fuera de alcance:

- pagos reales
- venta de pasajes o reservas

## Stack tecnologico

- Frontend: Expo + React Native + React Navigation + Expo Web
- Backend: FastAPI + SQLAlchemy + Alembic
- Base de datos: PostgreSQL
- Storage: Supabase Storage
- Deploy: frontend en Cloudflare Workers, backend en Railway

Nota de entorno actual:

- Expo 58 requiere Node `>= 20.19.4`
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
EMAIL_INVITATIONS_DAILY_LIMIT=20
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
- Con `APP_ENV=production` (o `produccion`/`prod`) no se publican `/docs`, `/redoc` ni `openapi.json` (`opciones_documentacion` en `app/main.py`)
- Health: `GET /health`

## Testing

Toda US nueva o modificada se entrega con tests en backend y frontend. Los archivos de test se nombran por la funcionalidad y, cuando la US tiene casos de prueba, los tests indican el CP que cubren (CP1, CP2...).

### Backend

- pytest sobre SQLite en memoria; fixtures compartidas en `backend/tests/conftest.py` (`client`, `db_session`, `master_data`, `planificacion_master_data`, etc.)
- Los tests nunca llaman servicios externos reales: IA, Google Places, Mercado Pago y correo se reemplazan con `app.dependency_overrides`, `monkeypatch` o `httpx.MockTransport`
- SQLite no aplica FKs ni corre el SQL de Postgres: migraciones y scripts que dependen de Postgres se prueban tambien contra Postgres
- La suite completa tarda mas de 20 minutos; durante el desarrollo correr el archivo afectado (`python -m pytest tests/<archivo>.py`) y la suite completa antes del push
- Corre en CI con `.github/workflows/backend-tests.yml`

### Frontend

- Jest 30 con preset `jest-expo` y `@testing-library/react-native`; configuracion en la seccion `jest` de `frontend/package.json`
- Comandos desde `frontend/`:
  - `npm test`: todos
  - `npm test -- <NombreArchivo>`: un archivo
  - `npm test -- -t "<texto>"`: por nombre de test
  - `npm run test:watch`: modo observador
  - `npm run test:coverage`: cobertura
  - `npm run test:slow`: en serie con `--runInBand`
- Ubicacion: `frontend/src/tests/`; los del backoffice en `frontend/src/tests/backoffice/` y las utilidades compartidas en `frontend/src/tests/helpers/`. No dejar tests junto a los componentes
- `testTimeout` de 20 s. Umbral de cobertura global: 30 % de sentencias (`coverageThreshold`); la cobertura excluye `src/tests/**`, `src/**/*.native.js` y `src/theme/**`
- `frontend/jest.setup.js` (`setupFiles`) simula para todos los tests: `@react-native-community/netinfo` (conectado por wifi; para probar modo offline se sobreescribe `fetch`/`useNetInfo` dentro del test), `expo-sqlite` (base vacia), `expo-font` (fuentes cargadas), `@react-navigation/bottom-tabs` (navigator sin barra y `BottomTabBarHeightContext`), `react-native-safe-area-context` (mock oficial) y `components/profile/MapaPaises`. Un modulo nativo nuevo que rompa el entorno de Jest se mockea ahi, no en cada test
- Las llamadas HTTP se simulan con `jest.mock` sobre `services/api.js` o `services/backofficeApi.js`; ningun test depende del backend levantado
- Los dialogos se prueban con `simularDialogos` de `frontend/src/tests/helpers/dialogosSimulados.js` (ver "Dialogos y mensajes")
- Los elementos que un test necesita encontrar llevan `testID` estable (por ejemplo `balance-phases`, `phase-pre_viaje`, `expense-detail-cotizacion`, `preview-conversion`, `backoffice-volver`). Preferir `testID` o roles accesibles antes que textos largos
- Si un cambio modifica un texto visible, actualizar en el mismo trabajo los tests que lo buscan
- Corre en CI con `.github/workflows/NOMBRE_WORKFLOW.yml`; un push con tests del frontend rotos o por debajo del umbral de cobertura falla en GitHub Actions

## Convenciones generales

### Idioma

- Dominio, tablas, entidades y columnas: espanol
- Codigo tecnico de framework, nombres de funciones utilitarias y estructuras internas: puede convivir con ingles si ya sigue el stack

### Regla de oro

Respetar el modelo de dominio en espanol. No introducir nombres tipo `trip_id`, `user_id`, `trip_member` o equivalentes en ingles para entidades del dominio.

## Convenciones de base de datos

### Documentacion de despliegue

- La topologia alojada y el flujo de compilacion/distribucion viven en `docs/despliegue/`, con fuentes `.puml`, vistas `.svg` y `arquitectura-despliegue.md`. Regenerar las vistas al modificar las fuentes; los diagramas usan Smetana integrado en PlantUML y no requieren Graphviz ni includes remotos.
- Separar las vistas de desarrollo/validacion y produccion. GitHub Actions pertenece al flujo de validacion de cambios y no es un requisito de publicacion productiva. Los perfiles EAS development/preview se documentan en desarrollo y production en la distribucion productiva; EAS Workflows no debe confundirse con GitHub Actions. La separacion documental no implica crear infraestructura ni un staging remoto.
- Distinguir ejecucion (clientes, Cloudflare Workers, FastAPI, PostgreSQL, storage e integraciones) de compilacion/distribucion (export web y EAS). Identificar como pendientes de verificacion los datos de infraestructura que no constan en el repositorio y no presentar tiendas, iOS, pipelines automaticos ni replicas como operativos sin evidencia. No versionar credenciales ni herramientas de render.

### Documentacion de secuencias

- Los diagramas de procesos viven en `docs/secuencias/`, con un `indice.md` que describe su alcance y enlaza las referencias de implementacion. Cada secuencia conserva una fuente PlantUML autocontenida `.puml` y su vista `.svg` con el mismo nombre base; regenerar ambas juntas. Los JAR, scripts temporales y previews PNG de verificacion no se versionan.
- Los numeros identifican procesos y no modulos de datos; se permiten sufijos para disparadores independientes del mismo proceso (por ejemplo, contratacion y webhook). Las lineas de vida de API, servicios y herramientas representan componentes logicos del mismo backend, no microservicios nuevos.
- Modelar el comportamiento implementado, distinguiendo confirmaciones del usuario, transacciones de base de datos y llamadas externas. Los diagramas basicos pueden omitir variantes si el indice declara el recorte; no presentar funcionalidades previstas como implementadas ni incluir datos sensibles.

### Documentacion modular del modelo

- `docs/modelo-datos/Cyanea_Diccionario_de_datos.docx` es la version Word consolidada de los once diccionarios Markdown, con indice, salto por modulo y tablas en paginas horizontales con encabezados repetidos. Los Markdown conservan la fuente de verdad y la fecha/corte de su inspeccion; exportar el Word no constituye una nueva validacion del esquema. Los scripts y renders temporales se mantienen fuera de los archivos versionados.
- Los DER y diccionarios de datos viven en `docs/modelo-datos/modulo-NN-nombre/`. Cada carpeta contiene `der-resumido.puml`, `der-fisico.puml`, sus vistas `.svg` y `diccionario-datos.md`. Los SVG son parte de la documentacion y deben regenerarse junto con sus fuentes; no versionar herramientas de render ni previews PNG temporales.
- Cada tabla tiene un modulo propietario; las tablas externas se muestran como referencias con su PK, sin duplicar su diccionario. Las cardinalidades, tipos, nulabilidad, defaults, indices y restricciones se contrastan con migraciones y PostgreSQL; las validaciones de servicios se identifican como reglas de aplicacion.
- El modulo 1, Usuarios, autenticacion y preferencias, documenta `Usuarios`, `RolesSistema`, `TokensRecuperacionPassword`, `SolicitudesRecuperacionPassword`, `SolicitudesConfirmacionEmail` y `SesionesBackoffice`. Las preferencias personales permanecen en `Usuarios`; `Planes` es referencia externa del modulo 9, los dispositivos push pertenecen al modulo 10 y la auditoria de accesos al modulo 11.
- El modulo 2, Viajes, destinos y participantes, documenta `Viajes`, `Destinos`, `DestinosViajes`, `EstadosViajes`, `ParticipantesViajes`, `RolesParticipantes`, `EstadosParticipaciones`, `InvitacionesViajes`, `EstadosInvitaciones` y `EnlacesInvitacionViajes`; `Usuarios` y `Monedas` son referencias externas de los modulos 1 y 6. Los tramos de traslado y el itinerario pertenecen al modulo 3.
- El modulo 3, Itinerario, traslados y rutas, documenta `DiasCronogramas`, `ActividadesItinerario`, `TramosTrasladosViajes`, `TiposTramosTraslados`, `RutasDiarias`, `LugaresInteres` y `LugaresInteresViajes`. Los lugares se documentan aqui como soporte geografico compartido del itinerario y de la exploracion; `Usuarios`, `Viajes`, `Destinos` y `Votaciones` son referencias externas. Los indices UNIQUE parciales de rutas y tramos se documentan con sus predicados, sin convertirlos en cardinalidades 1 a 1 incondicionales.
- El modulo 4, Planificacion y asistencia inteligente, documenta `PreferenciasPlanificacion`, `InteresesPlanificacion`, `RitmosViajes`, `PreferenciasPlanificacionIntereses`, `SolicitudesSugerenciasActividades`, `SugerenciasActividades`, `EstadosSugerenciasActividades` y `AccionesAsistenteViaje`. Referencia `Usuarios`, `Viajes`, `ParticipantesViajes` y `DiasCronogramas`; la telemetria de proveedores en `SolicitudesIA` pertenece al modulo 11. No representar referencias internas en JSON/TEXT como FK ni confundir defaults del ORM con defaults fisicos de PostgreSQL.
- El modulo 5, Votaciones, documenta `Votaciones`, `Propuestas` y `Votos`, con referencias externas a `Usuarios`, `Viajes`, `DiasCronogramas` y `SugerenciasActividades`. El tipo de votacion es un ENUM nativo; el estado abierta/cerrada/cancelada es derivado y no se agrega como columna al DER.
- El modulo 6, Gastos y liquidaciones, documenta `Gastos`, `ParticipantesGastos`, `Monedas`, `CategoriasGastos`, `LiquidacionesViajes`, `TransferenciasLiquidaciones`, `EstadosTransferenciasLiquidaciones` y `EscaneosComprobantes`. Referencia `Usuarios`, `Viajes`, `ParticipantesViajes` y `DocumentosViajes`. Las categorias se documentan aqui aunque se administren desde el backoffice; balances y etapas no se representan como tablas persistidas. Las diferencias entre constraints del ORM y de PostgreSQL deben quedar explicitas en el diccionario, sin modificar el esquema como parte de la documentacion.
- El modulo 7, Documentos e informacion del viaje, documenta `DocumentosViajes`, `CategoriasDocumentos` e `ItemsRepositorioViaje`. Referencia `Usuarios` y `Viajes`; los archivos binarios se conservan en storage externo. Las referencias entrantes desde gastos y tareas se explican sin duplicar sus diccionarios. `UrlArchivo` es el localizador de storage y `EsPublico` expresa la visibilidad funcional dentro del viaje, no una publicacion global.
- El modulo 8, Tareas y checklist, documenta `Checklists`, `CategoriasChecklist`, `ResponsablesChecklist` y `DocumentosChecklists`. Referencia `Usuarios`, `Viajes`, `ActividadesItinerario` y `DocumentosViajes`. Las asociaciones de documentos se documentan aqui como parte del flujo de tareas: eliminarlas no elimina el documento del repositorio. Los responsables apuntan a cuentas; la pertenencia al viaje, privacidad y permisos se validan en servicios.
- El modulo 9, Planes, suscripciones y pagos, documenta `Planes`, `EstadosSuscripciones`, `SuscripcionesUsuarios`, `EstadosPagosSuscripciones`, `PagosSuscripciones`, `EstadosNotificacionesPasarela` y `NotificacionesPasarela`, con referencia externa a `Usuarios`. Los identificadores de la pasarela son texto, no FK locales. No confundir plan efectivo, estado de suscripcion, periodo de cada pago y resultado de recepcion de webhooks.
- El modulo 10, Notificaciones y recordatorios, documenta `Notificaciones`, `TokensPushUsuarios` y `RecordatoriosActividadesNotificados`. Referencia `Usuarios`, `Viajes` y `ActividadesItinerario`; preferencias y consentimientos permanecen en el modulo 1. Las marcas de lectura o de recordatorio no se documentan como confirmaciones de entrega por cada canal o destinatario.
- El modulo 11, Administracion, auditoria y monitoreo, documenta `AuditoriaAccesosBackoffice`, `AuditoriaSuspensionesUsuarios`, `VersionesTerminos`, `AuditoriaTerminos`, `AuditoriaPlanes`, `SolicitudesIA` y `ConfiguracionesMonitoreoIA`. Referencia `Usuarios` y `Planes`. La consulta unificada de auditoria, los KPI y el estado del umbral son derivados; no inventar tablas para esas vistas ni relacionar telemetria de IA con cuentas o viajes mediante FK inexistentes.
- `docs/modelo-datos/inventario-tablas.md` mantiene el indice de propiedad y cobertura del esquema. Se excluye `alembic_version` por ser control tecnico de migraciones. Al agregar, mover o retirar tablas, actualizar el inventario y los modulos afectados sin duplicar propietarios.
- Una vista resumida del DER puede omitir atributos si lo declara; el DER fisico y el diccionario deben incluir todas las columnas de las tablas propias. No representar vinculos por texto o hash como FK inexistentes.

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
- `EstadosNotificacionesPasarela`
- `TiposTramosTraslados`

Datos maestros y seed:

- `backend/scripts/sql/007_datos_maestros.sql`
- `backend/scripts/sql/008_seed_minimo.sql`
- Las tablas maestras posteriores a esos scripts se siembran en su propio script (por ejemplo `015`, `021` y `026`), porque `run_all.sql` ejecuta `007` antes de crearlas

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

- Saldos por etapa del viaje: cada gasto compartido (`TipoDivision` no nulo) se clasifica por `FechaGasto` contra las fechas del viaje: `pre_viaje` (antes de `FechaInicio`), `en_curso` (entre `FechaInicio` y `FechaFin`, inclusive) y `post_viaje` (despues de `FechaFin`). Los gastos personales no entran en las etapas
- La respuesta de `/settlement` suma `FechaInicioViaje`, `FechaFinViaje`, `Fases` del grupo y `Fases` en cada participante (`SaldoFaseRead`: `Fase`, `Desde`, `Hasta`, `CantidadGastos`, `TotalGrupo`, `Pagado`, `Parte`, `Neto`). La logica vive en `liquidacion_service.py` (`fase_del_gasto`, `_rango_fase`, `_resumen_por_fase`) y no se persiste
- Las transferencias se descuentan solo del saldo total, no por etapa: la suma de los netos de las tres etapas es el saldo antes de transferencias
- Frontend: `components/trip/SettlementBalances.js` muestra el bloque "Por etapa del viaje" con las fases del participante actual (testID `balance-phases` y `phase-<fase>`); `TripDetailScreen` no cambia porque las fases viajan dentro de cada participante. Tests: `frontend/src/tests/SettlementBalances.test.js`

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

## Recomendacion de entradas y reservas (US 122 y US 123)

### Sugerir entradas y reservas para actividades (US 122)

- El analisis corre al crear y al editar una actividad (`POST`/`PUT /trips/{trip_id}/days/{day_id}/activities...`) y al agendar un lugar guardado desde Explorar (`places.py`); la respuesta suma `recomendacionEntradas` (null si no corresponde). Es no bloqueante: cualquier error externo deja registrar o modificar la actividad sin recomendacion y se reintenta en la proxima modificacion
- Reutiliza el establecimiento que ya identifico la validacion de horarios (US 98) con Google Places. La logica vive en `backend/app/services/entradas_ai/` y el orquestador es `analisis.py` (su docstring describe el flujo completo)
- Reevaluacion solo ante cambio de lugar: `ActividadesItinerario.GooglePlaceIdEntradas` guarda el lugar ya analizado y `decidir_analisis` compara contra el lugar identificado. Cambiar nombre ("Museo del Prado" -> "Visita al Museo del Prado"), horario, categoria o agregar la ubicacion del mismo lugar no vuelve a recomendar, tampoco despues de cerrar y abrir la app
- Que se analiza: solo lugares turisticos o gastronomicos segun `primaryType`/`types` de Google Places (`turismo.py`; nunca por el nombre ni preguntando al modelo; quedan fuera fast food, take away y delivery). El sitio oficial es el `websiteUri` de Places; si falta, o es red social, agregador o revendedor (`sitio_oficial.es_dominio_de_terceros`), no hay recomendacion
- `sitio_oficial.py` descarga la pagina de inicio y hasta `ENTRADAS_SITIO_MAX_PAGINAS` internas relevantes, pidiendo español. Gemini (`gemini.py`) solo interpreta ese texto en cualquier idioma y devuelve evidencia literal mas su traduccion; nunca navega. `verificar_interpretacion` exige que la evidencia este en el sitio, no sea solo el texto de un boton ("Comprar tickets") y hable de lo recomendado
- Si el sitio no se puede leer o no confirma nada, `busqueda_google.py` usa Grounding with Google Search de Gemini y acepta el resultado solo si la fuente es el sitio oficial (`AI_ENTRADAS_BUSQUEDA_GOOGLE`). Sin evidencia verificada no se recomienda; si Gemini no responde se usan las reglas de `vocabulario.py`
- Tipos (`tipos.py`): `RESERVA` (nivel `obligatoria` o `recomendada`), `RESERVA_DISPONIBLE` (acepta reservas sin exigirlas), `ENTRADAS_ANTICIPADAS` y `ENTRADAS_PRESENCIALES` (llegar con anticipacion a boleteria); `SIN_INFORMACION` no muestra nada. Mensajes en español aunque el sitio este en otro idioma
- Enlaces: solo del sitio oficial o de una plataforma de reservas reconocida (`sitio_oficial.PLATAFORMAS_RESERVA`, p. ej. OpenTable), que se informa como sitio de terceros; si no hay enlace valido se muestra `AVISO_SIN_ENLACE`
- Configuracion: `AI_ENTRADAS_ENABLED`, `AI_ENTRADAS_MODEL`/`AI_ENTRADAS_FALLBACK_MODEL`, `AI_ENTRADAS_TIMEOUT_SECONDS` (12), `ENTRADAS_SITIO_TIMEOUT_SECONDS` (6), `ENTRADAS_TIMEOUT_TOTAL_SECONDS` (20) y cache por lugar `ENTRADAS_CACHE_TTL_SECONDS` (6 h). Consumo registrado como `SERVICIO_*` `recomendacion_entradas` (US 114)
- Frontend: `utils/recomendacionEntradas.js` normaliza y presenta la recomendacion; `utils/dialogosActividad.js` muestra el dialogo desde `AddActivityScreen`, `DayAgenda` y `PlaceScheduleSheet` (Explorar)
- Tests: `backend/tests/test_recomendacion_entradas.py` y `frontend/src/tests/RecomendacionEntradas.test.js`

### Recordatorio de entradas o reservas en el checklist (US 123)

- El dialogo de la US 122 ofrece "Recordármelo" solo para `RESERVA`, `RESERVA_DISPONIBLE` y `ENTRADAS_ANTICIPADAS` (`tareas_entradas.TIPOS_RECORDABLES`; nunca para entradas presenciales), tanto en actividades como al agendar desde Explorar. "Ahora no" (cruz o tocar afuera) y abrir el enlace no crean nada: la tarea solo se crea si el usuario la elige
- Contrato: `POST /trips/{trip_id}/activities/{activity_id}/tarea-entradas` (`checklists.py`), con acceso de edicion y viaje no finalizado. Crea la tarea con titulo «Comprar entradas – <lugar>» o «Reservar – <lugar>» (si el titulo ya existe en el viaje se agrega el dia, p. ej. «(jue 14/11)»), categoria "Reservas y entradas" (`CATEGORIA_RESERVAS_ENTRADAS`, disponible tambien para tareas manuales), sin responsable y con `Checklist.Enlace` si hay enlace oficial
- La tarea queda vinculada por `Checklist.IdActividad` y `Checklist.GooglePlaceIdEntradas`; editarla desde el checklist (p. ej. el titulo) no rompe el vinculo. Si ya existe una tarea para la misma actividad y lugar no se duplica ("Ya habías agregado esta tarea al checklist."); si el usuario la elimino, no se vuelve a ofrecer mientras no cambie el lugar
- Cambio de lugar o eliminacion de la actividad: si hay tareas pendientes vinculadas, el `PUT` de la actividad responde `ConfirmacionTareasEntradas` (mensaje + tareas) sin guardar; la app pide confirmacion y reenvia con `tareasEntradasAEliminar`. Confirmar elimina las pendientes y analiza el nuevo lugar; cancelar no guarda nada. Las tareas ya hechas se conservan sin aviso (`desvincular_tareas_hechas`). Editar sin cambiar el lugar no avisa ni elimina
- Notificaciones (`NotificationType.TAREA_RESERVA_ENTRADAS`): al crear, a todos los participantes (`checklist_task_created`); al asignar responsable, solo a esa persona (`checklist_task_assigned`); al eliminar por cambio de lugar o baja de la actividad, al responsable o, si no tiene, a todos (`checklist_task_deleted`)
- Un error al crear la tarea se informa y la actividad queda registrada igual; "Recordármelo" no agrega pasos al alta de la actividad
- La logica vive en `backend/app/services/tareas_entradas.py`. Frontend: `dialogosActividad.js` (dialogo y confirmacion de eliminacion), `ChecklistsByCategory` (abrir enlace) y `api.js` (`/tarea-entradas`)
- Tests: `backend/tests/test_tareas_entradas.py` y `frontend/src/tests/RecordarTareaEntradas.test.js`

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

## Cotizacion declarada en gastos

- Todo gasto en una moneda distinta a la del viaje informa la cotizacion usada, porque depende de la region y de la fecha
- `Gastos` suma `FuenteCotizacion` (`VARCHAR(30)`, NULL) y `FechaCotizacion` (`DATE`, NULL); migracion `b0bcca3ac886`. Los gastos anteriores quedan en NULL
- Fuentes (constantes en `api/routes/gastos.py`): `referencia` (tipo de cambio de Frankfurter de `services/currency.py`, cotizacion mas cercana dentro de 3 dias de la fecha del gasto) y `manual` (monto en ARS ingresado por quien cargo el gasto, con `MontoConvertidoARS`). `_origen_cotizacion` decide la fuente al crear; al editar solo se recalcula si cambia la conversion (`_requiere_reconversion`), si no se conservan
- `GET /gastos/{id}` (`GastoDetalleRead`) devuelve `FuenteCotizacion` y `FechaCotizacion`
- Frontend: antes de guardar, `AddGastoScreen` muestra la conversion a la moneda del viaje con `GET /monedas/cotizacion` (testID `preview-conversion`, `preview-conversion-monto`, `preview-conversion-tasa`); en un comprobante convertido a ARS la tasa aparece bajo el monto en pesos (`conversion-ars-tasa`). Si la cotizacion falla no bloquea: el importe se convierte al guardar
- En el detalle, `ExpenseDetailModal` muestra "1 ORIGEN = X DESTINO" (invertida si la tasa es menor a 1) y la fuente (testID `expense-detail-cotizacion` y `expense-detail-cotizacion-fuente`), con la aclaracion de que es un valor de referencia. `textoCotizacion` y `textoFuenteCotizacion` se exportan desde ese modal y se reutilizan en el formulario

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
- La pantalla de planes es la ruta `Planes` (`PlanSubscriptionScreen` en la solapa de comparacion); `irAPlanes()` navega ahi
- "Ver planes" se ofrece solo cuando el usuario puede resolverlo cambiando su propio plan: no al unirse a un viaje lleno ni al aceptar una invitacion (el limite es del administrador), ni cuando el destinatario de una transferencia esta en su limite
- Donde se informa el uso: `CreateTripScreen` (viajes activos, bloquea "Siguiente" si no hay cupo), `ReceiptScanButton` (escaneos restantes del mes; prop `onVerPlanes` para cerrar `AddGastoScreen`), `DocumentsScreen` (barra de almacenamiento y aviso previo si el archivo no entra), `ActivitySuggestionsScreen` y `CompleteFreeDaysScreen` (solicitudes restantes del dia)
- Tests: `backend/tests/test_limites_planes.py` (viajes activos, participantes, transferencias), `test_limites_planes_uso.py` (escaneos y almacenamiento a nivel servicio), `test_limites_planes_endpoints.py` (409 por API de escaneo y documentos), `test_limites_sugerencias.py` (sugerencias y completar dias libres) y `test_almacenamiento_api.py`

## Notificaciones de la pasarela de pagos (US 117)

- El webhook es `POST /pagos/mercadopago/webhook` (`router_pagos` en `app/api/routes/suscripciones.py`). El cuerpo nunca se usa como fuente de verdad: `suscripcion_pro.procesar_notificacion` vuelve a consultar el cobro (`obtener_cobro`) o la suscripcion (`obtener_suscripcion` + `listar_cobros`) en la API de Mercado Pago (CA3)
- Autenticidad (CA2): se valida `x-signature` con HMAC-SHA256 de `id:{data.id};request-id:{x-request-id};ts:{ts};` usando `MERCADOPAGO_WEBHOOK_SECRET` (`firma_valida`; los `data.id` alfanumericos se firman en minuscula). Firma ausente, incompleta o invalida responde 401 `INVALID_SIGNATURE` sin procesar ni registrar nada. Sin clave configurada responde 503 `WEBHOOK_SIGNATURE_NOT_CONFIGURED` para que Mercado Pago reintente cuando se configure; `MERCADOPAGO_WEBHOOK_ALLOW_UNSIGNED=true` solo para desarrollo local y en los tests que no prueban la firma
- Activacion y renovacion (CA4) siguen en `_registrar_cobro`: el primer cobro aprobado activa desde la fecha de aprobacion y cada renovacion aprobada extiende `FechaFin` segun `MesesPeriodo`. Los vencimientos se cuentan siempre desde esa activacion (`_periodo_siguiente`: `sumar_meses(activacion, n * MesesPeriodo)`), nunca desde el `FechaFin` anterior: un fin recortado a fin de mes (31/01 -> 28/02) correria el dia de cobro en cada renovacion. El mismo calculo da `PeriodoDesde`/`PeriodoHasta` del pago (US 120). Cada cobro se guarda en `PagosSuscripciones` con fecha, monto, estado e `IdOperacionPasarela` (CA7). Los cobros de suscripciones canceladas, vencidas o descartadas no se registran ni cambian el estado (decision de la US 119)
- Idempotencia (CA8): `IdOperacionPasarela` es unico y un cobro ya registrado con el mismo estado o ya aprobado no vuelve a extender ni a notificar; la fila de la suscripcion se bloquea con `SELECT FOR UPDATE` para serializar notificaciones concurrentes
- Renovacion rechazada (CA5): la suscripcion pasa a `pendiente_pago`, se guarda `SuscripcionesUsuarios.FechaPendientePago` y se avisa por la app y por correo (`subscription_renewal_rejected`) con la fecha limite. Los reintentos rechazados no reinician el plazo ni repiten el aviso; un cobro aprobado dentro del plazo renueva y limpia `FechaPendientePago`. El usuario conserva Pro durante el plazo
- Vencimiento (CA6): `fin_suscripciones.vencer_pendientes_de_pago` corre primero en el scheduler horario y pasa a `vencida` las renovaciones con `FechaPendientePago` de hace `SUBSCRIPTION_PENDING_PAYMENT_DAYS` dias o mas (3 por defecto, configurable). Cancela la suscripcion en Mercado Pago para que no siga reintentando (si la pasarela falla, vence igual y se registra warning); luego `finalizar_suscripciones` devuelve al plan gratuito cuando termina el periodo pagado. Los intentos iniciales sin pago no vencen por este proceso. `fecha_limite_pago` vive en `precios_suscripciones.py` y `GET /users/me/suscripcion` la expone como `fechaLimitePago`
- Errores (CA9): un error de la pasarela responde 503 `PAYMENT_GATEWAY_UNAVAILABLE` y cualquier otro 500 `WEBHOOK_PROCESSING_ERROR`, previo rollback; Mercado Pago reintenta y la idempotencia evita duplicados. Fallos de correo o push posteriores al commit no provocan reintentos
- Registro: cada notificacion con firma valida y `data.id` queda en `NotificacionesPasarela` (`Tipo`, `IdRecurso`, `IdSolicitudPasarela` = `x-request-id`, `Error` hasta 500 caracteres, `FechaRecepcion`) con estado maestro `procesada`, `ignorada` (tipo ajeno o suscripcion desconocida) o `error`. Una fila por recepcion; nunca se guarda el cuerpo crudo ni datos del pagador. Logica en `app/services/pagos/notificaciones_pasarela.py`; un fallo al registrar no cambia la respuesta
- Migracion `f117a1b2c3d4` y script `023_notificaciones_pasarela_pagos.sql`: columna `FechaPendientePago` (las renovaciones que ya estaban pendientes toman `FechaFin`), tablas `EstadosNotificacionesPasarela` y `NotificacionesPasarela`
- Backoffice: `GET /backoffice/pagos/notificaciones?estado&pagina` (router protegido, 20 por pagina, orden descendente, `totalesPorEstado` sobre todo el historial). La vista "Notificaciones de la pasarela" de `BackofficeSuscripcionesScreen` usa `components/backoffice/NotificacionesPasarela.js` y `listarNotificacionesPasarela` de `backofficeApi.js`
- App: `SubscriptionPanel` informa en `pendiente_pago` la fecha limite antes de que la suscripcion venza
- Tests: `backend/tests/test_notificaciones_pasarela.py` (CP1 a CP7, consulta a la pasarela, plazo configurable y backoffice); frontend `ProcesarNotificacionesPasarela.test.js`, `backoffice/NotificacionesPasarela.test.js` y `backoffice/backofficeApi.test.js`

## Gestionar suscripcion Pro (US 119)

- Acceso desde Configuracion > Mi cuenta (ruta `MiSuscripcion`, que abre `PlanSubscriptionScreen` en la solapa "Mi plan"); la UI es `components/plans/SubscriptionPanel.js`
- Contratos (router `suscripciones.py`, prefijo `/users`): `GET /me/suscripcion` (`no-store`) devuelve `planActual` y la suscripcion actual con modalidad, estado, precio congelado, fechas, `fechaProximaRenovacion` (solo si esta `activa`), `fechaCancelacion`, `fechaLimitePago`, `renovacionAutomatica`, `puedeCancelar`, `puedeReactivar` y `urlMedioPago`; `POST /me/suscripcion/cancelar` y `POST /me/suscripcion/reactivar` responden lo mismo mas `message`
- Suscripcion actual = la de `FechaFin` mas reciente en estado `activa`, `cancelada` o `vencida`, o `pendiente_pago` con algun cobro aprobado (los intentos iniciales sin pago no cuentan). La logica vive en la seccion "US 119" de `services/suscripcion_pro.py`
- Cancelar: solo una `activa` y vigente (si no, 409 `SUBSCRIPTION_NOT_CANCELLABLE`). La app confirma con `appAlert` informando hasta cuando se conservan los beneficios; cancelar el dialogo no ejecuta nada. Se **pausa** la suscripcion en Mercado Pago (`pausar_suscripcion`, `EstadoPasarela=paused`) para que no haya nuevos cobros, el estado pasa a `cancelada` con `FechaCancelacion` y Pro se mantiene hasta `FechaFin`. Al terminar el periodo, `fin_suscripciones.cancelar_en_pasarela` la cancela del todo en la pasarela
- Reactivar: solo una `cancelada` antes de `FechaFin` (si no, 409 `SUBSCRIPTION_NOT_REACTIVABLE`, o `SUBSCRIPTION_PERIOD_ENDED` si el periodo ya termino: hay que iniciar una suscripcion nueva). Reanuda en Mercado Pago (`reactivar_suscripcion`) sin cobro inmediato, vuelve a `activa`, limpia `FechaCancelacion` y registra `FechaAceptacionRenovacion`
- Errores de la pasarela al cancelar o reactivar hacen rollback y responden 503 `PAYMENT_GATEWAY_UNAVAILABLE` (sin configurar) o 502 `PAYMENT_GATEWAY_ERROR`; el estado local no cambia si Mercado Pago no confirmo
- Pendiente de pago: `urlMedioPago` (`mercadopago.URL_GESTION_SUSCRIPCIONES`) habilita "Actualizar medio de pago", que abre Mercado Pago con `Linking.openURL`
- Notificaciones (`notificaciones_suscripciones.py`): la cancelacion registra aviso interno y envia `subscription_cancelled.html/.txt`; la reactivacion solo registra aviso interno. Los fallos de correo no revierten la accion
- Fuera de alcance: contratacion inicial (US 116), cambio de modalidad, reembolsos, renovacion (US 124) y vuelta al gratuito (US 121)
- Tests: `backend/tests/test_gestion_suscripcion_pro.py`; frontend `PlanesDisponibles.test.js` y `SuscipcionPro.test.js`
- `GET /users/me` incluye `planActual` (`gratuito` o `pro`, desde `Usuarios.IdPlan`) y responde con `Cache-Control: no-store`. `ProfileScreen` muestra el badge y la `PlanCard` con `consumo.planActual ?? profile.planActual`, asi el plan Pro se ve en el perfil apenas cambia

## Volver al plan gratuito al finalizar la suscripcion (US 121)

- El proceso es `fin_suscripciones.procesar_fin_suscripciones`, que corre cada hora en el scheduler del lifespan de `main.py` (no corre en pytest) y tambien a mano con `python -m scripts.procesar_fin_suscripciones`. Orden: vencer pendientes de pago (US 117), `finalizar_suscripciones`, `cancelar_en_pasarela` y `avisar_finalizaciones_proximas`
- Finalizacion: una suscripcion `cancelada` o `vencida` con `FechaFin` alcanzada y sin `SuscripcionesUsuarios.FechaFinalizacion` se marca con esa fecha; el usuario vuelve a `PLAN_GRATUITO` salvo que tenga otra suscripcion vigente. Se bloquean suscripcion y usuario con `SELECT FOR UPDATE` y cada una se confirma por separado
- Aviso previo: las `cancelada` cuyo `FechaFin` cae dentro de `DIAS_AVISO_PREVIO` (3 dias) reciben una sola vez por periodo un aviso interno y el correo `subscription_ending_soon` (se marca `FechaAvisoFinalizacion`)
- Nunca se elimina contenido: viajes, documentos, gastos, actividades y sugerencias se conservan. Los limites gratuitos solo bloquean nuevas acciones con los validadores de `limites_planes` (US 118): crear viajes si se excede el cupo de viajes activos, sumar participantes, subir documentos (ver y descargar siguen permitidos)
- Limite de sugerencias IA: `limites_planes._plan_para_sugerencias` sigue aplicando el limite Pro durante el dia (hora `AI_SUGGESTIONS_TIMEZONE`) en que el administrador volvio al gratuito; el gratuito rige desde el dia siguiente. Los escaneos mantienen su cupo mensual personal
- Notificaciones: al usuario, aviso interno y correo `subscription_ended.html/.txt` con la lista de limites excedidos (viajes activos, participantes y almacenamiento de cada viaje que administra); a los participantes aceptados de los viajes activos que administra (salvo el), aviso interno `viaje_plan_gratuito` con los limites excedidos de ese viaje. Un fallo al notificar no revierte el cambio de plan
- Migracion `a839d1b13ab8` (columnas `FechaAvisoFinalizacion` y `FechaFinalizacion`). Para probar sin Mercado Pago: `python -m scripts.simular_suscripcion crear|mover --email ... --dias N`
- Fuera de alcance: la cancelacion (US 119), el vencimiento por falta de pago (US 124/117), la aplicacion general de limites (US 118) y la eliminacion del contenido excedente
- Tests: `backend/tests/test_fin_suscripcion_pro.py` (cambio de plan, aviso previo, notificaciones) y `test_fin_suscripcion_viajes.py` (conservacion de contenido y bloqueos posteriores)

## Recorrido del viaje (US A)

- Se arma en el paso Destinos de `CreateTripScreen` y en la pestaña Destinos de `EditTripScreen`, con el componente compartido `components/trip/RecorridoViaje.js`. La logica pura vive en `frontend/src/utils/recorrido.js` y en backend en `backend/app/services/recorrido_viaje.py`
- `DestinosViajes` guarda `Orden` (desde 0), `Noches` (NULL = sin armar) y `NochesEnViaje` (traslado hacia el destino siguiente; el ultimo siempre 0). Migracion `b130a1b2c3d4`, script `025_recorrido_destinos_viajes.sql`. `Viaje.Destinos` se ordena por `Orden`. El backfill toma `ctid` como orden de carga y deja `Noches` en NULL: los viajes existentes no se reparten automaticamente
- Noches del viaje = `FechaFin - FechaInicio`. Las fechas de cada destino nunca se persisten: `calcularTramos` las deriva (salida = llegada + noches; llegada siguiente = salida + noches en viaje). Las noches libres quedan al final como dias sin destino. La US B debe reutilizar `calcularTramos` y tomar cualquier `Noches` NULL como recorrido sin armar
- Regla unica del recorrido (QA US 135): con dos o mas destinos el recorrido siempre se ve y un destino sin noches siempre se avisa; solo se bloquea lo que se resuelve repartiendo (noches de mas, o un destino en 0 cuando las noches alcanzan para todos). "Repartir automáticamente" solo se ofrece si puede darle al menos una noche a cada destino (`puedeRepartir`); si las noches en viaje no lo permiten, se avisa "Quitá noches de traslado para poder repartirlas" y `repartirNoches` no cambia nada. Si las noches del viaje no alcanzan para todos los destinos (`pocasNoches`) se muestra un aviso amarillo (testID `recorrido-pocas-noches`) y se puede seguir: se guarda sin repartir
- `modoRecorrido` define que se ve y que se valida: `unico` (1 destino, "Todo el viaje", se guarda NULL), `pocasNoches` (menos noches que destinos: sin contadores, con el aviso de la regla unica, y se guarda NULL), `sinArmar` (solo al editar, algun destino en NULL: contadores en "—", no bloquea hasta tocar un contador, que pasa los demas a 0) y `armado`
- Un destino sin noches muestra "Sin noches todavía" en lugar del rango (`textoRangoTramo`)
- Un destino nuevo arranca en 0 noches, tambien al pasar de 1 a 2 destinos (los dos quedan en 0); en `sinArmar` queda sin noches. Solo se avanza o guarda en `armado` si no hay destinos en 0 ni noches de mas. Las noches libres solo se avisan en amarillo. En la pestaña Datos de la edicion, `avisoCambioFechas` compara con las noches del viaje al cargarlo: si cambia la cantidad y un recorrido `armado` deja de coincidir, muestra el aviso (o el error, si no entran) con el link "Ir a ajustar destinos ›" dentro del cartel (prop `accion` de `AvisoRecorrido`), que abre la pestaña Destinos. Usa la misma cuenta que Destinos (noches de destinos + noches en viaje). Si solo se corren las fechas, o en otros modos, no se muestra nada
- Mientras se edita, el formulario conserva los valores en cualquier modo: `destinosParaGuardar` envia NULL solo si se guarda sin estar `armado`
- Las noches en viaje quedan por posicion: al arrastrar, las noches viajan con el destino y cada traslado queda entre las mismas tarjetas. Al quitar B en A-B-C se libera A-B y B-C pasa a ser A-C; al quitar el primero se libera su traslado saliente; el ultimo nunca conserva noches en viaje
- Vista: `EncabezadoDestinos` ("Tus destinos" y, si hay fechas, rango y noches en gris) lo renderiza cada pantalla tambien sin destinos, dentro de la tarjeta blanca del paso. Debajo, barra de 6 px y el estado (`AvisoRecorrido`): con prioridad error en rojo con fondo y `accessibilityRole="alert"` (noches de mas), informativo en azul con fondo (hay destinos en 0: bloquea, pero es un paso normal del armado), aviso en amarillo con fondo (noches libres) y todo bien con check verde sin fondo. Cada destino es una cajita con borde: foto de 52 px con el numero de orden, nombre y region debajo (`textoRegion`), cruz para quitar y una franja con `colorSuaveDeDestino` que lleva el rango corto ("2 → 4 dic", "28 nov → 1 dic") y la pildora `ContadorNoches`. Nombre, region y rango no llevan `numberOfLines`: si no entran pasan a otro renglon. Con dos o mas destinos, a la izquierda de la foto va la agarradera `grip-vertical`. En web la cajita tiene `userSelect: "none"` (solo web, evaluado al renderizar): mantener apretado el nombre o las noches no selecciona texto. La cajita no tiene campos editables; las noches son botones de `ContadorNoches`
- Entre cajitas va una fila con linea de puntos, icono, texto corto (`textoTraslado`) y una pildora chica para las noches en viaje (`textoPildoraTraslado`). No se muestra en `pocasNoches`
- La cruz quita sin confirmar y `useDeshacerDestino` muestra `AvisoDeshacer` 5 segundos: arriba de los botones en crear y flotante en editar, donde los botones estan dentro del scroll. Deshacer restaura la lista anterior completa; cualquier cambio en los destinos, de paso o de pestaña cierra el aviso. No se usa `appToast` porque no admite botones. Quitar desde el buscador no ofrece deshacer
- Para reordenar se mantiene apretada la foto o la agarradera (300 ms) y se arrastra (las dos estan dentro del mismo `Pressable`, testID `recorrido-mover-N`): `useArrastre` combina el `onLongPress` de un `Pressable` con `PanResponder`, sin librerias nativas, y el `PanResponder` solo toma el gesto despues de la pulsacion larga para no chocar con el scroll. `onArrastreChange` bloquea el scroll mientras se arrastra. La foto expone las acciones de accesibilidad "Mover antes" y "Mover despues"
- Contrato: `DestinationCreate` suma `noches` y `nochesEnViaje`; `DestinationRead` suma `orden`, `noches` y `nochesEnViaje`. El orden es el de la lista enviada. El permiso es el del `PUT /trips/{trip_id}` (`_require_trip_admin` y `require_trip_info_editable`)
- Validacion (`validar_recorrido`, 400 con `X-Error-Code`): `ROUTE_INVALID_NIGHTS`, `ROUTE_INCOMPLETE` (algunos destinos con noches y otros no), `ROUTE_DESTINATION_WITHOUT_NIGHTS`, `ROUTE_NIGHTS_EXCEEDED` y `ROUTE_INVALID_TRANSFER` (noches en viaje en el ultimo destino). Con un destino los valores se ignoran
- APKs anteriores: `model_fields_set` distingue el campo ausente del `null` explicito. Ausente en `PUT` conserva lo guardado (los destinos nuevos quedan en NULL) y, si la suma ya no entra en las fechas, el recorrido vuelve a NULL porque ese cliente no puede corregirlo. `null` explicito guarda NULL
- Tests: `backend/tests/test_recorrido_viaje.py`, `frontend/src/tests/Recorrido.test.js`, `RecorridoViaje.test.js` y las secciones "US A" de `CreateTripScreen.test.js` y `EditTripScreen.test.js`

## Agendar traslados (US 136)

- Un traslado es una `ActividadItinerario` vinculada a un tramo del recorrido, no a un dia: ida (llegada al primer destino, primer dia), entre destinos (par origen -> destino consecutivo, dia de salida del origen) y regreso (ultimo dia). Si el viaje tiene un destino o el recorrido no esta armado solo se ofrecen ida y regreso
- Modelo (migracion `c136a1b2c3d4`, script `026_traslados_viajes.sql`): tabla maestra `TiposTramosTraslados` (ids fijos 1 ida, 2 entre_destinos, 3 regreso; constantes `TIPO_TRAMO_*` en `app/models/tramo_traslado_viaje.py`) y `TramosTrasladosViajes`. Hay fila solo si el tramo tiene algo para recordar (agendado u oculto); un tramo sin agendar se deriva del recorrido. `IdDestinoOrigen`/`IdDestinoLlegada` apuntan a `Destinos` (no a `DestinosViajes`) para conservar el par aunque el destino salga del recorrido, y solo se informan entre destinos. Dos indices unicos parciales garantizan un traslado por tramo
- `ActividadesItinerario.IdTramoTraslado` (UNIQUE) marca que actividad es el traslado de cada tramo: es el dato que usa la US B. Para traslados `Icono` es el medio, `Descripcion` las notas, `HoraInicio` la salida y `HoraFin` la llegada; en ida y regreso, con una sola hora, ambas son iguales. `HoraInicio`/`HoraFin` siguen NOT NULL y `CK_ActividadesItinerario_Horarios` no exige fin > inicio en traslados. La FK es `ON DELETE CASCADE` y no `SET NULL`: anular el vinculo dejaria una fila que viola ese CHECK
- Las fechas de un tramo, el dia donde se muestra y su validez nunca se persisten: se calculan en `app/services/traslados.py` con `recorrido_viaje.calcular_tramos` (mismo calculo que `calcularTramos` del frontend; la UI usa lo que manda el backend). `GET /trips/{trip_id}` suma `traslados` (tramos con `estado` `pendiente`/`oculto`/`agendado`, `validez`, `revisarHorario`, fechas e `idDiaCronograma`) y cada actividad suma `Traslado`
- Contratos (`app/api/routes/traslados.py`, cualquier participante `aceptado`, viaje no finalizado): `POST /trips/{trip_id}/traslados` (`tramo`, `medio`, `horaSalida`, `horaLlegada`, `notas`, `confirmarSuperposicion`), `PUT /trips/{trip_id}/traslados/{activity_id}` (`tramo` solo para reasignar) y `POST /trips/{trip_id}/traslados/ocultar` (`tramo` y `oculto`, `true` por defecto; con `false` se borra la fila y vuelve la tarjeta para todo el grupo). Los schemas usan `extra="forbid"`: enviar una fecha responde 422. La baja reutiliza el `DELETE` de actividades, que tambien borra la fila del tramo y vuelve la tarjeta. El `PUT` generico de actividades responde 409 `TRANSFER_USE_TRANSFER_FORM`
- Errores con `X-Error-Code`: `TRANSFER_MEDIUM_REQUIRED`, `TRANSFER_TIME_REQUIRED`, `TRANSFER_TIME_INVALID`, `TRANSFER_SEGMENT_REQUIRED` (400), `TRANSFER_ALREADY_EXISTS`, `TRANSFER_SEGMENT_NOT_AVAILABLE` (409), `TRANSFER_NOT_FOUND` (404)
- Nombre automatico (`nombre_traslado`): "<Medio> a <destino>" o "<Medio> de regreso". Otro se nombra "Traslado", Barco o ferry "Barco" y A pie "Caminando". El de la ida se regenera si cambia el primer destino
- `update_trip` llama a `sincronizar_traslados` despues de crear los dias nuevos y antes de borrar los sobrantes, y los traslados no bloquean achicar fechas. Se mueven con `mover_de_dia` (colecciones): `DiaCronograma.Actividades` es delete-orphan y borrar el dia viejo arrastraria la actividad si quedara en su coleccion. Sincronizar tambien descarta las tarjetas ocultas de tramos que ya no existen
- Validez: `no_corresponde` (el par dejo de ser consecutivo; se muestra el dia de salida del origen o el primer dia si ya no esta) y `sin_fecha` (el par sigue consecutivo pero el recorrido no esta armado; primer dia, y vuelve solo a su dia al rearmarlo). Un `no_corresponde` solo se guarda eligiendo un tramo vigente sin traslado (reasignacion); si no hay, queda eliminarlo. Un `sin_fecha` edita medio, horas y notas sin comparar horas. Si un tramo pasa a 0 noches en viaje y la llegada queda antes de la salida, sigue valido con `revisarHorario`
- Superposicion (`actividades_superpuestas`, no bloquea; responde `requiereConfirmacion` sin guardar y se reenvia con `confirmarSuperposicion`): en la ida lo que empieza antes de la llegada, en el regreso lo que termina despues de la salida, el mismo dia lo que se cruza con el horario y con noches en viaje lo posterior a la salida y lo anterior a la llegada. Los dias completos en viaje y los otros traslados no cuentan
- Los traslados no pasan por el analisis de horarios ni de entradas (US 98 y 122) y `route_generation` los saltea. Recordatorios: entre destinos y regreso avisan antes de la salida; la ida no. Notificaciones iguales a las de actividades; ocultar no notifica. Tiempo real: `actividad_creada`, `actividad_actualizada`, `actividad_eliminada`, `traslados_actualizados` y `viaje_actualizado`
- Ocupacion: `activity_ai.context.intervalo_actividad` da los minutos de una actividad en su dia (sugerencias, aceptar sugerencia y votaciones). En "Completar dias libres" (US 92), `ocupacion_traslados` descuenta lo que dura el viaje tambien en el dia de llegada y `dias_en_viaje` excluye los dias completos en viaje segun el recorrido armado, este agendado o no
- Frontend: `utils/traslados.js` (medios, textos, validacion), `components/trip/TrasladoCard.js` (tarjeta, linea compacta del tramo oculto con Mostrar y Agendar, y `AvisoTraslado`), `components/trip/RecorridoTraslado.js` (caja unica con origen, destino, sus horas con `HoraField` compacto, noches en viaje y pie para editar el recorrido) y `screens/AddTrasladoScreen.js` (hoja igual a `AddActivityScreen`). `TripDetailScreen` dibuja las tarjetas con `renderTrasladosDelDia` arriba de `DayAgenda` y por `renderEncabezadoDia` en `ItinerarioCalendarView`, solo con `lock.canEdit("itinerario")`; `edicion_concedida` abre este formulario si la actividad es un traslado. "Cambiar en el recorrido" abre `EditarViaje` con `initialTab: "destinations"`. `DayAgenda` y `DayTimeGrid` destacan el traslado; un traslado que llega otro dia ocupa hasta el final del dia de salida (`getActivityTimes`). Web usa los mismos componentes, sin ajustes propios
- Los formularios tipo hoja comparten piezas: `components/ui/sheetFormStyles.js` (estilos), `OptionSheet` (panel inferior de seleccion), `SelectField` (desplegable), `HoraField` y `SelectorHora`/`useSelectorHora` (hora y reloj nativo) y `hooks/useScrollACampo.js` (llevar un campo a la vista con el teclado). `AddActivityScreen` y `AddTrasladoScreen` las usan; un formulario nuevo de este tipo tiene que reutilizarlas. `PlaceScheduleSheet` todavia tiene su propia copia del panel
- El destino de cada dia y la separacion de un dia de traslado estan en "Ver el destino de cada dia en el itinerario (US 138)"
- Migracion de datos: las actividades `plane`/`car` que caen en un dia de traslado con el tramo libre se convierten en su traslado (la primera por hora; el nombre original pasa a notas) y el resto pasa a `location-dot`. La regla esta en `convertir_actividades` y repetida en PL/pgSQL en el script 026. El downgrade conserva la hora conocida con un minuto de duracion pero no recupera nombres, iconos ni la llegada de los traslados que llegan otro dia
- Tests: `backend/tests/test_traslados.py`, `test_migracion_traslados.py` y `test_completar_dias_libres.py`; frontend `Traslados.test.js`, `AddTrasladoScreen.test.js` y `CategoriasActividad.test.js`. SQLite no aplica FKs ni corre el SQL de Postgres: la migracion y el script se prueban tambien contra Postgres

## Ver el destino de cada dia en el itinerario (US 138)

- Si `modoRecorrido` no es `armado` (un destino, sin armar o menos noches que destinos) el itinerario no muestra nada de destinos: `clasificarDias` devuelve null
- `frontend/src/utils/destinosDias.js` es puro y deriva todo de `calcularTramos`; las fechas no se persisten. `clasificarDias` da por fecha `tipo` (`TIPOS_DIA`), `indices` (posiciones de los destinos del dia, que dan el color con `colorDeDestino`: dos en traslado, ninguno en viaje o sin destino) y `seccion`. `agregarDestinosADias` suma `infoDestino`, `separacion`, `viaje`, `franjas` y `marcaLlegada` a cada dia y arma `accesos` y `encabezados`
- Tipos de dia (`TIPOS_DIA`): normal (se cuentan noches, el dia de llegada es la noche 1), traslado sin noches en viaje (pertenece a los dos y a la seccion de salida), salida con noches en viaje (solo del origen), en viaje, llegada, ultimo, ultimo en destino (cuando quedan noches sin asignar) y sin destino
- Encabezado de cada dia en la lista: el de siempre ("Dia N · X actividades"), en cualquier viaje. Solo los dias especiales suman `ChipDia` con `chipDelDia`: traslado ("● Roma → ● París"), salida ("Hoy viajan a B"), llegada ("Llegada a B"), en viaje ("En viaje · A → B", tarjeta del dia gris con borde punteado), ultimo ("Último día"), ultimo en destino ("Último día en B") y sin destino ("Sin destino asignado", con " · Último día" si cierra el viaje). Los dias normales no llevan chip en la lista; en el calendario `chipDelDiaCalendario` les agrega "En <destino>" con el color del destino
- Lista: `AccesosDestino` (chips que desplazan al encabezado con `centerInScroll`) y `EncabezadoDestino` por seccion, sobre el fondo de la pantalla, con foto de 44 px y numero de orden; los dias sin destino tienen encabezado gris sin foto y no tienen chip de acceso. `MarcaLlegada` ("Llegás a B · 08:00") abre el dia de llegada en la lista
- Dia de traslado con traslado agendado: lo que empieza antes de la hora de salida es del destino de salida y todo lo demas, del de llegada; lo que empieza durante el viaje va primero en la zona de llegada con "Se superpone con el traslado". La regla esta en `separarActividadesDia` (frontend) y `traslados.separar_actividades_dia` (backend) y debe coincidir. `DayAgenda` recibe `separacion` y dibuja `ZonaDestino` ("hasta las 10:30"), `TarjetaViaje` y `ZonaDestino` ("desde las 16:30"): las zonas se muestran aunque esten vacias y sin "Ver N más"; dentro de la zona las actividades se unen con la misma fila de linea y chip de horas libres que un dia normal, con `LineaPunteada` en el color del destino al 35 % (el suave no se ve sobre la zona), y no hay linea entre zona y tarjeta del viaje. Sin traslado agendado no hay zonas y `TrasladoCard` avisa "Al agendarlo, las actividades se separan por destino"
- `TarjetaViaje` (lista) y `TarjetaViajeGrilla` (dentro de `DayTimeGrid`) dibujan los traslados entre destinos validos con los datos de `dia.viaje`; tocarlas abre la edicion. El dia de salida con noches en viaje usa la misma tarjeta ("Sale hoy", "Llega el lun 9"), unida con linea punteada y sin zonas. Ida, regreso, no validos y sin fecha mantienen la tarjeta de traslado. Como la tarjeta no tiene tacho, "Eliminar traslado" esta en `AddTrasladoScreen` al editar
- Calendario: `RecorridoCalendario` reemplaza chips y tira: un tramo por destino de ancho proporcional a sus noches (el del dia elegido con opacidad completa, los demas al 30 %; tocarlo elige el primer dia del destino) y la tira de dias con un punto por destino, dos en el traslado y gris en viaje o sin destino. Sin destinos el punto indica si el dia tiene actividades. Debajo, fecha larga, "Dia N · X actividades" y el chip. Se navega por la tira y los tramos, sin flechas. Mientras se arrastra una actividad, `diaObjetivoId` resalta el dia destino en la tira
- `DayTimeGrid` recibe `franjas` y `viaje`. `dia.franjas` da fondo `colorTinteDeDestino` (6 %, de borde a borde, detras de las horas) y una etiqueta flotante blanca con foto: "En <destino>" en el dia de traslado y "Llegan a B · 07:00" en el dia de llegada, que sin traslado agendado lleva solo el tinte. Con `revisarHorario` no hay franjas. El viaje va como tarjeta blanca con linea vertical degradada, hasta el final del dia si llega otro dia; si dura menos de 112 px de alto, version compacta en una linea. Los bloques de actividades conservan sus colores por tipo
- Web: la lista se ve igual en cualquier ancho y el calendario angosto, igual que en el celular. En web ancha las celdas no cambian: solo suman los tramos arriba y el chip en cada celda
- Fotos: el detalle no trae foto. `useFotosDestinos` usa `fotoDeDestino` de `utils/fotoDestino.js` (compartido con `EditTripScreen`), que hace hasta 2 llamadas a Google por destino y guarda el resultado en memoria durante la sesion; solo corre con recorrido armado. Sin foto, `FotoDestino` muestra un pin, igual que `RecorridoViaje`
- Rutas: `RutasDiarias.IdDestino` (migracion `d138a1b2c3d4`, script `027_rutas_por_destino.sql`) es NULL en un dia normal y en un dia de traslado sin noches en viaje hay hasta una fila por destino; dos indices unicos parciales reemplazan a `UQ_RutasDiarias_IdDiaCronograma`. `DiaCronograma.Rutas` es la lista y `Ruta` una propiedad con la primera. `generar_rutas_dia` calcula cada destino sin unirlos y consulta a Google antes de guardar, para no dejar rutas a medias; sin traslado agendado responde 422 (`MENSAJE_TRASLADO_SIN_AGENDAR`), un destino con menos de 2 ubicaciones se saltea y si ninguno alcanza responde 422. `generar_ruta_diaria` devuelve la primera, para el asistente. Agendar, editar o borrar el traslado sincroniza la ruta, y `update_trip` llama a `descartar_rutas_desactualizadas`, que quita sin consultar a Google las que ya no corresponden al dia
- Contrato: `Cronograma[].Rutas` con `IdDestino` y `NombreDestino`; `Ruta` se mantiene para APKs anteriores. `RutaGeneradaResponse` y los eventos `ruta_generada` y `ruta_actualizada` suman `rutas`. `DayRouteSection` es la unica seccion de ruta. En un dia normal no cambia. En un dia de traslado agendado cada destino tiene su ruta ("Ruta en B · km · min", "Ver mapa") y su selector con boton de regenerar, en su color: en la lista al pie de su zona (`renderPieZona` y prop `destino`) y en el calendario debajo de la grilla. `POST /route` acepta `idDestino` opcional, que recalcula solo esa ruta con su modo; sin `modo`, cada ruta conserva el suyo, asi que sincronizar no los iguala
- Tiempo real: `viaje_actualizado` recarga el detalle y todo se recalcula
- Tests: `backend/tests/test_itinerario_destinos.py`; frontend `DestinosDias.test.js`, `ItinerarioDestinos.test.js`, `FormularioHoja.test.js`, `routeMessages.test.js` y la seccion US 136 de `TripDetailScreen.test.js`

## Mover actividades de dia

- Contrato: `PATCH /trips/{trip_id}/days/{day_id}/activities/{activity_id}/mover` con `idDiaDestino`, `confirmarSuperposicion` y `advertenciaHorario`. Lo puede usar cualquier participante con acceso de edicion, con el viaje no finalizado. Conserva horario y datos de la actividad
- Errores con `X-Error-Code`: `TRANSFER_CANNOT_MOVE` (los traslados no se mueven), `ACTIVITY_SAME_DAY`, `DAY_NOT_FOUND`, `DAY_IN_PAST` y `ACTIVITY_BEING_EDITED`
- Se vuelven a validar los horarios del lugar para el nuevo dia. Si hay advertencia o superposicion sin confirmar no se mueve nada y se responde `requiereConfirmacion` con `mensaje`; la app pregunta y reenvia con `confirmacionDeMovimiento` de `utils/moverActividad.js`
- Al mover se borran los registros de `RecordatoriosActividadesNotificados` para que la actividad vuelva a recordarse, se emite `actividad_movida`, se sincronizan las rutas del dia de origen y del de destino y se notifica con `dispatch_trip_notification` (`CAMBIO_VIAJE`)
- Hay dos caminos: el selector de dia de `AddActivityScreen` al editar (ofrece el dia actual y los futuros con `diasParaMover`) y el arrastre en el calendario. El arrastre existe solo en `DayTimeGrid` y en `ActividadColumna` de `ItinerarioCalendarView`, no en `DayAgenda`
- Arrastre: `hooks/useArrastreDia.js` combina pulsacion larga (300 ms) y `PanResponder`, igual que `useArrastre` del recorrido. Cada paso es un dia: `PASO_ARRASTRE` (72 px) en mobile y el ancho de columna en web ancha. `etiquetaArrastre` muestra el dia destino y `diaDestinoDeArrastre` descarta los dias pasados o fuera del viaje. `onArrastreChange` bloquea el scroll de `TripDetailScreen` mientras se arrastra
- En `DayTimeGrid`, mantener apretado y soltar sin mover sigue eliminando la actividad. Los traslados y la tarjeta del viaje (US 138) no se arrastran
- Tests: `backend/tests/test_mover_actividad.py` y `frontend/src/tests/MoverActividad.test.js`

## Categorias de actividades

- Las actividades tienen 6 categorias, guardadas como icono en `ActividadesItinerario.Icono`: Hotel (`building`), Comida (`utensils`), Turismo (`camera`), Evento (`ticket`), Excursion (`person-hiking`) y Otro (`location-dot`). La lista y la deteccion por palabras viven en `frontend/src/utils/categoriasActividad.js`, compartidas por `AddActivityScreen` y `PlaceScheduleSheet`
- Vuelo y Traslado no son categorias: esos viajes se agendan como traslados (US 136). `plane` y `car` solo se usan como medio de un traslado y en categorias de gastos, checklist y documentos, que no cambian
- Las palabras de viajes ("vuelo", "aeropuerto", "taxi", "tren", "ferry", etc.) resuelven a Otro y conservan su lugar en el orden de deteccion: si se quitaran, "Vuelo a Bariloche" caeria en Comida por contener "bar"

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
- `022_suscripcion_pro_mercado_pago.sql`
- `023_notificaciones_pasarela_pagos.sql`
- `024_periodo_pagos_suscripciones.sql`
- `025_recorrido_destinos_viajes.sql`
- `026_traslados_viajes.sql`
- `027_rutas_por_destino.sql`
- `028_nombre_usuario_sin_mayusculas.sql`

## Convenciones de backend

- Las pruebas de timestamps deben comparar instantes con zona horaria y datos controlados, sin comparar su fecha UTC con `date.today()` ni depender del dia capturado al importar el modulo. La regresion de posibles gastos duplicados verifica `FechaCreacion` con instantes fijos alrededor de medianoche UTC, incluido un instante cuyo dia difiere en Argentina.
- `test_viaje_finalizado.py` captura la fecha al comenzar cada prueba y fija el reloj de `trip_access` con esa misma referencia mediante monkeypatch; los datos y las validaciones comparten el dia aunque la recoleccion o ejecucion de la suite cruce medianoche.
- FastAPI expone rutas en `backend/app/api/routes/`
- Todo campo de texto de un schema de entrada que se persiste lleva el largo maximo de su columna, asi un valor largo responde 422 y no 500 en el INSERT. Registro y perfil validan `nombre`/`apellido` (100) y `nombreUsuario` (50) con mensajes en español (`LARGOS_MAXIMOS_USUARIO` en `schemas/usuario.py`); `DestinationCreate` limita `name` (200), `country` (100), `provinceState` (150), `placeId` (255) y el rango de `lat`/`lng`. `TripCreate` exige `startDate` y `endDate` y normaliza `currency` a 3 letras mayusculas; el alta valida que la moneda exista en `Monedas` (422 "La moneda XXX no está soportada."). El fixture `master_data` siembra ARS, USD y EUR
- Los textos obligatorios se validan despues de `strip()`: el registro rechaza con 422 `nombre`, `apellido` o `nombreUsuario` de solo espacios y `TripCreate`/`TripUpdate` rechazan un `title` de solo espacios (`limpiar_titulo`, "El nombre del viaje no puede quedar vacío"); el valor se guarda sin espacios alrededor
- El nombre de usuario es unico sin distinguir mayusculas: toda comparacion usa `func.lower(Usuario.NombreUsuario)` (registro, perfil y los nombres generados para Google y Facebook) y el indice unico `UX_Usuarios_NombreUsuario_Minusculas` sobre `lower("NombreUsuario")` (migracion `e140a1b2c3d4`, script `028`) lo garantiza. La migracion no crea el indice si ya hay duplicados y deja un warning con los nombres; si choca en un registro simultaneo responde 409
- Concurrencia en endpoints `async def` (la Session es sincrona y corre en el event loop): entre un lock (`with_for_update`, `_bloquear_usuario`, `bloquear_viaje`, los `validar_*` de `limites_planes`) o una escritura y su `commit` no puede haber ningun `await`, y si la validacion falla hay que hacer rollback antes de volver al event loop. Las llamadas externas (Google, IA, Mercado Pago) se hacen antes de tocar la base o despues del commit. Si una seccion con locks tiene que correr dentro de un endpoint async, va en `app/db/concurrencia.en_hilo_con_locks` (threadpool + rollback si falla). Si el endpoint no necesita `await`, se declara `def`. Lo cubre `tests/test_concurrencia_crear_viaje.py` (simula el FOR UPDATE con un lock de Python)
- WebSockets y schedulers no consultan la base en el event loop ni retienen sesiones: los WebSocket validan con `id_usuario_ws`/`autenticar_usuario_ws` de `app/api/deps.py` (o una funcion propia) dentro de `run_in_threadpool` y con una sesion corta (`with session_module.SessionLocal() as db:`), y despues del handshake solo usan ids, nunca objetos ORM ni una sesion abierta mientras el socket vive. Los schedulers (`activity_reminders`, `resolucion_votaciones`) corren sus consultas en el threadpool y pasan datos planos al event loop para notificar; la sesion del ciclo se usa en secuencia, nunca desde los dos a la vez. Lo cubren `tests/test_sesiones_cortas.py` y los tests de hilos de `test_activity_reminders.py` y `test_resolucion_votaciones.py`
- El codigo fuera de `get_db` abre sesiones con `app.db.session.SessionLocal` referenciado por el modulo (`from app.db import session as session_module`), no con `from app.db.session import SessionLocal`: asi el fixture autouse de `tests/conftest.py` lo apunta a la base de test
- Autenticacion con una sola sesion por request: `get_current_user` y `require_admin_sistema` pasan su `db` a `decode_access_token`/`decode_backoffice_token`, y `_verificar_sesion_vigente` resuelve en una sola consulta el ultimo restablecimiento, `FechaCambioPassword` y `FechaCierreSesiones`. Sin `db` (scripts) abre una sesion corta
- Medicion temporal de rendimiento con `DIAGNOSTICO_RENDIMIENTO=true` (apagada por defecto, `app/core/diagnostico.py`): `MedicionRequestsMiddleware` (ASGI puro) loguea en `cyanea.diagnostico` metodo, plantilla de la ruta, codigo, duracion, consultas SQL del request (`sql`, `sql_ms`, `sql_max_ms`), conexiones nuevas a la base (`conexiones_nuevas`), `engine.pool.status()` y los hilos del threadpool en uso. Las consultas se cuentan con eventos del engine y un `ContextVar` por request, que llega al threadpool por la copia del contexto, asi requests en paralelo no se mezclan y lo de schedulers o WebSocket no se cuenta, y `vigilar_event_loop` avisa cuando el event loop se demora mas de 200 ms. No loguea query strings ni datos de usuarios. Es una herramienta de diagnostico: se apaga despues de medir
- El engine (`app/db/session.py`) usa `pool_pre_ping` y en PostgreSQL fija `lock_timeout` (`DB_LOCK_TIMEOUT`, 5s) y `statement_timeout` (`DB_STATEMENT_TIMEOUT`, 30s): una espera trabada falla en lugar de colgar el servidor
- El Dockerfile lee los workers de uvicorn de `WEB_CONCURRENCY` (1 por defecto). No subirlo mientras el `ConnectionManager` de WebSocket, las ediciones activas y los schedulers vivan en memoria del proceso: con mas de un worker los eventos en tiempo real no llegan a los sockets de otro worker y los schedulers corren duplicados
- Modelos ORM en `backend/app/models/`
- Schemas pydantic en `backend/app/schemas/`
- Acceso a base en `backend/app/db/`
- Servicios reutilizables en `backend/app/services/`
- El modulo de mail es compartido y debe servir para invitaciones, notificaciones futuras, recuperacion de password y casos similares
- Toda plantilla de correo nueva lleva su `.html` y su `.txt` en `backend/app/templates/emails/`. `tests/test_plantillas_correo.py` renderiza cada `template_name="..."` literal del codigo: una plantilla faltante no rompe el flujo (el envio falla y se registra warning), asi que sin ese test el correo dejaria de salir en silencio
- Las notificaciones funcionales por correo deben pasar por un servicio central `NotificationService` en `backend/app/services/notifications/`
- Los correos transaccionales de registro y bienvenida no deben bloquear la creacion de cuenta si el proveedor SMTP falla; se registra warning y el flujo principal responde correctamente
- Aunque la pantalla de perfil todavia no exista, las preferencias y el consentimiento de email se modelan desde `Usuarios` y deben viajar en `/users/me`
- La aceptacion de terminos y condiciones se persiste en `Usuarios.AceptaTerminos`, `Usuarios.FechaAceptacionTerminos` y `Usuarios.VersionTerminosAceptada`; todos los flujos de registro deben exigirla y guardar la version vigente configurada por `TERMS_VERSION`
- El texto vigente de terminos y condiciones se expone publicamente desde `GET /legal/terms` para que el frontend lo muestre antes de crear la cuenta
- Cambio de contraseña (US 101): `PUT /users/me/password` con `passwordActual`, `passwordNueva` y `confirmacion`, lógica en `backend/app/services/auth/password_change_service.py`. Solo cuentas `ProveedorAutenticacion="local"` (403 `PASSWORD_CHANGE_NOT_AVAILABLE`); la contraseña actual incorrecta responde 400 `CURRENT_PASSWORD_INVALID` (no 401, que cerraría la sesión en la app); las reglas de la nueva son las de `validar_reglas_password` (400 `PASSWORD_WEAK`), distinta de la actual (`PASSWORD_SAME_AS_CURRENT`) y igual a la confirmación (`PASSWORD_MISMATCH`)
- bcrypt solo admite hasta 72 bytes: registro, restablecimiento y cambio de contraseña rechazan con 422 una contraseña mas larga (`validar_largo_password` de `app/core/security.py`, "La contraseña no puede superar los 72 caracteres") y `verify_password` devuelve `False` sin excepcion, asi el login responde 401. Se cuentan bytes UTF-8, no caracteres
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
- las sugerencias de actividades con IA toman el destino de cada día desde el recorrido (`traslados.destinos_del_dia`): en días de traslado con hora de salida eligen el destino según la franja, en días completos en viaje no sugieren (`DAY_IN_TRANSIT`) y solo usan como referencia las actividades que quedan en ese destino; la inferencia por actividades del día o de días vecinos queda como respaldo cuando el recorrido no está armado

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
- Colores de destinos por orden del recorrido: `routeColors` y `colorDeDestino(index)` de `theme/tokens.js` (se repiten despues del cuarto); no redefinirlos por pantalla
- Estilo limpio, profesional y mobile-first
- En Expo no se usa un `styles.css` global; la identidad visual debe centralizarse en tokens compartidos y helpers de estilo
- Evitar hardcodear colores, radios o espaciados por componente si ya existe token equivalente
- Los módulos de infraestructura nativa con dependencias exclusivas de dispositivo, como SQLite offline, deben resolverse con archivos por plataforma (`*.native.js` / `*.web.js`) para no romper el bundle web
- Los contenedores con area segura deben importar `SafeAreaView` desde `react-native-safe-area-context`, no desde `react-native`, para evitar la API deprecada en Expo/React Native
- Para cerrar el teclado al tocar fuera de un campo se envuelve el contenido con `components/ui/CerrarTecladoAlTocar.js`, no con `TouchableWithoutFeedback onPress={Keyboard.dismiss}`: en web ese envoltorio recibe tambien los toques sobre el `TextInput` y le quita el foco (solo se podia escribir gracias al `autoFocus`). En Android/iOS sigue cerrando el teclado; en web no envuelve. `SearchPickerHeader` acepta `inputRef`, y el buscador de destinos de `CreateTripScreen` y `EditTripScreen` le devuelve el foco en web al agregar un destino, dentro del mismo toque para que el navegador del celular mantenga el teclado. Tests: seccion "agregar dos destinos seguidos" de `CreateTripScreen.test.js` y `EditTripScreen.test.js`
- `keyboardDismissMode` siempre con `MODO_CIERRE_TECLADO` de `utils/teclado.js` ("none" en web, "on-drag" en nativo), nunca `"on-drag"` directo: react-native-web cierra el teclado con "on-drag" ante cualquier scroll, incluido el que hace la pantalla para mostrar el campo enfocado, y el teclado se abria y se cerraba al primer toque. `tests/teclado.test.js` falla si una pantalla o componente vuelve a usar `"on-drag"` literal
- Modales en la web: react-native-web monta cada `Modal` en un `div` de `<body>`, fuera de `#root`, con `position: fixed` a pantalla completa, asi que no se achicaba con el teclado y la hoja quedaba detras. `instalarAjusteViewport` (`utils/viewportWeb.js`) aplica al portal de cada elemento con `aria-modal="true"` (hijo directo de `<body>`, nunca `#root`) `position`, `left`, `right`, `top`, `height` del area visible y `transform: translateZ(0)` (los `fixed` internos se ubican respecto del portal), solo mientras el teclado esta abierto. Al cerrarlo restaura los valores inline originales (vacios): sin teclado, en la compu y en Android/iOS los modales quedan igual. En `focusin` solo ajusta portales y solo con el teclado abierto, sin tocar `#root`. Tests: `viewportWeb.test.js`
- Para llevar el campo enfocado por encima del teclado se usa `hooks/useScrollAlCampo.js` (`ref` y `scrollProps` en el `ScrollView`, `registrar(key, contenedor)` en la View del campo, `registrarContenedor(clave, padre)` para las Views que lo envuelven, `registrarBase` como contenedor por defecto y `enfocar(key)` en `onFocus`). Desplaza solo lo necesario. Con `useScrollAlCampo({ soloWeb: true })` o `enfocar(key, { soloWeb: true })` no hace nada fuera de la web (con la opcion del hook ni siquiera agrega props). Lo usan `CreateTripScreen` y `AddGastoScreen` en todas las plataformas (con el mismo calculo que tenian sus copias locales) y, solo en web, `LoginScreen`, `DocumentsScreen` (nombre del documento) y el buscador de participantes del paso 3 de `CreateTripScreen`. En web `onLayout` usa `ResizeObserver` y solo avisa cuando el campo cambia de tamano, no cuando se mueve: si lo que esta arriba del campo cambia despues de montarse, la posicion guardada queda vieja. Para esos campos se agrega `ref={registrarNodo(key)}` (con `collapsable={false}`) y el hook mide la posicion real al enfocar con `measureLayout` respecto del contenido del `ScrollView`, con `onLayout` como respaldo si la medicion falla. Lo usa el nombre de Subir documento (la barra de espacio llega despues y la tarjeta del archivo reemplaza a "Seleccionar archivo"). No confundir con `hooks/useScrollACampo.js`, que en las hojas de actividad y traslado lleva el campo a 80 px del borde superior. Tests: `useScrollAlCampo.test.js`
- Teclado en Safari del iPhone sin saltos bruscos (solo web): al cerrar el teclado Safari informa alturas intermedias, asi que `instalarAjusteViewport` aplica enseguida solo cuando el area visible se achica o se desplaza (se abre el teclado) y, cuando crece o pasa a "sin teclado", espera a que quede quieta con `esperarViewportQuieto` (dos lecturas iguales cada 80 ms, hasta 600 ms) y reacomoda una sola vez. Los eventos de un mismo cuadro se juntan con `requestAnimationFrame`, y al salir de un campo se usa la misma espera (reemplaza a los reajustes a 60/250/600 ms). `<body>` tiene el fondo de la app (`colors.background`) para que no se vea una franja blanca mientras cambia el tamaño. `useScrollAlCampo` en web no repite un `scrollTo` al mismo destino (menos de 4 px) y no tiene el intento de los 120 ms. Lo que se oculta con el teclado abierto para ganar lugar usa `ocultarConTeclado(tecladoVisible)` de `utils/teclado.js`, que en web nunca oculta: la barra de pasos de `CreateTripScreen` queda siempre visible en web. Tests: `viewportWeb.test.js`, `useScrollAlCampo.test.js` y `teclado.test.js`
- Campos que no son datos personales (nombre del documento, concepto del gasto, nombre y descripcion de la actividad, notas del traslado, nombre y propuestas de la votacion, titulo y descripcion del viaje y titulo de la tarea) llevan `{...SIN_AUTORRELLENO}` de `utils/teclado.js`: en web `autoComplete="off"` para que Safari no ofrezca "Autorrellenar contacto" (a veces lo ignora); en Android/iOS no agrega nada, porque ahi apagaria el autorrelleno del sistema. Correo y contraseña del login no lo llevan. La barra de Safari sobre el teclado (flechas, "Listo") no se puede quitar desde la pagina. Tests: `autoCompleteCampos.test.js` y `teclado.test.js`
- Invitar participante desde Grupo (`TripDetailScreen`): en la web, al enfocar el buscador (`ParticipantSearch` acepta `onFocus` y `onLayoutCampo`) se centra `invitePanelRef` con `centerInScroll`, porque `keyboardInset` depende de eventos de `Keyboard` que en web no existen. En `CreateVotationScreen`, en web, la propuesta que se agrega con "Agregar" se lleva a la vista cuando se dibuja. En Android/iOS nada de esto cambia
- Los montos (o textos cortos) que tienen que verse enteros en una linea usan `components/ui/TextoAjustable.js`, no `Text` con `adjustsFontSizeToFit`: ese prop no existe en react-native-web y el texto se corta. En Android/iOS es el mismo `Text` con `adjustsFontSizeToFit`; en web mide el ancho, achica la letra (hasta `minimumFontScale`, 0,7 si no se indica) y, si ni asi entra, muestra `textoCompacto` (`formatMoneyCompacto` de `utils/money.js`, p. ej. "$ 12,3 M") con el monto completo como `accessibilityLabel`. Lo usan `ExpenseSummaryCard` ("Gastos del grupo", "Tu gasto", "Por saldar") y la tarjeta "Gastos del grupo" del Resumen de `TripDetailScreen`. Todavia con `adjustsFontSizeToFit` directo: `MetricCard` y `PaymentHistoryScreen`. Tests: `TextoAjustable.test.js`, `money.test.js` y `ExpenseSummaryCard.test.js`
- En `TripDetailScreen` cada tarjeta con buscador o categorias tiene su propia ref para `centerInScroll`: `gastosCardRef` (solo Gastos), `documentosCardRef`, `informacionCardRef` y `checklistsCardRef`. Si dos tarjetas comparten una ref, gana la ultima en montarse y al enfocar el buscador de la primera la pantalla salta a la otra. `ChecklistsByCategory` recibe `scrollRef` y `cardRef` como `DocumentosPorCategoria`, `InformacionRelevantePorTipo` y `ExpenseList`, asi abrir una categoria y enfocar el buscador desplazan igual que en Gastos y Documentos (en todas las plataformas). Tests: seccion "buscadores y categorias" de `TripDetailScreen.test.js`
- La barra inferior de `MainTabs` es `components/navigation/FloatingTabBar.js`: una pildora flotante de alto `ALTO_BARRA_TABS` (68) y hasta 480 px de ancho, separada del borde por `Math.max(insets.bottom, spacing.sm)` para quedar por encima de la navegacion del sistema (gestos o tres botones). Lo que flota sobre un tab, como el FAB de `HomeScreen`, se ubica con `useEspacioBarraTabs()`. Dentro de los tabs `ScreenContainer` no aplica el area segura inferior (`BottomTabBarHeightContext`), salvo que reciba `edges`. No reemplazar estos valores por medidas fijas ni agregar otro padding inferior global que duplique el area segura. Tests: `frontend/src/tests/FloatingTabBar.test.js`
- La interfaz activa toma como referencia una app de viajes mobile-first con header azul profundo, superficies marfil y tarjetas con imagen protagonista
- Usar serif editorial para wordmark de marca, titulos grandes de pantalla, nombres de viajes y valores KPI
- Usar sans para labels, formularios, navegacion, metadata, tabs y acciones
- Los avatares del grupo deben mostrarse en formato circular, con borde claro y posibilidad de stack solapado
- Los CTAs primarios usan fondo azul y texto blanco; el manteca se reserva para acentos, badges, FABs y highlights
- Login y registro comparten shell visual con cabecera azul, superficie marfil y selector segmentado `Iniciar sesion / Crear cuenta`
- En el login, Enter en el correo pasa a la contraseña y Enter en la contraseña envia el formulario; el mensaje de error se borra al editar cualquiera de los dos campos
- El buscador de destinos (`DestinationPickerModal`) solo muestra sus propios errores (`errorAgregarDestino`, p. ej. "No se pudo agregar ese destino"), nunca la validacion del paso ("al menos un destino"), en crear y en editar viaje
- En la portada del alta de viaje queda marcada una sola opcion (`opcionPortada`): con el generador de IA abierto, "Con IA" reemplaza a la actual. Mientras se crea, el boton muestra "Creando viaje…" y, si hay portada propia, "Subiendo portada…" (`PrimaryButton` acepta `loadingLabel` para mostrar texto junto al indicador)
- La home base usa saludo superior, KPI cards, cards de viaje con imagen, badge de estado, fecha, avatares y progreso, mas un FAB para crear viaje
- `HomeScreen` distingue cargando (`home-cargando`), error (`home-error`, con "Reintentar" `home-reintentar`) y vacio (`home-vacio`): si `getTrips` falla reintenta una vez y, si vuelve a fallar, muestra el error en lugar de "Todavía no hay viajes cargados"; los KPI muestran "—" hasta que la carga termina. Si ya habia viajes cargados, un error al refrescar los conserva. El saludo usa `/users/me` y, si falla, el usuario de `AuthContext`. Tests: `frontend/src/tests/HomeScreen.test.js`
- `DayAgenda` muestra tarjetas a todo el ancho, sin rail: entre una y otra va un tramo de `components/ui/LineaPunteada.js` alineado con el centro del icono (la misma linea que une los destinos en `RecorridoViaje`), con el chip de horas libres (fondo amarillo, sin borde) encima. En un dia de traslado con zonas la linea va dentro de cada zona, en el color del destino al 35 %. La actividad en curso lleva borde `primary`, fondo suave, icono relleno y etiqueta "EN CURSO"; la siguiente, solo borde `primary`
- El detalle de viaje usa hero con imagen, acciones circulares flotantes, stack de avatares, tabs secundarios visuales y cards de agenda por dia
- Todo encabezado azul simple (flecha + titulo, con subtitulo o accion a la derecha opcionales) usa `components/ui/ScreenHeader.js`; no dibujar encabezados azules propios por pantalla. Estilo: fondo `colors.primary`, radio inferior 24, `paddingTop: spacing.lg`, `paddingBottom: spacing.md`, flecha y titulo en la misma fila, titulo centrado `textStyles.tripTitle` a 20 px que baja a una segunda linea si no entra (nunca se corta con puntos suspensivos) y subtitulo chico centrado debajo
- Excepciones con contenido propio dentro del recuadro azul, alineadas en radio, tamano de titulo y margenes: `CreateTripScreen` (stepper), `SearchPickerHeader` (buscador; radio 24, titulo 20 px) y el hero con portada de `TripDetailScreen` (radio 24)
- `ListRow` admite `destructive` (titulo e icono en `danger`) y `disabled`; las acciones secundarias de una pantalla se presentan como filas de `ListRow` dentro de una `SectionCard`, con un solo `PrimaryButton` destacado a la vez
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

#### Invitacion por correo electronico (US 134)

- `POST /trips/{trip_id}/participants` con `email`: solo el administrador y solo en viajes `activo` no finalizados (409 `TRIP_NOT_ACTIVE` o `TRIP_FINISHED`). El formato se valida con `normalizar_email` de `schemas/trip.py` (422)
- Si el correo es de una cuenta registrada, se trata igual que la invitacion por `userId` (US 09): participacion `invitado` y aviso `NotificationType.INVITACION_VIAJE` (tipo interno `invitacion_viaje`, preferencia "cambios del viaje"). La invitacion por `userId` tambien notifica
- Si no hay cuenta, `services/invitaciones_correo.py` crea o reutiliza la fila de `InvitacionesViajes` (unica por viaje y correo): las vencidas o canceladas se renuevan con token y vencimiento nuevos (7 dias); una pendiente vigente responde 409 `INVITATION_ALREADY_PENDING`
- El envio del correo forma parte de la operacion: si falla, se hace rollback y se responde 502 `INVITATION_EMAIL_FAILED` para poder reintentar. `MAIL_ENABLED=false` no cuenta como falla. La ruta recibe `MailService` por `Depends(get_mail_service)` para poder reemplazarlo en tests
- Limite `EMAIL_INVITATIONS_DAILY_LIMIT` (20) de invitaciones a correos sin cuenta por viaje y por dia calendario de Argentina, contado sobre `InvitacionesViajes.FechaInvitacion`; al superarlo responde 429 `EMAIL_INVITATION_LIMIT_REACHED`. Tambien se valida al crear el viaje
- `GET /trips/{trip_id}/invitations/sent` suma las invitaciones por correo sin cuenta asociada (`tipo="correo"`, `email`, estado `pendiente` o `vencida`); al registrarse se muestran como participacion del usuario. En la app se cancelan con `DELETE /external-invitations`. Una invitacion pendiente vencida por fecha no figura en `invitedEmails` del detalle, asi el administrador puede volver a invitar ese correo
- El enlace del correo es `{MAIL_FRONTEND_BASE_URL}/registro?email=<correo>&invitacion=1` (`InvitationEmailSender`). La ruta `Register` esta mapeada como `registro` en el `linking` de `App.js` y `RegisterScreen` precarga el correo (`route.params.email`) y muestra un aviso si llega `invitacion=1`. El token de `InvitacionesViajes` no viaja en el enlace: la invitacion se vincula por correo al crear la cuenta. Para que el enlace abra la app en produccion, el dominio de `MAIL_FRONTEND_BASE_URL` tiene que estar en los `prefixes` del `linking`
- Al registrarse por cualquier metodo (correo, Google o Facebook) o al iniciar sesion, `vincular_invitaciones_externas` convierte las invitaciones pendientes del correo en participaciones `invitado`
- Tests: `backend/tests/test_invitar_por_correo.py`, `frontend/src/tests/SentInvitationsList.test.js` y `frontend/src/tests/RegisterScreenInvitacion.test.js`

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

### Registro de auditoria (US 132)

- Consulta exclusiva del router protegido por `require_admin_sistema`: `GET /backoffice/auditoria?desde&hasta&tipo&idAdministrador&pagina`, `GET /backoffice/auditoria/opciones` y `GET /backoffice/auditoria/{id_evento}`. Todas responden `Cache-Control: no-store`; no existen operaciones de alta, edicion ni eliminacion de auditorias por API.
- `services/backoffice/auditoria_service.py` unifica con UNION ALL las auditorias existentes de accesos, suspensiones/reactivaciones, publicaciones de terminos y cambios de planes. No duplica datos ni necesita migraciones. Los ids publicos son `acceso:N`, `suspension:N`, `terminos:N` y `plan:N`; el orden global es fecha descendente, origen e id descendentes para desempatar, con conteo y paginacion SQL de 20 filas.
- Fechas inclusivas en hora Argentina (UTC-3); por defecto hoy y los seis dias anteriores. Si solo se informa hasta, desde toma los seis dias anteriores a esa fecha; si solo se informa desde, hasta es hoy. Fechas o filtros invalidos responden 422, detalle inexistente 404. Tipos: `inicio_sesion`, `suspension_usuario`, `reactivacion_usuario`, `publicacion_terminos`, `cambio_plan`.
- Los cambios de configuracion devuelven solamente campos reconocidos de planes con sus valores numericos anterior/nuevo. Los accesos conservan el resultado registrado; las otras fuentes contienen acciones confirmadas exitosas, no se inventan intentos fallidos historicos. Cada campo modificado de un plan constituye un evento, igual que en su fuente original.
- Las identidades se resuelven desde Usuarios; con FechaBaja se presenta Usuario anonimizado y sin email aunque existan datos anteriores en las auditorias. No se exponen email historico del acceso, user agent, IP, motivos de texto libre, cuerpos de terminos, contraseñas, tokens ni contenido de viajes. Un acceso sin vinculo a usuario se muestra como Usuario no identificado. Los nuevos intentos durante un bloqueo conservan IdUsuario cuando existe la cuenta, para filtrarlos por administrador; no se altera el control de intentos ni se reconstruyen vinculos historicos desconocidos.
- Acceso desde Inicio > Registro de auditoria, vista `auditoria` de `BackofficeApp`, pantalla `BackofficeAuditoriaScreen`. Usa `backofficeApi.js`, componentes y tokens existentes; permite filtrar, buscar un administrador, abrir detalle, volver conservando filtros/pagina y restablecer los ultimos siete dias. Las fechas aplicadas proceden de la respuesta del servidor. Sin resultados muestra un mensaje, con errores ofrece reintento y descarta respuestas anteriores al cambiar filtros.
- Pruebas: `backend/tests/test_backoffice_auditoria.py` cubre CP1-CP10, fuentes reales, bloqueo, anonimización, cortes de dia, filtros combinados y paginacion global; frontend `backoffice/BackofficeAuditoriaScreen.test.js`, `BackofficeApp.test.js`, `BackofficeHomeScreen.test.js` y `backofficeApi.test.js` cubren consulta, filtros, detalle, errores, navegacion y contrato HTTP.

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
- El regreso automatico al plan gratuito, avisos de vencimiento y cambios diferidos de limites de IA quedan fuera de la US 113; se implementaron en la US 121 (ver "Volver al plan gratuito al finalizar la suscripcion").

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
- Todas las pantallas del backoffice usan `components/backoffice/EncabezadoBackoffice.js` (props `titulo`, `bajada`, `onVolver`, `etiquetaVolver`, `volverDeshabilitado`, `accion`) y, para un boton volver suelto, su export `BotonVolverBackoffice` (testID `backoffice-volver`). No dibujar encabezados ni botones de volver propios por pantalla
- Metricas (`/backoffice/metricas`): la evolucion se agrupa por dia hasta 31 dias, por semana (lunes) hasta 366 y por mes despues; con el rango maximo de un ano la agrupacion mensual no se alcanza. Los puntos de periodos incompletos llevan `parcial=true` y se dibujan atenuados, y las tendencias los excluyen (`utils/tendencias.js`). `suscripcionesProActivas` cuenta usuarios con `IdPlan = PLAN_PRO` e `ingresos` suma `PagosSuscripciones.MontoARS` aprobados del rango. La estacionalidad (`MapaEstacional`) excluye viajes eliminados o cancelados y promedia solo meses completos


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


### Limite de intentos de inicio de sesion

- `POST /auth/login` cuenta los intentos fallidos (401) por IP + email (sin mayusculas ni espacios) en una ventana de 5 minutos; al llegar a 10 responde 429 con `Retry-After`, `X-Error-Code: LOGIN_RATE_LIMITED` y un mensaje en español, aunque la contraseña sea correcta. Un login exitoso reinicia el contador
- La cuenta vive en memoria del proceso (`services/auth/limite_intentos_login.py`): alcanza con un worker; con varios, cada uno cuenta por separado. El fixture `client` la reinicia en cada test. Tests: `backend/tests/test_limite_intentos_login.py`

### Reenvio de confirmacion de cuenta

- `POST /auth/resend-confirmation` es publico y recibe `email` normalizado; responde un mensaje generico para cuentas inexistentes, confirmadas, sociales o inactivas. Solo envia a cuentas locales activas, sin baja y con email pendiente.
- Registro y reenvio comparten `backend/app/services/auth/email_confirmation_service.py` y las plantillas `confirm_email`; los fallos u omisiones del proveedor se registran sin revertir el alta ni revelar la existencia de la cuenta en el reenvio.
- Cada enlace JWT tiene 24 horas de vigencia; reenviar no invalida enlaces anteriores. Confirmar nuevamente con un enlace valido es idempotente.
- `SolicitudesConfirmacionEmail` (migracion `e1710c0f1a01`, sobre `a1060d4b5c7e`) registra hash de email, IP y fecha para todos los intentos admitidos: espera de 60 segundos por email y maximo 5 por hora por email o IP. PostgreSQL serializa la validacion y registro con advisory locks transaccionales para evitar saltarse limites con solicitudes concurrentes.
- Los limites devuelven 429 y `Retry-After`; CORS expone ese header. El login devuelve `X-Error-Code: EMAIL_CONFIRMATION_REQUIRED` solo tras verificar la password de una cuenta activa pendiente.
- El reenvio se ofrece tras el registro, desde el login bloqueado por confirmacion y desde un enlace invalido/vencido. `ResendConfirmationForm` comparte validacion, progreso, resultado y espera; `ResendConfirmationScreen` permite ingresar el email cuando se abre desde un enlace vencido. Nunca indicar volver a registrarse por un enlace vencido.
