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
- `trips`: creación, listado, detalle, actualización, eliminación,
  autenticación requerida, control de admin.
- `gastos`: gasto individual, rechazo de fecha futura, validación de montos
  personalizados.
- `votaciones`: creación, validaciones (mínimo de propuestas, fecha futura),
  control de membresía, emisión de voto, rechazo de doble voto.

## Pendiente / fuera de alcance por ahora

- Eliminar y editar gastos: no implementado todavía en el backend (no hay
  endpoint), por lo tanto no hay tests. Agregar cuando se implemente la
  funcionalidad.
- Eliminar y editar votaciones: idem.
- Tests end-to-end (frontend + backend integrados): fuera de alcance de este
  sprint, se prioriza cobertura de backend.

## Hallazgos detectados mediante testing

Durante la escritura de estos tests se encontraron y corrigieron/documentaron:
- Falta de verificación de membresía en `GET /gastos/trips/{trip_id}/participants`
  (corregido).
- Ruta duplicada en `GET /votaciones/{id}/resultados` (documentado en issue de
  GitHub, pendiente de corrección coordinada con el frontend).