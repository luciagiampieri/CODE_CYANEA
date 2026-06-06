# Backend

API inicial con FastAPI.

## Requisitos

- Python 3.12
- PostgreSQL 16

## Configuración local

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

## Endpoints iniciales

- `GET /health`
- `GET /api/v1`
- `GET /api/v1/trips`

## Próximo paso sugerido

Implementar autenticación y persistencia real de `Trip`, `TripMember` y `Expense`.

