BEGIN;
ALTER TABLE "SuscripcionesUsuarios" ADD COLUMN IF NOT EXISTS "FechaPendientePago" TIMESTAMPTZ;

UPDATE "SuscripcionesUsuarios" s SET "FechaPendientePago" = s."FechaFin"
FROM "EstadosSuscripciones" e
WHERE e."IdEstadoSuscripcion" = s."IdEstadoSuscripcion"
  AND e."Nombre" = 'pendiente_pago'
  AND s."FechaPendientePago" IS NULL
  AND EXISTS (
      SELECT 1 FROM "PagosSuscripciones" p
      JOIN "EstadosPagosSuscripciones" ep
        ON ep."IdEstadoPagoSuscripcion" = p."IdEstadoPagoSuscripcion"
      WHERE p."IdSuscripcionUsuario" = s."IdSuscripcionUsuario"
        AND ep."Nombre" = 'aprobado'
  );

CREATE INDEX IF NOT EXISTS "IX_SuscripcionesUsuarios_FechaPendientePago"
    ON "SuscripcionesUsuarios" ("FechaPendientePago");

CREATE TABLE IF NOT EXISTS "EstadosNotificacionesPasarela" (
    "IdEstadoNotificacionPasarela" SERIAL PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL UNIQUE,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO "EstadosNotificacionesPasarela" ("Nombre")
SELECT nombre FROM (VALUES ('procesada'), ('ignorada'), ('error')) AS v(nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM "EstadosNotificacionesPasarela" e WHERE e."Nombre" = v.nombre
);

CREATE TABLE IF NOT EXISTS "NotificacionesPasarela" (
    "IdNotificacionPasarela" SERIAL PRIMARY KEY,
    "IdEstadoNotificacionPasarela" INTEGER NOT NULL
        REFERENCES "EstadosNotificacionesPasarela" ("IdEstadoNotificacionPasarela"),
    "Tipo" VARCHAR(60) NOT NULL,
    "IdRecurso" VARCHAR(150) NOT NULL,
    "IdSolicitudPasarela" VARCHAR(150),
    "Error" VARCHAR(500),
    "FechaRecepcion" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IX_NotificacionesPasarela_Estado_Fecha"
    ON "NotificacionesPasarela" ("IdEstadoNotificacionPasarela", "FechaRecepcion");
CREATE INDEX IF NOT EXISTS "IX_NotificacionesPasarela_Recurso"
    ON "NotificacionesPasarela" ("Tipo", "IdRecurso");
COMMIT;
