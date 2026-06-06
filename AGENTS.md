# AGENTS.md

Guia operativa del proyecto Cyanea para colaboradores humanos y para agentes como Codex.

Si trabajas con Codex, pide primero que lea este archivo completo antes de proponer o implementar cambios.

## Objetivo del proyecto

Cyanea es una aplicacion web/mobile PWA para organizacion colaborativa de viajes grupales.

Alcance actual del MVP:

- creacion de viajes
- incorporacion de participantes registrados
- estructura base para viajes, usuarios y participaciones
- frontend React PWA
- backend FastAPI
- persistencia en PostgreSQL

Fuera de alcance por ahora:

- autenticacion real
- pagos reales
- venta de pasajes o reservas
- integraciones externas complejas

## Stack tecnologico

- Frontend: React 18 + Vite + `vite-plugin-pwa`
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
- `EstadoActivo` no existe hoy, pero el formato es correcto

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
7. `007_datos_maestros.sql`
8. `008_seed_minimo.sql`

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

- `frontend/src/App.jsx` es hoy la pantalla principal
- `frontend/src/services/api.js` centraliza acceso HTTP
- `frontend/src/styles.css` es el CSS global unico del proyecto

### Estilos

- No crear un CSS por pantalla por ahora
- Centralizar estilos en `frontend/src/styles.css`
- Mantener variables CSS en `:root`
- Respetar la identidad visual actual

Paleta principal:

- azul: `#1e3e7b`
- amarillo: `#ffec80`
- blanco: `#ffffff`
- negro: `#000000`

Tipografias:

- `Montserrat`
- `Roboto`

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
- backend FastAPI operativo
- creacion de viajes
- seleccion de participantes registrados
- buscador predictivo de participantes
- modelo normalizado minimo para viajes y participantes
- seeds basicos de usuarios y viaje

Pendiente relevante:

- autenticacion real
- ABM completo de viajes
- modulos de gastos, itinerario, documentos, votaciones y tareas
- pruebas mas completas

## Reglas de colaboracion

- No borrar tablas, scripts o modelos existentes sin revisar dependencias
- No renombrar columnas del dominio a ingles
- No introducir duplicacion entre texto libre y catalogos maestros
- No hardcodear datos de negocio si el concepto debe vivir en base
- Si una decision cambia una convencion de este archivo, actualizar este archivo en el mismo trabajo

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
- verificar backend con `pytest`
- verificar frontend con `npm run build`

## Checklist de entrega

Antes de cerrar una tarea:

1. verificar que el proyecto compile
2. verificar que el backend levante
3. verificar que el frontend levante
4. verificar que los cambios persistentes esten reflejados en SQL y ORM
5. actualizar este archivo si se modifico una convencion de trabajo
