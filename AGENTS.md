# AGENTS.md

Guia operativa del proyecto Cyanea para colaboradores humanos y para agentes como Codex.

Si trabajas con Codex, pide primero que lea este archivo completo antes de proponer o implementar cambios.

Regla permanente:

- Toda nueva definicion tecnica, convencion, criterio de implementacion, decision de arquitectura o cambio de estructura del proyecto debe actualizarse en este `AGENTS.md` dentro del mismo trabajo.

## Objetivo del proyecto

Cyanea es una aplicacion web/mobile PWA para organizacion colaborativa de viajes grupales.

Alcance actual del MVP:

- creacion de viajes
- incorporacion de participantes registrados
- invitaciones externas por correo
- estructura base para viajes, usuarios, participaciones e invitaciones
- frontend React PWA
- backend FastAPI
- persistencia en PostgreSQL

Fuera de alcance por ahora:

- autenticacion real
- pagos reales
- venta de pasajes o reservas
- integraciones externas complejas

## Stack tecnologico

- Frontend: React 18 + Vite + `vite-plugin-pwa` + `react-router-dom` + Font Awesome
- Backend: FastAPI + SQLAlchemy + Alembic
- Base de datos: PostgreSQL
- Entorno local esperado:
  - Python 3.12
  - Node.js 20
  - PostgreSQL 16 o compatible

## Estructura del repositorio

```text
CODE_CYANEA/
├── AGENTS.md
├── README.md
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── mail/
│   │   │   └── notifications/
│   │   ├── templates/
│   │   │   └── emails/
│   │   └── main.py
│   ├── alembic/
│   ├── scripts/
│   │   └── sql/
│   ├── tests/
│   ├── .env
│   ├── .env.example
│   ├── pyproject.toml
│   └── README.md
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── trip/
│   │   │   └── ui/
│   │   ├── pages/
│   │   │   ├── home/
│   │   │   └── trips/
│   │   ├── services/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
└── logs/
```

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
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
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
MAIL_FRONTEND_BASE_URL=http://127.0.0.1:5173
```

Levantar backend:

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 3. Frontend

Desde `frontend/`:

```powershell
npm install
copy .env.example .env
npm run dev -- --host 127.0.0.1 --port 5173
```

Variable recomendada en `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

### 4. Base de datos

Crear la base `cyanea` y configurar `DATABASE_URL`.

Para crear estructuras y seeds del MVP usar los scripts SQL en `backend/scripts/sql`.

## Comandos frecuentes

### Backend

