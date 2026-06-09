# 🐙 Cyanea - Gestión Integral de Viajes Grupales

> *“Muchas manos, un único destino”*

**Cyanea** es una plataforma digital colaborativa (móvil y web) diseñada para centralizar la logística y la información técnica de los viajes en grupo. El sistema optimiza las etapas de planificación, organización y ejecución de los itinerarios, mitigando la fragmentación de datos en canales externos (como WhatsApp o planillas de cálculo), agilizando la comunicación y estructurando la toma de decisiones mediante un sistema de votaciones democráticas.

Este desarrollo se realiza en el marco del **Proyecto Final de Carrera** para la carrera de **Ingeniería en Sistemas de Información** en la **Universidad Tecnológica Nacional - Facultad Regional Córdoba (UTN FRC)**.

---

## Stack

- `backend/`: FastAPI + SQLAlchemy + Alembic
- `frontend/`: Expo + React Native + Web
- `frontend-ant/`: resguardo del frontend anterior en React + Vite
- `docker-compose.yml`: PostgreSQL + backend

## Estado estructural actual

- Existe un unico frontend activo: `frontend/`
- Ese frontend usa Expo y apunta a mobile + web con un solo codigo base
- `frontend-ant/` queda solo como resguardo de referencia y no debe seguir evolucionando
- No se usan `frontend-mobile/` ni `frontend-web/`
- No se usa backend Node/Express; el backend vigente es solo `backend/` con FastAPI

## Estructura

```text
CODE_CYANEA/
├── backend/
├── frontend/
├── frontend-ant/
├── logs/
├── docker-compose.yml
└── AGENTS.md
`- README.md
```

## Arranque rapido

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

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
- El frontend usa `EXPO_NO_METRO_WORKSPACE_ROOT=1` desde `package.json`, no hace falta configurarlo manualmente

## Documentacion operativa

Antes de trabajar en el proyecto, leer:

- `AGENTS.md`

Ese archivo contiene:

- Convenciones de naming
- Reglas de base de datos
- Estructura del proyecto
- Criterios de frontend
- Pautas de trabajo para colaboradores y Codex
