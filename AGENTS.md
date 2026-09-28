# AGENTS.md

Guia operativa de Cyanea para colaboradores humanos y agentes como Codex.

Si trabajas con Codex, pide primero que lea este archivo completo antes de proponer o implementar cambios.

Regla permanente:

- Toda nueva definicion tecnica, convencion, criterio de implementacion, decision de arquitectura o cambio de estructura del proyecto debe actualizarse en este `AGENTS.md` dentro del mismo trabajo.

## Objetivo del proyecto

Cyanea es una aplicacion para organizacion colaborativa de viajes grupales.

Alcance actual del MVP:

- creacion de viajes
- incorporacion de participantes registrados
- invitaciones externas por correo
- estructura base para viajes, usuarios, participaciones e invitaciones
- frontend unico con Expo para mobile y web
- backend FastAPI
- persistencia en PostgreSQL

Fuera de alcance por ahora:

- autenticacion real
- pagos reales
- venta de pasajes o reservas
- integraciones externas complejas

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
- no crear carpetas paralelas tipo `frontend-mobile/`, `frontend-web/` o similares
- no continuar nuevas funcionalidades en `frontend-ant/`
- el backend activo es solo `backend/` con FastAPI
- no reintroducir restos de backend Node/Express

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

- si el repositorio esta dentro de OneDrive y Gradle falla con `AccessDeniedException` sobre `frontend/android/app/build`, ejecutar la build con `CYANEA_ANDROID_BUILD_ROOT` apuntando a una carpeta local fuera de OneDrive, por ejemplo `$env:TEMP\cyanea-android-build`
- `frontend/android/build.gradle` solo redirige el `buildDir` del modulo `:app` cuando esa variable esta definida; el root Android y los modulos de dependencias conservan su `buildDir` para no romper autolinking ni React Native Codegen
- si la development build Android abre Metro pero falla con `Compiling JS failed` sobre `transform.bytecode=1`, levantar Expo con `CYANEA_DISABLE_HERMES_BYTECODE=1`; `frontend/metro.config.js` conserva Hermes y solo quita `transform.bytecode` de las URLs servidas por Metro en desarrollo

Notas del frontend Expo:

- `npm run web` levanta el frontend en `http://localhost:8081`
- los scripts ya incluyen `EXPO_NO_METRO_WORKSPACE_ROOT=1`
- mantener `react` y `react-dom` exactamente en la misma version
- el proyecto EAS activo del frontend es `@lcorrea87s-team/cyanea` con `extra.eas.projectId=0dddd612-ef66-4470-9a77-ce206f823efd`; `frontend/eas.json` define perfiles `development` y `production`

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

- nombre en espanol
- nombre en plural
- ejemplos:
  - `Usuarios`
  - `Viajes`
  - `ParticipantesViajes`
  - `EstadosViajes`

### Columnas

- nombre en espanol
- formato camelCase con inicial mayuscula en persistencia actual del proyecto
- ejemplos:
  - `IdViaje`
  - `IdUsuario`
  - `FechaCreacion`
  - `NombreUsuario`

### Normalizacion

- mantener estructura normalizada
- no persistir estados o roles funcionales como texto libre si existe tabla maestra
- relaciones por ids a tablas maestras cuando corresponda

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

- el balance neto de cada participante se calcula siempre desde `Gastos` y `ParticipantesGastos`
- no persistir balances derivados por participante
- la persistencia se hace por version de liquidacion en:
  - `LiquidacionesViajes`
  - `TransferenciasLiquidaciones`
  - `EstadosTransferenciasLiquidaciones`
- una liquidacion representa un plan ejecutable de transferencias para un viaje en un momento dado
- cuando cambian los gastos del viaje se invalida la liquidacion activa anterior y se genera una nueva version
- marcar una transferencia como realizada solo cambia su estado dentro de la liquidacion activa; no modifica los gastos base
- la UI de esta HU se muestra dentro del tab `Gastos` del detalle del viaje, no en una pantalla paralela
- el contrato `GET /trips/{trip_id}/settlement` concentra el resumen financiero del viaje para la solapa `Gastos`, incluyendo total gastado del viaje, gasto individual asignado por participante, total pagado por participante y saldo neto/pendiente

## Integraciones externas

- ninguna integracion externa no esencial debe impedir los flujos base del dominio
- si falla la resolucion automatica de portada, lugares o metadata externa, el viaje debe poder crearse o actualizarse igual, degradando funcionalidad en forma controlada y registrando warning

