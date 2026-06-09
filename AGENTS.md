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

Notas del frontend Expo:

- `npm run web` levanta el frontend en `http://localhost:8081`
- los scripts ya incluyen `EXPO_NO_METRO_WORKSPACE_ROOT=1`
- mantener `react` y `react-dom` exactamente en la misma version

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

Datos maestros y seed:

- `backend/scripts/sql/007_datos_maestros.sql`
- `backend/scripts/sql/008_seed_minimo.sql`

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

## Convenciones de backend

- FastAPI expone rutas en `backend/app/api/routes/`
- modelos ORM en `backend/app/models/`
- schemas pydantic en `backend/app/schemas/`
- acceso a base en `backend/app/db/`
- servicios reutilizables en `backend/app/services/`
- el modulo de mail es compartido y debe servir para invitaciones, notificaciones futuras, recuperacion de password y casos similares

## Convenciones de frontend

### Regla estructural

- el frontend activo vive en `frontend/`
- no crear variantes paralelas del mismo frontend
- la navegacion principal vive en `frontend/src/navigation/`
- las pantallas completas viven en `frontend/src/screens/`
- los componentes reutilizables viven en `frontend/src/components/`
- el acceso HTTP vive en `frontend/src/services/api.js`
- los tokens de diseno viven en `frontend/src/theme/tokens.js`

### Estilo e identidad visual

- color primario: `#1e3e7b`
- color acento: `#ffec80`
- estilo limpio, profesional y mobile-first
- en Expo no se usa un `styles.css` global; la identidad visual debe centralizarse en tokens compartidos y helpers de estilo
- evitar hardcodear colores, radios o espaciados por componente si ya existe token equivalente

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

Backend:

- listado de viajes
- alta de viaje
- listado de usuarios
- usuario actual hardcodeado a `luciano` por ahora
- invitaciones externas persistidas y preparadas para envio de mail

Frontend activo:

- home en Expo
- tabs base del producto
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
