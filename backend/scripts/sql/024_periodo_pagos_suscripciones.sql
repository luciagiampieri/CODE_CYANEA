BEGIN;
-- US 120: período que paga (o intentaba pagar) cada cobro de la suscripción.
ALTER TABLE "PagosSuscripciones" ADD COLUMN IF NOT EXISTS "PeriodoDesde" TIMESTAMPTZ;
ALTER TABLE "PagosSuscripciones" ADD COLUMN IF NOT EXISTS "PeriodoHasta" TIMESTAMPTZ;

-- Backfill: hasta el primer aprobado cada cobro intenta pagar desde su propia fecha;
-- después, un aprobado paga el período siguiente al anterior y un rechazado o
-- pendiente intenta pagar el mismo período que el cobro previo. Los meses se suman
-- en UTC. Sin MesesPeriodo (históricos) el período queda NULL.
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
  AND p."PeriodoDesde" IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CK_PagosSuscripciones_Periodo'
    ) THEN
        ALTER TABLE "PagosSuscripciones" ADD CONSTRAINT "CK_PagosSuscripciones_Periodo"
            CHECK (("PeriodoDesde" IS NULL AND "PeriodoHasta" IS NULL)
                   OR "PeriodoHasta" > "PeriodoDesde");
    END IF;
END $$;
COMMIT;