## Convenciones de scripts SQL

- carpeta base: `backend/scripts/sql/`
- un script por tabla o estructura principal
- prefijo numerico para ordenar ejecucion
- incluir script agregador `run_all.sql`
- los scripts deben ser idempotentes cuando sea razonable

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
- modelos ORM en `backend/app/models/`
- schemas pydantic en `backend/app/schemas/`
- acceso a base en `backend/app/db/`
- servicios reutilizables en `backend/app/services/`
- el modulo de mail es compartido y debe servir para invitaciones, notificaciones futuras, recuperacion de password y casos similares
- las notificaciones funcionales por correo deben pasar por un servicio central `NotificationService` en `backend/app/services/notifications/`
- aunque la pantalla de perfil todavia no exista, las preferencias y el consentimiento de email se modelan desde `Usuarios` y deben viajar en `/users/me`
- la foto de perfil del usuario se almacena en Supabase Storage dentro del bucket configurado, bajo el prefijo `profile-photos/`, y la URL resultante se persiste en `Usuarios.FotoUrl`
- la busqueda de destinos para alta y edicion de viaje se resuelve desde backend contra Google Places y se configura con `GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAPS_API_KEY` es una credencial server-side del backend para Google Places/Directions; no debe reutilizar una key restringida a Android o a referrers web, porque Google bloquea esas llamadas desde FastAPI
- la portada visual del viaje se resuelve desde Google Places usando el primer destino seleccionado como referencia
- el backend persiste `Viajes.GooglePlaceIdPortada` y expone la imagen por proxy propio para no exponer la API key de Google en el frontend
- la exploracion de lugares de interes del viaje usa Google Places para busqueda y Google Maps JavaScript en web para visualizacion interactiva
- en mobile nativo Expo, la fase 1 de parity usa `react-native-maps` en `frontend/src/components/map/MapCanvas.native.js`; la logica de busqueda, detalle y recomendados sigue centralizada en backend
- en mobile nativo Expo, la fase 2 de parity habilita seleccion de POIs desde el mapa nativo con `onPoiClick` y presenta recomendados en formato bottom-sheet en lugar de panel lateral
- el ranking de atracciones populares en exploracion se calcula dinamicamente desde Google Places segun el centro visible del mapa
- el ranking de atracciones populares en exploracion debe presentarse en un panel lateral o modal dedicado, no intercalado en el flujo principal de seleccion y guardado de lugares
- los componentes del feature de mapa viven en `frontend/src/components/map/`
- la HU 23 de visualizacion de recorridos se considera cerrada cuando:
  - la ruta generada puede abrirse en un mapa interactivo desde el dia correspondiente del itinerario
  - si no existe una ruta generada para ese dia, no debe mostrarse el mapa ni el CTA de visualizacion
  - en ausencia de ruta, la UI debe mostrar un mensaje informativo explicito indicando que todavia no hay un recorrido disponible y, cuando corresponda, que primero se debe generar la ruta o completar actividades con ubicacion
- el flujo vigente del feature es:
  - buscar lugar con Google Places
  - al seleccionar un lugar, consultar Place Details para cargar rating y reseñas on-demand
  - guardar lugar en el viaje
  - visualizarlo en mapa junto a destinos base
  - sugerir atracciones populares segun la ciudad o zona actualmente visible
  - agendarlo en un `DiaCronograma`
  - crear una `ActividadItinerario` vinculada a `IdLugarInteresViaje`

### Convenciones de notificaciones

