ALTER TABLE "Planes" ALTER COLUMN "MaxParticipantesViaje" DROP NOT NULL;
ALTER TABLE "Planes" ADD COLUMN IF NOT EXISTS "MaxViajesActivos" INTEGER;
ALTER TABLE "Planes" ADD COLUMN IF NOT EXISTS "MaxSugerenciasDiarias" INTEGER;
ALTER TABLE "Planes" ADD COLUMN IF NOT EXISTS "MaxEscaneosSemanales" INTEGER;
ALTER TABLE "Planes" ADD COLUMN IF NOT EXISTS "MaxAlmacenamientoMb" INTEGER;

UPDATE "Planes" SET "MaxViajesActivos" = 5, "MaxSugerenciasDiarias" = 10,
    "MaxEscaneosSemanales" = 3, "MaxAlmacenamientoMb" = 100
WHERE "Nombre" = 'gratuito' AND "MaxViajesActivos" IS NULL;
UPDATE "Planes" SET "MaxParticipantesViaje"= 10, "MaxViajesActivos" = 15, "MaxSugerenciasDiarias" = 20,
    "MaxEscaneosSemanales" = 50, "MaxAlmacenamientoMb" = 2048
WHERE "Nombre" = 'pro' AND "MaxViajesActivos" IS NULL;

CREATE TABLE IF NOT EXISTS "EstadosSuscripciones" (
    "IdEstadoSuscripcion" SERIAL PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL UNIQUE,
    "Descripcion" VARCHAR(200),
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO "EstadosSuscripciones" ("Nombre", "Descripcion")
SELECT datos."Nombre", datos."Descripcion"
FROM (VALUES
    ('activa', 'Suscripcion vigente con renovacion activa.'),
    ('cancelada', 'Renovacion cancelada; vigente hasta FechaFin.'),
    ('vencida', 'Suscripcion finalizada; el usuario vuelve al plan gratuito.')
) AS datos("Nombre", "Descripcion")
WHERE NOT EXISTS (SELECT 1 FROM "EstadosSuscripciones" e WHERE e."Nombre" = datos."Nombre");

CREATE TABLE IF NOT EXISTS "SuscripcionesUsuarios" (
    "IdSuscripcionUsuario" SERIAL PRIMARY KEY,
    "IdUsuario" INTEGER NOT NULL REFERENCES "Usuarios" ("IdUsuario"),
    "IdPlan" INTEGER NOT NULL REFERENCES "Planes" ("IdPlan"),
    "IdEstadoSuscripcion" INTEGER NOT NULL REFERENCES "EstadosSuscripciones" ("IdEstadoSuscripcion"),
    "FechaInicio" TIMESTAMPTZ NOT NULL,
    "FechaFin" TIMESTAMPTZ NOT NULL,
    "FechaCancelacion" TIMESTAMPTZ,
    "FechaCreacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "CK_SuscripcionesUsuarios_Fechas" CHECK ("FechaFin" > "FechaInicio")
);
CREATE INDEX IF NOT EXISTS "IX_SuscripcionesUsuarios_Usuario_Estado"
    ON "SuscripcionesUsuarios" ("IdUsuario", "IdEstadoSuscripcion");
CREATE INDEX IF NOT EXISTS "IX_SuscripcionesUsuarios_Estado_FechaFin"
    ON "SuscripcionesUsuarios" ("IdEstadoSuscripcion", "FechaFin");