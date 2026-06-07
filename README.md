# Cyanea Codebase

Base actual del proyecto Cyanea.

## Stack

- `frontend/`: React + Vite + PWA
- `backend/`: FastAPI + SQLAlchemy + Alembic
- `docker-compose.yml`: PostgreSQL + backend + frontend

## Estructura

```text
CODE_CYANEA/
├─ backend/
├─ frontend/
├─ docker-compose.yml
├─ AGENTS.md
└─ README.md
```

## Arranque rápido

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev -- --host 127.0.0.1 --port 5173
```

## Servicios esperados

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- Docs API: `http://127.0.0.1:8000/docs`

## Documentación operativa

Antes de trabajar en el proyecto, leer:

- `AGENTS.md`

Ese archivo contiene:

- convenciones de naming
- reglas de base de datos
- estructura del proyecto
- criterios de frontend responsive
- pautas de trabajo para colaboradores y Codex
