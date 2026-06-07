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

## Configuracion de correo

La API incluye un modulo compartido de envio de mails.

Variables relevantes en `.env`:

```env
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

Notas:

- si `MAIL_ENABLED=false`, la API no intenta enviar correos
- si `MAIL_ENABLED=true`, usa el proveedor SMTP configurado
- el primer template implementado es el de invitacion a viajes

## Endpoints iniciales

- `GET /health`
- `GET /api/v1`
- `GET /api/v1/trips`

## Próximo paso sugerido

Implementar autenticación y persistencia real de `Trip`, `TripMember` y `Expense`.
