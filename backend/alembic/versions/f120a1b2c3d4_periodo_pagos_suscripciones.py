"""US 120: período que paga cada cobro de la suscripción."""

from alembic import op
import sqlalchemy as sa

revision = "f120a1b2c3d4"
down_revision = "c127a0f1d2e3"
branch_labels = None
depends_on = None

# Encadena los pagos de cada suscripción por fecha, igual que _activar y _renovar:
# hasta el primer aprobado cada cobro intenta pagar desde su propia fecha; después,
# un aprobado paga el período siguiente al anterior y un rechazado o pendiente
# intenta pagar el mismo período que el cobro previo. Los meses se suman en UTC.
# Sin MesesPeriodo (históricos) el período queda NULL.
BACKFILL = """
WITH RECURSIVE ordenados AS (
    SELECT p."IdPagoSuscripcion" AS id,
           p."IdSuscripcionUsuario" AS suscripcion,
           p."FechaPago" AS fecha,
           ep."Nombre" = 'aprobado' AS aprobado,
           s."MesesPeriodo" AS meses,
           ROW_NUMBER() OVER (
               PARTITION BY p."IdSuscripcionUsuario"
               ORDER BY p."FechaPago", p."IdPagoSuscripcion"
           ) AS n
    FROM "PagosSuscripciones" p
    JOIN "EstadosPagosSuscripciones" ep
      ON ep."IdEstadoPagoSuscripcion" = p."IdEstadoPagoSuscripcion"
    JOIN "SuscripcionesUsuarios" s
      ON s."IdSuscripcionUsuario" = p."IdSuscripcionUsuario"
    WHERE s."MesesPeriodo" IS NOT NULL
),
cadena AS (
    SELECT o.id, o.suscripcion, o.n, o.aprobado,
           o.fecha AS desde,
           ((o.fecha AT TIME ZONE 'UTC') + make_interval(months => o.meses))
               AT TIME ZONE 'UTC' AS hasta,
           o.aprobado AS hubo_aprobado
    FROM ordenados o
    WHERE o.n = 1
    UNION ALL
    SELECT o.id, o.suscripcion, o.n, o.aprobado,
           CASE
               WHEN NOT c.hubo_aprobado THEN o.fecha
               WHEN c.aprobado THEN c.hasta
               ELSE c.desde
           END,
           CASE
               WHEN NOT c.hubo_aprobado THEN
                   ((o.fecha AT TIME ZONE 'UTC') + make_interval(months => o.meses))
                       AT TIME ZONE 'UTC'
               WHEN c.aprobado THEN
                   ((c.hasta AT TIME ZONE 'UTC') + make_interval(months => o.meses))
                       AT TIME ZONE 'UTC'
               ELSE c.hasta
           END,
           c.hubo_aprobado OR o.aprobado
    FROM cadena c
    JOIN ordenados o ON o.suscripcion = c.suscripcion AND o.n = c.n + 1
)
UPDATE "PagosSuscripciones" p
SET "PeriodoDesde" = c.desde, "PeriodoHasta" = c.hasta
FROM cadena c
WHERE p."IdPagoSuscripcion" = c.id
  AND p."PeriodoDesde" IS NULL
"""


def upgrade():
    op.add_column(
        "PagosSuscripciones",
        sa.Column("PeriodoDesde", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "PagosSuscripciones",
        sa.Column("PeriodoHasta", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(BACKFILL)
    op.create_check_constraint(
        "CK_PagosSuscripciones_Periodo",
        "PagosSuscripciones",
        '("PeriodoDesde" IS NULL AND "PeriodoHasta" IS NULL) '
        'OR "PeriodoHasta" > "PeriodoDesde"',
    )


def downgrade():
    op.execute(
        'ALTER TABLE "PagosSuscripciones" DROP CONSTRAINT IF EXISTS "CK_PagosSuscripciones_Periodo"'
    )
    op.execute('ALTER TABLE "PagosSuscripciones" DROP COLUMN IF EXISTS "PeriodoHasta"')
    op.execute('ALTER TABLE "PagosSuscripciones" DROP COLUMN IF EXISTS "PeriodoDesde"')