- el consentimiento general de notificaciones por email se persiste en `Usuarios.ConsienteNotificacionesEmail`
- el consentimiento general de notificaciones push se persiste en `Usuarios.ConsienteNotificacionesPush`
- las preferencias iniciales por tipo tambien se persisten en `Usuarios`
- flags actuales:
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
- el backend no debe enviar notificaciones funcionales si el usuario no esta activo, no confirmo email, no otorgo consentimiento o desactivo el tipo correspondiente
- en Expo Go para Android no se inicializa `expo-notifications` para push remotas, porque Expo Go no soporta esa funcionalidad desde SDK 53; las pruebas reales de token push requieren una development build o app nativa instalada
- en Android, la development build para push remotas requiere Firebase/FCM configurado con `google-services.json` correspondiente al package `com.ticigaticasteam.cyanea`, referenciado desde `expo.android.googleServicesFile`, y una recompilacion nativa; sin ese archivo `expo-notifications` no puede obtener el token Expo Push
- `frontend/app.json` espera `frontend/google-services.json` para builds Android con push; ese archivo y `GoogleService-Info.plist` no se versionan, usar `frontend/google-services.example.json` solo como referencia de ubicacion/forma
- el proyecto nativo Android aplica `com.google.gms.google-services` con classpath `com.google.gms:google-services:4.5.0`; al recompilar localmente copiar `frontend/google-services.json` a `frontend/android/app/google-services.json`
- las credenciales FCM V1 de Expo/EAS estan asignadas en `@lcorrea87s-team/cyanea` para `com.ticigaticasteam.cyanea`, usando la service account de Firebase `cyanea-8aba1`; si cambia el `projectId` de EAS hay que regenerar el Expo Push Token en el dispositivo y actualizar `TokensPushUsuarios`
- para pruebas locales de push en development build Android, si Metro/Hermes falla al cargar el bundle con bytecode, usar `CYANEA_DISABLE_HERMES_BYTECODE=1` al levantar Expo; no reemplaza la prueba posterior de una build productiva
- los tokens push de Expo se persisten en `TokensPushUsuarios`; el frontend solo debe registrarlos despues de obtener permiso explicito del sistema y el backend debe desactivarlos si el usuario revoca `ConsienteNotificacionesPush`
- los links incluidos en correos de notificacion deben resolverse desde `MAIL_FRONTEND_BASE_URL`
- las notificaciones push funcionales se despachan desde el backend mediante el dispatcher central `dispatch_trip_notification`; los endpoints de dominio solo deben construir el evento y no llamar directamente a Expo
- el despacho push usa Expo Push API (`EXPO_PUSH_URL`) en lotes de hasta 100 mensajes; `EXPO_PUSH_ACCESS_TOKEN` es opcional y `PUSH_ENABLED=false` desactiva el envio externo sin desactivar las notificaciones internas
- los eventos de viaje deben registrar siempre notificacion interna en `Notificaciones`; el envio push es complementario, respeta consentimiento, usuario activo, email confirmado, preferencias por tipo y tokens activos
- si Expo devuelve `DeviceNotRegistered`, el token en `TokensPushUsuarios` se desactiva con `FechaBaja`; otros errores de push se registran como warning/error y no bloquean la operacion principal del dominio
- los gastos nuevos usan `NotificationType.NUEVO_GASTO`; los recordatorios de deuda/liquidacion usan `NotificationType.RECORDATORIO_DEUDA` y se configuran por separado
- los recordatorios de inicio de actividades usan `NotificationType.RECORDATORIO_ACTIVIDAD`; el scheduler de FastAPI escanea actividades proximas segun `ACTIVITY_REMINDER_MINUTES_BEFORE` y registra envios en `RecordatoriosActividadesNotificados` para no duplicar avisos
- la respuesta a una push en mobile se resuelve desde `frontend/src/services/notificationNavigation.js`; el payload debe incluir `tripId` y, si corresponde, `eventType`, `activityId`, `expenseId` o `votingId` para abrir `TripDetail` en la solapa adecuada

### Checklist de incorporacion push/FCM

Para retomar o replicar la configuracion de push Android:

- subir al repo `frontend/eas.json`, los cambios de `frontend/app.json`, `frontend/google-services.example.json`, `.gitignore`, `frontend/.gitignore`, migraciones/modelos/servicios de notificaciones y `backend/.env.example`
- no subir `frontend/google-services.json`, `GoogleService-Info.plist`, service account JSON de Firebase, `.env`, `frontend/android/`, `cyfb/`, caches ni logs
- cada integrante que compile Android debe obtener su `frontend/google-services.json` desde Firebase para el package `com.ticigaticasteam.cyanea`
- las credenciales FCM V1 se administran desde EAS con `npx eas-cli credentials -p android`; usar `NODE_OPTIONS=--use-system-ca` si la red local agrega certificados self-signed
- el proyecto EAS activo es `@lcorrea87s-team/cyanea`; verificar con `npx eas-cli project:info`
- despues de cambiar `extra.eas.projectId` o credenciales FCM, regenerar el Expo Push Token en cada dispositivo: desactivar y activar push en la app, o reinstalar si no se renueva
- para Android emulador, `frontend/.env` debe apuntar al backend con `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api/v1`; para web local usar `http://127.0.0.1:8000/api/v1`
- verificar en base que `TokensPushUsuarios` tenga solo tokens activos vigentes y que los tokens anteriores queden con `Activo=false` y `FechaBaja`
- probar punta a punta creando una notificacion de viaje con `dispatch_trip_notification`; Expo debe responder ticket `status=ok`
- si Expo responde `InvalidCredentials`, revisar que el token se haya emitido con el `projectId` EAS actual y que FCM V1 este asignado al package correcto

