# 🐙 Cyanea - Gestión Integral de Viajes Grupales

> *“Muchas manos, un único destino”*

**Cyanea** es una plataforma digital colaborativa (móvil y web) diseñada para centralizar la logística y la información técnica de los viajes en grupo. El sistema optimiza las etapas de planificación, organización y ejecución de los itinerarios, mitigando la fragmentación de datos en canales externos (como WhatsApp o planillas de cálculo), agilizando la comunicación y estructurando la toma de decisiones mediante un sistema de votaciones democráticas.

Este desarrollo se realiza en el marco del **Proyecto Final de Carrera** para la carrera de **Ingeniería en Sistemas de Información** en la **Universidad Tecnológica Nacional - Facultad Regional Córdoba (UTN FRC)**.

---

## Stack

- `backend/`: FastAPI + SQLAlchemy + Alembic.
- `frontend/`: Expo + React Native + Web.
- `frontend-ant/`: resguardo del frontend anterior en React + Vite.
- `docker-compose.yml`: PostgreSQL + backend.

## Estado estructural actual

- Existe un único frontend activo: `frontend/`
- Ese frontend usa Expo y apunta a mobile + web con un solo código base.
- No se usa backend Node/Express; el backend vigente es solo `backend/` con FastAPI.

## Estructura

```text
CODE_CYANEA/
├── backend/
├── frontend/
├── frontend-ant/
├── logs/
├── docker-compose.yml
└── AGENTS.md
└── README.md
```

## Arranque rápido

### Base de datos (Docker)

```powershell
docker compose up -d
```

Esto levanta PostgreSQL según `docker-compose.yml`. Verificá que las variables de conexión en `backend/.env` coincidan con las definidas ahí.

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
alembic upgrade head
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
> El paso `alembic upgrade head` aplica las migraciones y crea las tablas necesarias en la base de datos. Es obligatorio la primera vez que se levanta el proyecto, y cada vez que haya migraciones nuevas.

### Frontend Expo

```powershell
cd frontend
copy .env.example .env
npm install
npm run web
```

Variable esperada:

```env
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

## Nota de entorno

- Expo 56 requiere Node `>= 20.19.4`
- `npm run web` levanta Expo Web en `http://localhost:8081`
- El frontend usa `EXPO_NO_METRO_WORKSPACE_ROOT=1` desde `package.json`, no hace falta configurarlo manualmente.

## Documentación operativa

Antes de trabajar en el proyecto, leer:

- `AGENTS.md`

Ese archivo contiene:

- Convenciones de naming.
- Reglas de base de datos.
- Estructura del proyecto.
- Criterios de frontend.
- Pautas de trabajo para colaboradores y Codex.
