# Backend

API de Cyanea implementada con FastAPI.

## Objetivo

- Exponer la API del MVP
- Persistir viajes, usuarios, participantes e invitaciones
- Mantener el dominio en espanol en tablas, modelos y columnas
- Centralizar servicios compartidos como el envio de mails

## Requisitos

- Python 3.12
- PostgreSQL 16 o compatible

## Configuracion local

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Para inicializar la base del MVP usar los scripts SQL de `scripts/sql`.

## Configuracion de correo

La API incluye un modulo compartido de envio de mails.

Variables relevantes en `.env`:

```env
MAIL_ENABLED=true
MAIL_PROVIDER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=cyanea.app@gmail.com
MAIL_PASSWORD=fuxsrhgctufexgsx
MAIL_USE_TLS=true
MAIL_FROM_EMAIL=cyanea.app@gmail.com
MAIL_FROM_NAME=Cyanea
MAIL_REPLY_TO=cyanea.app@gmail.com
MAIL_FRONTEND_BASE_URL=http://127.0.0.1:8081

```

Notas:

- si `MAIL_ENABLED=false`, la API no intenta enviar correos
- si `MAIL_ENABLED=true`, usa el proveedor SMTP configurado
- el primer template implementado es el de invitacion a viajes
- en local, si se usa Expo Web, incluir `http://localhost:8081` y `http://127.0.0.1:8081` dentro de `CORS_ORIGINS`

## Estructura relevante

```text
app/
|- api/
|- core/
|- db/
|- models/
|- schemas/
|- services/
|  |- mail/
|  `- notifications/
|- templates/
|  `- emails/
`- main.py
```

## Reglas estructurales

- No reintroducir backend paralelo en Node/Express
- Respetar tablas en espanol y en plural
- Respetar columnas del dominio en espanol y camelCase
- Si cambia una convencion de backend o base de datos, actualizar `../AGENTS.md`