## Convenciones de frontend

### Regla estructural

- el frontend activo vive en `frontend/`
- no crear variantes paralelas del mismo frontend
- la navegacion principal vive en `frontend/src/navigation/`
- las pantallas completas viven en `frontend/src/screens/`
- los componentes reutilizables viven en `frontend/src/components/`
- el acceso HTTP vive en `frontend/src/services/api.js`
- los tokens de diseno viven en `frontend/src/theme/tokens.js`
- antes de crear estilos nuevos para una pantalla, revisar si el patron ya puede resolverse con componentes base como `PrimaryButton`, `Avatar`, `AvatarStack`, `IconCircleButton`, `MetricCard`, `AuthSwitch` o `StatusPill`

### Estilo e identidad visual

- color primario: `#1e3e7b`
- color acento: `#ffec80`
- estilo limpio, profesional y mobile-first
- en Expo no se usa un `styles.css` global; la identidad visual debe centralizarse en tokens compartidos y helpers de estilo
- evitar hardcodear colores, radios o espaciados por componente si ya existe token equivalente
- los módulos de infraestructura nativa con dependencias exclusivas de dispositivo, como SQLite offline, deben resolverse con archivos por plataforma (`*.native.js` / `*.web.js`) para no romper el bundle web
- la interfaz activa toma como referencia una app de viajes mobile-first con header azul profundo, superficies marfil y tarjetas con imagen protagonista
- usar serif editorial para wordmark de marca, titulos grandes de pantalla, nombres de viajes y valores KPI
- usar sans para labels, formularios, navegacion, metadata, tabs y acciones
- los avatares del grupo deben mostrarse en formato circular, con borde claro y posibilidad de stack solapado
- los CTAs primarios usan fondo azul y texto blanco; el manteca se reserva para acentos, badges, FABs y highlights
- login y registro comparten shell visual con cabecera azul, superficie marfil y selector segmentado `Iniciar sesion / Crear cuenta`
- la home base usa saludo superior, KPI cards, cards de viaje con imagen, badge de estado, fecha, avatares y progreso, mas un FAB para crear viaje
- el detalle de viaje usa hero con imagen, acciones circulares flotantes, stack de avatares, tabs secundarios visuales y cards de agenda por dia
- las estadisticas de viajes del perfil solo consideran viajes cuya fecha de inicio ya llego; los años futuros no se muestran como filtros

### Responsive

- el frontend nuevo se construye con enfoque mobile-first
- debe funcionar en mobile y web
- en pantallas amplias, el layout debe aprovechar ancho sin estirarse en exceso
- usar hooks o helpers responsive compartidos, no condicionales dispersos por toda la app

### Navegacion

- usar React Navigation para la navegacion principal del frontend Expo
- no reintroducir `react-router-dom` en el frontend activo

### Componentes del dominio viaje

El flujo minimo actual incluye:

- home de viajes
- alta de viaje
- buscador predictivo de participantes registrados
- invitacion externa por correo desde el mismo flujo
- lista unica de participantes agregados, distinguiendo registrados vs invitados pendientes

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

- listado de viajes
- alta de viaje
- listado de usuarios
- el usuario actual se resuelve desde la autenticación vigente; no documentar ni asumir usuarios hardcodeados
- invitaciones externas persistidas y preparadas para envio de mail

Frontend activo:

- home en Expo
- tabs base del producto
- pantalla de perfil con lectura y edicion de nombre, apellido, nombre de usuario y foto
- pantalla de nuevo viaje en Expo
- busqueda de usuarios contra backend
- agregado de participantes registrados
- invitacion externa desde el mismo buscador

Frontend de resguardo:

- `frontend-ant/` conserva el frontend anterior en React + Vite
- usarlo solo como referencia al migrar algun componente faltante

## Reglas de colaboracion

- antes de cambiar stack, estructura o criterio visual base, conversar el cambio
- si se toma una nueva convencion, actualizar este archivo en el mismo trabajo
- no dejar decisiones arquitectonicas relevantes solo en chat o commits
