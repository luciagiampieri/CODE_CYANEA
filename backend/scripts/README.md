# Scripts SQL

Esta carpeta contiene scripts SQL idempotentes para crear estructuras base del dominio.

## Criterio de organización

- Un archivo por tabla cuando la estructura es acotada y tiene una responsabilidad clara.
- Prefijos numéricos para asegurar el orden de ejecución.
- Un `run_all.sql` para ejecutar todo el modelo mínimo en el orden correcto.

## Orden actual

1. `001_estados_viajes.sql`
2. `002_roles_participantes.sql`
3. `003_estados_participaciones.sql`
4. `004_usuarios.sql`
5. `005_viajes.sql`
6. `006_participantes_viajes.sql`
7. `007_datos_maestros.sql`
8. `008_seed_minimo.sql`

## Recomendación

Para este proyecto, separar por tabla es una buena forma de ordenarlo porque:

- hace más fácil revisar cambios de dominio
- evita mezclar restricciones de entidades distintas
- simplifica iteraciones por historia de usuario

La condición para que siga siendo mantenible es conservar un script maestro y respetar dependencias.

## Scripts auxiliares

- `run_all.sql`: crea todo el esquema y carga catálogos + seed mínimo.
- `reset_dev.sql`: elimina el esquema del dominio para recrearlo en desarrollo.