```powershell
cd backend
.venv\Scripts\python.exe -m pytest
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

### Frontend

```powershell
cd frontend
npm run dev
npm run build
```

### API util

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
  - `EstadosInvitaciones`
  - `InvitacionesViajes`

### Columnas

- Nombre en espanol
- Formato `CamelCase`
- Claves primarias con prefijo `Id`
- Claves foraneas con nombre completo de la entidad referenciada

Ejemplos correctos:

- `IdUsuario`
- `IdViaje`
- `IdAdministrador`
- `FechaAlta`

Ejemplos incorrectos:

- `user_id`
- `trip_id`
- `usuario_id`
- `id_viaje`

### Restricciones

- Modelo normalizado
- Campos de estado y rol deben resolverse por tablas maestras, no por texto libre
- Usar claves foraneas explicitas
- Usar `UNIQUE` donde aplique
- Mantener `Activo`, `FechaAlta` y `FechaBaja` cuando tenga sentido en entidades maestras o administrables

### Tablas maestras actuales

- `EstadosViajes`
- `RolesParticipantes`
- `EstadosParticipaciones`
- `EstadosInvitaciones`

No agregar campos de tipo texto libre para representar estos conceptos si ya existe catalogo maestro.

## Convenciones ORM y backend

### Modelos SQLAlchemy

- Un archivo por entidad en `backend/app/models/`
- Clase en singular
- Atributos mapeados a nombres reales de columnas en base
- Mantener coherencia con el nombre exacto de la tabla y sus relaciones

Ejemplos actuales:

- `usuario.py` -> `Usuario`
- `viaje.py` -> `Viaje`
- `participante_viaje.py` -> `ParticipanteViaje`
- `invitacion_viaje.py` -> `InvitacionViaje`

### Schemas Pydantic

- Van en `backend/app/schemas/`
- Nombres de clases para requests y responses en singular
- Sufijos sugeridos:
  - `Read`
  - `Create`
  - `Update`

### Rutas FastAPI

- Van en `backend/app/api/routes/`
- Mantener routers por modulo de dominio
- Endpoints pueden usar nombres REST en ingles por compatibilidad tecnica, pero no cambiar el dominio de fondo

Ejemplos actuales:

- `users.py`
- `trips.py`

### Servicios backend

- La logica transversal reusable debe vivir en `backend/app/services/`
- Infraestructura de correo en `services/mail/`
- Casos de uso o integraciones de notificacion en `services/notifications/`
- No acoplar SMTP, render de templates o armado de mails directamente en los endpoints

### Migraciones

- Alembic esta configurado
- Si se cambia estructura persistente:
  - actualizar modelos
  - actualizar scripts SQL
  - actualizar migracion o generar una nueva si el equipo decide seguir con Alembic como fuente principal

Regla actual del proyecto:

- Los scripts SQL idempotentes son obligatorios
- No dejar cambios solo en ORM o solo en Alembic

## Convenciones de scripts SQL

Ubicacion:

- `backend/scripts/sql/`

Reglas:

- Un archivo por tabla si la responsabilidad es clara
- Prefijo numerico obligatorio
- Ordenar por dependencias reales
- Deben ser idempotentes
- Debe existir un script maestro de ejecucion

Orden actual:

1. `001_estados_viajes.sql`
2. `002_roles_participantes.sql`
3. `003_estados_participaciones.sql`
4. `004_usuarios.sql`
5. `005_viajes.sql`
6. `006_participantes_viajes.sql`
7. `006a_estados_invitaciones.sql`
8. `006b_invitaciones_viajes.sql`
9. `007_datos_maestros.sql`
10. `008_seed_minimo.sql`

Scripts auxiliares:

- `run_all.sql`
- `reset_dev.sql`

### Reglas para nuevos scripts

Si agregas una tabla nueva:

1. crear un nuevo script numerado
2. ubicarlo segun sus dependencias
3. actualizar `run_all.sql`
4. si corresponde, agregar datos maestros en `007_datos_maestros.sql`
5. si corresponde, agregar datos de desarrollo en `008_seed_minimo.sql`

No mezclar en un mismo script:

- creacion de tabla
- datos maestros
- seed de desarrollo

salvo que haya una razon muy fuerte y documentada.

## Convenciones frontend

### Estructura

- `frontend/src/App.jsx` es solo un entry liviano
- `frontend/src/app/AppRouter.jsx` centraliza el routing
- `frontend/src/pages/` contiene pantallas completas
- `frontend/src/components/layout/` contiene layout y header
- `frontend/src/components/ui/` contiene componentes visuales reutilizables
- `frontend/src/components/trip/` contiene componentes especificos del dominio viaje
- `frontend/src/services/api.js` centraliza acceso HTTP
- `frontend/src/styles.css` es el CSS global unico del proyecto

Layout responsive actual:

- `MainLayout` define el shell responsive unico de la app
- mobile: header compacto + tab bar inferior
- desktop: sidebar lateral + contenido expandido
- no se deben crear pantallas duplicadas por dispositivo
- la adaptacion entre mobile, tablet y desktop se resuelve con composicion + CSS responsive

### Router y paginas

- Usar `react-router-dom` para la navegacion principal
- Toda nueva pantalla debe vivir en `frontend/src/pages/`
- No volver a concentrar logica de varias pantallas en `App.jsx`
- El layout comun debe componerse desde `components/layout/`

Paginas actuales:

- `pages/home/HomePage.jsx`
- `pages/trips/CreateTripPage.jsx`

### Componentes

- Los componentes UI base deben ir en `components/ui/`
- Los componentes especificos del dominio deben ir en carpetas por dominio, por ejemplo `components/trip/`
- Si una pieza visual o de interaccion se reutiliza en mas de una pantalla, debe extraerse a componente

Componentes UI base actuales:

- `Button`
- `Avatar`
- `EmptyState`
- `StatusBadge`

Componentes de viaje actuales:

- `TripForm`
- `ParticipantSearch`
- `ParticipantChipList`
- `ExternalInviteList`

### Estilos

- No crear un CSS por pantalla
- Centralizar estilos en `frontend/src/styles.css`
- Mantener variables CSS en `:root`
- Respetar la identidad visual actual
- Si se agrega un nuevo componente o pagina, sus clases deben declararse en `styles.css`, no en archivos CSS separados
- El CSS global puede organizarse por bloques logicos, pero sigue siendo un unico archivo fuente de identidad visual
- El frontend debe seguir enfoque mobile-first
- Evitar anchos fijos innecesarios
- Preferir `clamp`, `%`, `minmax`, `max-width` y grids fluidos
- Verificar que no haya scroll horizontal en `375px`, `768px`, `1024px` y `1440px`
- Cuando una navegacion o disposicion cambie entre dispositivos, hacerlo por breakpoints CSS antes que por componentes duplicados

Breakpoints de referencia actuales:

- mobile base: `< 768px`
- tablet: `>= 768px`
- desktop: `>= 1024px`
- wide desktop: `>= 1440px`

Paleta principal:

- azul: `#1e3e7b`
- amarillo: `#ffec80`
- blanco: `#ffffff`
- negro: `#000000`

