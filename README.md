# Cyanea - Gestión Integral de Viajes Grupales

> *"Muchas manos, un único destino"*

**Cyanea** es una plataforma colaborativa (móvil y web) para organizar viajes en grupo. Centraliza en un solo lugar el itinerario, los gastos, los documentos y las decisiones del grupo, que normalmente quedan repartidos entre WhatsApp y planillas de cálculo.

Proyecto Final de la carrera **Ingeniería en Sistemas de Información** — **Universidad Tecnológica Nacional, Facultad Regional Córdoba (UTN FRC)**.

🌐 **App:** https://code-cyanea.fafafacultad.workers.dev
🔌 **API:** https://cyanea-production.up.railway.app/api/v1

---

## Funcionalidades

- **Viajes y grupo:** viajes con uno o varios destinos, reparto de noches y traslados; invitaciones por usuario, correo o link; transferencia de la administración.
- **Itinerario:** vista timeline y calendario, actividades arrastrables entre días, sugerencias de actividades con IA, rutas diarias a pie, en auto o en bici con mapa interactivo y exportación a PDF o calendario.
- **Exploración de lugares:** búsqueda de lugares de interés con Google Places y recomendaciones según la zona visible del mapa.
- **Gastos:** gastos individuales o divididos (igualitario o personalizado), escaneo de comprobantes con IA, conversión de moneda con la cotización usada visible en cada gasto, balances por participante con desglose por etapa del viaje (pre viaje, en curso y post viaje) y plan de liquidación con transferencias.
- **Votaciones:** decisiones grupales de opción única o múltiple, con fecha de cierre y resultados.
- **Documentos y checklist:** repositorio de documentos por categoría (con guardado offline), información relevante y tareas del grupo.
- **Planes y suscripción Pro:** límites de uso por plan, suscripción con Mercado Pago y consulta del consumo de la cuenta.
- **Backoffice:** gestión de usuarios, categorías, planes, suscripciones y pagos, términos, monitoreo de IA, auditoría y métricas con estacionalidad y tendencias.
- **Tiempo real y notificaciones:** cambios sincronizados por WebSocket y notificaciones por email según las preferencias de cada usuario.
- **Autenticación:** registro con email y confirmación, más login con Google y Facebook.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Expo + React Native + React Navigation (mobile y web) |
| Backend | FastAPI + SQLAlchemy + Alembic |
| Base de datos | PostgreSQL |
| Storage | Supabase Storage (fotos de perfil y documentos) |
| Integraciones | Google Places / Google Maps, Gemini, Mercado Pago |
| Tests | pytest (backend) · Jest + Testing Library (frontend) |
| Deploy | Frontend en Cloudflare Workers · Backend en Railway |

## Estructura

```
CODE_CYANEA/
├─ backend/
│  ├─ app/               # api/routes, models, schemas, services, db
│  ├─ alembic/           # migraciones
│  ├─ scripts/sql/       # scripts SQL y datos maestros
│  ├─ tests/             # tests de integración (pytest)
│  └─ pyproject.toml
├─ frontend/
│  ├─ src/               # screens, components, navigation, services, theme
│  │  └─ tests/          # tests del frontend (Jest)
│  └─ jest.setup.js      # mocks globales de los tests
├─ docs/                 # guías de testing
├─ .github/workflows/    # CI: tests del backend y del frontend en cada push/PR
├─ docker-compose.yml    # PostgreSQL + backend + Mailpit
├─ AGENTS.md             # convenciones y decisiones técnicas
└─ README.md
```

## Arranque local

Requisitos: Python 3.12, Node.js ≥ 20.19.4 y PostgreSQL 16.

### Backend

**Windows**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
copy .env.example .env
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Linux / macOS**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm run web
```

Variable necesaria en `frontend/.env`:
```
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

Si la web muestra una versión vieja después de un cambio, usá `npm run web:clear` o recargá con Ctrl+Shift+R. La app es una PWA y el navegador puede tener guardada la versión anterior.
Los tests del frontend también corren automáticamente en cada push y PR con GitHub Actions (`.github/workflows/frontend-test.yml`).

### Con Docker

`docker-compose.yml` levanta **PostgreSQL, el backend y Mailpit** (servidor de correo de prueba). El frontend se corre aparte con `npm run web`.

```bash
cp backend/.env.example backend/.env   # obligatorio antes de levantar
docker compose up
```

### Servicios locales

| Servicio | URL |
|---|---|
| Frontend web | http://localhost:8081 |
| Backend | http://127.0.0.1:8000 |
| Swagger (docs API) | http://127.0.0.1:8000/docs |
| Mailpit (correos de prueba) | http://localhost:8025 |

## Tests

### Backend

Tests de integración con `pytest` sobre SQLite en memoria, así que no hace falta Postgres. La estrategia completa está en [`docs/testing-backend.md`](docs/testing-backend.md).

```bash
cd backend
python -m pytest -v
python -m pytest tests/test_backoffice_metricas.py               # un archivo
python -m pytest -k "liquidacion"                                # por nombre
python -m pytest --cov=app --cov-report=term-missing             # con cobertura
```

La suite completa tarda más de 20 minutos. Mientras desarrollás, corré solo el archivo que tocaste.

Los tests del backend corren automáticamente en cada push y PR con GitHub Actions (`.github/workflows/backend-tests.yml`).

### Frontend

Tests con **Jest** (preset `jest-expo`) y **React Native Testing Library**. No necesitan backend, emulador ni navegador: las llamadas a la API se simulan y los módulos nativos se reemplazan por mocks en `frontend/jest.setup.js`. La estrategia completa está en [`docs/testing-frontend.md`](docs/testing-frontend.md).

```bash
cd frontend
npm test                                  # todos los tests
npm test -- SettlementBalances            # un archivo (por nombre)
npm test -- -t "por etapa"                # tests cuyo nombre coincide
npm run test:watch                        # se vuelven a correr al guardar
npm run test:coverage                     # con reporte de cobertura
npm run test:slow                         # en serie (--runInBand), para máquinas lentas o tests inestables
```

- Los tests viven en `frontend/src/tests/`. Los del backoffice están en `frontend/src/tests/backoffice/` y las utilidades compartidas, en `frontend/src/tests/helpers/`.
- El tiempo máximo por test es de 20 segundos (`testTimeout`).
- La cobertura mínima global es del **30 % de sentencias**. `npm run test:coverage` falla si baja de ese valor. No se miden los tests, los archivos `*.native.js` ni `src/theme/`.
- `jest.setup.js` simula `@react-native-community/netinfo` (siempre con conexión), `expo-sqlite`, `expo-font`, `@react-navigation/bottom-tabs`, `react-native-safe-area-context` y el mapa de países del perfil.

Los tests del frontend todavía no corren en GitHub Actions, así que conviene ejecutarlos antes de cada push.

## Documentación para colaboradores

Antes de trabajar en el proyecto, leer:

- [`AGENTS.md`](AGENTS.md): convenciones de naming, reglas de base de datos, estructura, criterios de frontend y de testing.
- [`docs/testing-backend.md`](docs/testing-backend.md): estrategia de testing del backend.
- [`docs/testing-frontend.md`](docs/testing-frontend.md): estrategia de testing del frontend.