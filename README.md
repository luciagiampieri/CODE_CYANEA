# Cyanea — Gestión integral de viajes grupales

> *"Muchas manos, un único destino"*

**Cyanea** es una plataforma colaborativa (mobile y web) que centraliza la planificación, organización y ejecución de viajes en grupo: itinerario, gastos compartidos y liquidación, votaciones, documentos, checklists, exploración de lugares y un asistente de planificación con IA.

Proyecto Final de la carrera **Ingeniería en Sistemas de Información** — **Universidad Tecnológica Nacional, Facultad Regional Córdoba (UTN FRC)**.

---

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend (mobile + web) | Expo (React Native + react-native-web), React Navigation |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Base de datos | PostgreSQL 16 |
| Servicios externos | Google Places/Maps, Gemini, Supabase Storage, Expo Push (FCM), SMTP |

Requisitos locales: **Python 3.12**, **Node.js >= 20.19.4** (lo exige Expo) y **PostgreSQL 16** o compatible.

## Estructura

```text
CODE_CYANEA/
├─ backend/                 API FastAPI
│  ├─ app/                  rutas, modelos, schemas, servicios y templates de mail
│  ├─ alembic/              migraciones de base de datos
│  ├─ scripts/              utilidades (crear admin, confirmar usuario, SQL manual)
│  └─ tests/                tests de integración (pytest)
├─ frontend/                app Expo única para Android, iOS y web
│  └─ src/                  screens, components, services, hooks, theme, tests
├─ docs/                    guías de testing
├─ .github/workflows/       CI: tests de backend y frontend en cada push/PR
├─ docker-compose.yml       PostgreSQL + backend + Mailpit para desarrollo
└─ AGENTS.md                convenciones técnicas y decisiones de arquitectura
```

## Puesta en marcha

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env          # completar DATABASE_URL y credenciales
alembic upgrade head
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- API: `http://127.0.0.1:8000` · Swagger: `http://127.0.0.1:8000/docs` · Health: `GET /health`
- Todas las variables disponibles están documentadas en [`backend/.env.example`](backend/.env.example).
- Para crear un administrador del backoffice: `python -m scripts.crear_admin_sistema`.

### Frontend

```powershell
cd frontend
copy .env.example .env          # EXPO_PUBLIC_API_BASE_URL apunta al backend
npm install
npm run web                     # http://localhost:8081
```

Otros comandos: `npm run start`, `npm run android`, `npm run web:clear`.

Valor de `EXPO_PUBLIC_API_BASE_URL` según dónde corre la app:

| Entorno | URL |
|---------|-----|
| Web local | `http://127.0.0.1:8000/api/v1` |
| Emulador Android | `http://10.0.2.2:8000/api/v1` |

### Con Docker (alternativa)

```powershell
docker compose up --build
```

Levanta PostgreSQL, el backend (aplica migraciones al iniciar) y [Mailpit](http://localhost:8025) para ver los correos de desarrollo. Requiere `backend/.env`; los puertos y credenciales de Postgres se pueden ajustar con un `.env` en la raíz.

## Tests

```powershell
# Backend: SQLite en memoria, no necesita Postgres
cd backend
.venv\Scripts\python.exe -m pytest -v
.venv\Scripts\python.exe -m pytest --cov=app --cov-report=term-missing

# Frontend: jest-expo + Testing Library
cd frontend
npm test
npm run test:coverage           # falla si la cobertura baja del piso configurado
```

GitHub Actions corre ambas suites en cada push y pull request. Las estrategias y patrones de testing están en [`docs/testing-backend.md`](docs/testing-backend.md) y [`docs/testing-frontend.md`](docs/testing-frontend.md).

## Builds y despliegue

- **Backend**: imagen Docker definida en [`backend/Dockerfile`](backend/Dockerfile) (desplegada en Railway); ejecuta `alembic upgrade head` antes de iniciar uvicorn.
- **Web**: `npx expo export --platform web` genera `frontend/dist`, que se publica con Cloudflare Workers ([`frontend/wrangler.jsonc`](frontend/wrangler.jsonc)).
- **Mobile**: EAS Build, proyecto `@lcorrea87s-team/cyanea`, perfiles `development` y `production` en [`frontend/eas.json`](frontend/eas.json).

### Notificaciones push en Android

Usan Expo Push sobre FCM V1 (proyecto Firebase `cyanea-8aba1`, package `com.ticigaticasteam.cyanea`).

- `frontend/google-services.json` **no se versiona**: cada integrante lo descarga desde Firebase (ver `frontend/google-services.example.json`). Sin ese archivo la app funciona igual en Expo Go y web, pero sin push.
- Las credenciales FCM se administran en EAS: `npx eas-cli credentials -p android` (con `$env:NODE_OPTIONS="--use-system-ca"` si la red usa certificados propios).
- Si cambia `extra.eas.projectId`, cada dispositivo debe regenerar su token push (desactivar y activar push en la app).

### Repositorio dentro de OneDrive

Si Gradle falla con errores de permisos o rutas largas, compilar con carpetas locales fuera de OneDrive:

```powershell
$env:CYANEA_ANDROID_BUILD_ROOT="$env:TEMP\cyanea-android-build"
$env:GRADLE_USER_HOME="X:\cyfb\gradle-home"
```

## Seguridad

Nunca versionar `.env`, `google-services.json`, `GoogleService-Info.plist`, service accounts de Firebase ni claves de firma. Los ejemplos de configuración (`*.example*`) solo llevan valores ficticios.

## Para colaboradores

Antes de proponer o implementar cambios, leer [`AGENTS.md`](AGENTS.md): concentra las convenciones de nombres (dominio en español), reglas de base de datos, contratos de cada historia de usuario y criterios de frontend. Toda decisión técnica nueva se documenta ahí en el mismo trabajo.