Tipografias:

- `Montserrat`
- `Roboto`

Iconografia:

- Usar Font Awesome desde React para iconos de navegacion y acciones
- Evitar placeholders de texto como iconos visuales
- Mantener consistencia entre tab bar mobile, sidebar desktop y acciones del header

### UI/UX

- Mobile first
- PWA
- Evitar interfaces que escalen mal con listas grandes
- Preferir:
  - buscadores predictivos
  - paginacion
  - listas compactas
  - chips o selects con resultados acotados

## Convenciones para nuevas funcionalidades

Antes de implementar una historia:

1. verificar si requiere nuevas tablas o solo nuevos campos
2. validar si el concepto ya existe como tabla maestra
3. definir impacto en scripts SQL
4. definir impacto en ORM
5. definir impacto en schemas y endpoints
6. definir impacto en UI

Para cada cambio persistente, actualizar como minimo:

- SQL
- ORM
- API
- seed si hace falta probar manualmente

## Estado actual del proyecto

Implementado:

- home PWA en React
- router frontend con paginas y layout separados
- componentes UI reutilizables para frontend
- layout responsive unico para mobile, tablet y desktop
- navegacion mobile inferior y sidebar desktop dentro del mismo frontend
- backend FastAPI operativo
- creacion de viajes
- seleccion de participantes registrados
- invitaciones externas por correo en estado provisional
- modulo compartido de envio de mails con templates y configuracion por `.env`
- buscador predictivo de participantes
- modelo normalizado minimo para viajes, participantes e invitaciones
- seeds basicos de usuarios y viaje

Pendiente relevante:

- autenticacion real
- ABM completo de viajes
- pantalla de aceptacion de invitaciones por token
- modulos de gastos, itinerario, documentos, votaciones y tareas
- pruebas mas completas

## Reglas de colaboracion

- No borrar tablas, scripts o modelos existentes sin revisar dependencias
- No renombrar columnas del dominio a ingles
- No introducir duplicacion entre texto libre y catalogos maestros
- No hardcodear datos de negocio si el concepto debe vivir en base
- Si una decision cambia una convencion de este archivo, actualizar este archivo en el mismo trabajo
- Si se agrega una nueva regla de trabajo o un nuevo criterio del proyecto, debe quedar documentado en este archivo antes de cerrar la tarea

## Instrucciones para Codex

Cuando un agente Codex entre al repositorio debe:

1. leer este `AGENTS.md`
2. inspeccionar la estructura actual antes de proponer cambios
3. respetar estas convenciones como fuente de verdad del proyecto
4. si encuentra una contradiccion entre codigo y este archivo:
   - asumir que este archivo refleja la decision vigente
   - explicitar la diferencia
   - proponer alinear codigo y documentacion

Al hacer cambios, Codex deberia preferir:

- cambios pequenos y coherentes
- mantener scripts SQL idempotentes
- mantener toda la identidad visual del frontend en `frontend/src/styles.css`
- verificar backend con `pytest`
- verificar frontend con `npm run build`

## Checklist de entrega

Antes de cerrar una tarea:

1. verificar que el proyecto compile
2. verificar que el backend levante
3. verificar que el frontend levante
4. verificar que los cambios persistentes esten reflejados en SQL y ORM
5. actualizar este archivo si se modifico o agrego una convencion, definicion o criterio de trabajo
