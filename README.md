# 🐙 Cyanea - Gestión Integral de Viajes Grupales

> *“Muchas manos, un único destino”*

**Cyanea** es una plataforma digital colaborativa (móvil y web) diseñada para centralizar la logística y la información técnica de los viajes en grupo. El sistema optimiza las etapas de planificación, organización y ejecución de los itinerarios, mitigando la fragmentación de datos en canales externos (como WhatsApp o planillas de cálculo), agilizando la comunicación y estructurando la toma de decisiones mediante un sistema de votaciones democráticas.

Este desarrollo se realiza en el marco del **Proyecto Final de Carrera** para la carrera de **Ingeniería en Sistemas de Información** en la **Universidad Tecnológica Nacional - Facultad Regional Córdoba (UTN FRC)**.

---

## Stack
 
- `frontend/`: Expo + React Native + Expo Web
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
npm run web
```
 
## Servicios esperados
 
- Frontend web: `http://localhost:8081`
- Backend: `http://127.0.0.1:8000`
- Docs API: `http://127.0.0.1:8000/docs`

## Notificaciones push Android

El proyecto usa Expo Push Notifications sobre FCM V1 para Android.

Configuracion versionada que debe viajar con el codigo:

- `frontend/app.json`
  - `owner`: `lcorrea87s-team`
  - `extra.eas.projectId`: `0dddd612-ef66-4470-9a77-ce206f823efd`
  - `android.package`: `com.ticigaticasteam.cyanea`
  - `android.googleServicesFile`: `./google-services.json`
  - plugin `expo-notifications`
- `frontend/eas.json`
  - perfiles `development` y `production`
- `frontend/google-services.example.json`
  - ejemplo de estructura/ubicacion del archivo real
- `backend/.env.example`
  - `PUSH_ENABLED`
  - `EXPO_PUSH_URL`
  - `EXPO_PUSH_ACCESS_TOKEN`
  - variables de recordatorios de actividad

Archivos locales o secretos que no se versionan:

- `frontend/google-services.json`: descargarlo desde Firebase para el package `com.ticigaticasteam.cyanea`
- service account JSON de Firebase Admin/FCM V1: no guardarlo en el repo; se carga en EAS
- `backend/.env` y `frontend/.env`
- `cyfb/`, `frontend/android/`, caches y logs de build

Credenciales EAS/FCM:

- el proyecto EAS activo es `@lcorrea87s-team/cyanea`
- FCM V1 esta configurado en EAS para `com.ticigaticasteam.cyanea`
- Firebase project actual: `cyanea-8aba1`
- si se cambia `extra.eas.projectId`, cada dispositivo debe regenerar su Expo Push Token

Comandos utiles:

```powershell
cd frontend
$env:NODE_OPTIONS="--use-system-ca"
npx eas-cli project:info
npx eas-cli credentials -p android
```

Para emulador Android, `frontend/.env` normalmente debe usar:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api/v1
```

Para Expo Web o navegador local:

```env
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

Si el token push queda asociado a un `projectId` anterior, desactivar y activar push en la app para registrar un token nuevo. El token viejo debe quedar inactivo en `TokensPushUsuarios`.

## Build Android local

En repos dentro de OneDrive pueden aparecer errores de permisos o path length durante Gradle. Para evitar subir caches al repo, usar carpetas locales ignoradas por git:

```powershell
$env:GRADLE_USER_HOME="X:\cyfb\gradle-home"
$env:TEMP="X:\cyfb\tmp"
$env:TMP="X:\cyfb\tmp"
```

`cyfb/` esta ignorada y no debe subirse.
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
