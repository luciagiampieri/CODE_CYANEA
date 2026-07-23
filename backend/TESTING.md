# Estrategia de testing — Backend Cyanea

## Enfoque general

Priorizamos tests de integración sobre los endpoints de FastAPI (usando
`TestClient` + una base de datos SQLite en memoria) por sobre tests unitarios
aislados, porque la mayor parte de la lógica de negocio del proyecto vive
dentro de los handlers de las rutas (validaciones, reglas de acceso, cálculos),
no en funciones puras separadas.

No apuntamos a 100% de cobertura. Priorizamos:
1. Autenticación y control de acceso (quién puede hacer qué).
2. Validaciones de negocio con reglas no triviales (divisn de gastos, fechas
   de votaciones, plazos de edición de viajes).
3. Casos "felices" de cada endpoint principal, para detectar regresiones.

## Cómo correr los tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest -v
```

Con cobertura:
```bash
.venv\Scripts\python.exe -m pytest --cov=app --cov-report=term-missing
```

## Decisiones técnicas

### Base de datos de test: SQLite en memoria, no Postgres

Se usa `sqlite://` en memoria en vez de levantar un Postgres real. Es más
rápido y no requiere infraestructura extra para correr los tests (ni en CI ni
localmente). Los modelos no usan tipos específicos de Postgres, así que es
compatible.

**Gotcha importante:** SQLite solo autoincrementa claves primarias declaradas
como `INTEGER`. Varios modelos (`Gasto`, `Votacion`, `CategoriasGastos`, etc.)
usan `BigInteger`, que en SQLite no autoincrementa por defecto. Se resuelve
en `conftest.py` con un `@compiles` que fuerza `BigInteger -> INTEGER` solo
cuando el dialecto es SQLite (no afecta el esquema real de Postgres).

### Datos maestros (`master_data` fixture)

Muchos endpoints asumen que ciertas filas "maestras" ya existen en la base
(estados de viaje, roles de participante, estados de participación/invitación).
La fixture `master_data` los crea una sola vez por test con los valores reales
usados en el dominio (no inventados).

### Autenticación en tests

Se evita loguear via `/auth/login` en cada test. En cambio, se generan tokens
directamente con `create_access_token(...)` (la misma función que usa el
backend), y se crean usuarios directamente en la sesión de test. Esto es más
rápido y aísla los tests de auth de los tests de negocio.

## Cobertura actual

- `auth`: registro (éxito, email duplicado, password débil, sin aceptar
  términos), login (éxito, password incorrecta, email no confirmado).
- `trips`: creación, listado, detalle (éxito y no encontrado), actualización,
  eliminación, autenticación requerida, control de admin. Invitaciones:
  listado de invitaciones pendientes (solo estado "invitado", requiere auth),
  respuesta a invitación (aceptar, rechazar, invitación ya respondida,
  invitación inexistente, decisión inválida). Participantes: agregar por
  `userId` o por `email` (usuario existente vs. invitación externa nueva),
  validaciones (admin ya es parte, usuario ya agregado, invitación duplicada,
  no se puede invitar al propio admin, requiere permisos de admin), sacar
  participante (éxito, no se puede sacar al admin, no encontrado, requiere
  admin), eliminar invitación externa (éxito, no encontrada, requiere email).
- `gastos`: gasto individual, rechazo de fecha futura, división personalizada
  (éxito y montos que no coinciden), división igualitaria (entre todos, entre
  ciertos participantes elegidos, rechazo con menos de 2 participantes),
  listado de categorías (solo activas, sin auth), listado de participantes
  del viaje para asignar gastos (requiere auth, viaje inexistente, rechazo a
  no-miembros, solo incluye participantes con estado "aceptado" — test de
  regresión del bug de membresía documentado más abajo).
- `votaciones`: creación, validaciones (mínimo de propuestas, fecha futura),
  control de membresía, emisión de voto, rechazo de doble voto.
- `users`: `/me` (éxito, sin token, token inválido), listado (requiere auth,
  búsqueda por `q`, exclusión de usuarios inactivos, límite `limit`).
- `monedas`: listado ordenado, listado vacío, búsqueda por código/nombre
  (case-insensitive), búsqueda sin resultados, límite de 20 resultados.
- `itinerary` (WebSocket): conexión aceptada para admin/participante, rechazo
  con token inválido, rechazo si el viaje no existe, rechazo si el usuario no
  es participante, recepción del evento `actividad_creada` al crear una
  actividad por REST, aislamiento entre viajes distintos (no hay fuga de
  eventos entre conexiones de viajes diferentes).

## Pendiente / fuera de alcance por ahora

- Eliminar y editar gastos: no implementado todavía en el backend (no hay
  endpoint), por lo tanto no hay tests. Agregar cuando se implemente la
  funcionalidad.
- Eliminar y editar votaciones: idem.
- Tests end-to-end (frontend + backend integrados): fuera de alcance de este
  sprint, se prioriza cobertura de backend.
- Reconexión del WebSocket ante desconexiones y múltiples conexiones
  simultáneas (más de dos) al mismo viaje: se probó el caso de una conexión
  adicional recibiendo el broadcast, pero no escenarios con "n" clientes.
- `GET /trips/search` (autocompletado de destinos vía Mapbox): no tiene
  tests todavía porque llama a una API externa (`httpx.AsyncClient` contra
  Mapbox). Para testearlo sin pegarle a la red real habría que mockear
  `httpx.AsyncClient.get` (por ejemplo con `respx` o un monkeypatch manual);
  se dejó afuera de esta ronda porque no es lógica de negocio propia del
  proyecto, es un simple passthrough a un servicio externo.

## Hallazgos detectados mediante testing

Durante la escritura de estos tests se encontraron y corrigieron/documentaron:
- Falta de verificación de membresía en `GET /gastos/trips/{trip_id}/participants`
  (corregido; cubierto ahora por `test_get_trip_participants_rechaza_no_miembro`
  como test de regresión).
- Ruta duplicada en `GET /votaciones/{id}/resultados` (documentado en issue de
  GitHub, pendiente de corrección coordinada con el frontend).
- El endpoint WebSocket de `itinerary` crea su propia sesión con
  `SessionLocal()` directamente, en vez de usar la dependencia `get_db` como
  el resto de los endpoints. El override de `get_db` que usa el fixture
  `client` no alcanza al websocket: sin un ajuste adicional, sus tests
  intentarían conectarse a la base real (Postgres) en vez de a la SQLite en
  memoria de los tests. Se resuelve en `test_itinerary.py` con un fixture
  `autouse` que hace `monkeypatch.setattr(itinerary_module, "SessionLocal",
  TestingSessionLocal)`. No se tocó el código de producción; queda
  pendiente de discutir si conviene refactorizar el endpoint para que use
  `Depends(get_db)` como los demás.