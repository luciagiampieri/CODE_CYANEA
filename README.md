# 🐙 Cyanea - Gestión Integral de Viajes Grupales

> *“Muchas manos, un único destino”*

**Cyanea** es una plataforma digital colaborativa (móvil y web) diseñada para centralizar la logística y la información técnica de los viajes en grupo. El sistema optimiza las etapas de planificación, organización y ejecución de los itinerarios, mitigando la fragmentación de datos en canales externos (como WhatsApp o planillas de cálculo), agilizando la comunicación y estructurando la toma de decisiones mediante un sistema de votaciones democráticas.

Este desarrollo se realiza en el marco del **Proyecto Final de Carrera** para la carrera de **Ingeniería en Sistemas de Información** en la **Universidad Tecnológica Nacional - Facultad Regional Córdoba (UTN FRC)**.

---

## Stack
 
- `frontend/`: React + Vite + PWA
- `backend/`: FastAPI + SQLAlchemy + Alembic
- `docker-compose.yml`: PostgreSQL + backend + frontend
## Estructura
 
```
CODE_CYANEA/
├─ backend/
│  ├─ app/
│  ├─ tests/              # tests de integración (pytest)
│  └─ pyproject.toml
├─ frontend/
├─ .github/
│  └─ workflows/          # CI: corre los tests en cada push/PR
├─ docker-compose.yml
├─ AGENTS.md
└─ README.md
```
 
## Arranque rápido
 
### Backend
 
```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
 
### Frontend
 
```
cd frontend
npm install
copy .env.example .env
npm run dev -- --host 127.0.0.1 --port 5173
```
 
## Servicios esperados
 
- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- Docs API: `http://127.0.0.1:8000/docs`
## Tests
 
El backend tiene tests de integración con `pytest` (base de datos SQLite en
memoria, sin necesidad de Postgres levantado). Ver [`backend/TESTING.md`](backend/TESTING.md)
para la estrategia completa.
 
```
cd backend
.venv\Scripts\python.exe -m pytest -v
```
 
Con reporte de cobertura:
```
.venv\Scripts\python.exe -m pytest --cov=app --cov-report=term-missing
```
 
Los tests corren automáticamente en cada push/PR vía GitHub Actions
(`.github/workflows/backend-tests.yml`).
 
## Documentación operativa
 
Antes de trabajar en el proyecto, leer:
 
- `AGENTS.md`
- `backend/TESTING.md` (estrategia de testing del backend)

`AGENTS.md` contiene:
 
- convenciones de naming
- reglas de base de datos
- estructura del proyecto
- criterios de frontend responsive
- pautas de trabajo para colaboradores y Codex