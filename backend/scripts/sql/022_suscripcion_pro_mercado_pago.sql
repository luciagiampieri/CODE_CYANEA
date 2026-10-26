BEGIN;
INSERT INTO "EstadosSuscripciones" ("Nombre", "Descripcion", "Activo")
SELECT 'descartada', 'Intento de suscripcion sin pago que no se concreto.', TRUE
WHERE NOT EXISTS (SELECT 1 FROM "EstadosSuscripciones" WHERE "Nombre" = 'descartada');

ALTER TABLE "SuscripcionesUsuarios" ADD COLUMN IF NOT EXISTS "IdSuscripcionPasarela" VARCHAR(150);
ALTER TABLE "SuscripcionesUsuarios" ADD COLUMN IF NOT EXISTS "EstadoPasarela" VARCHAR(30);
ALTER TABLE "SuscripcionesUsuarios" ADD COLUMN IF NOT EXISTS "FechaAceptacionRenovacion" TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UQ_SuscripcionesUsuarios_IdSuscripcionPasarela'
    ) THEN
        ALTER TABLE "SuscripcionesUsuarios"
            ADD CONSTRAINT "UQ_SuscripcionesUsuarios_IdSuscripcionPasarela"
            UNIQUE ("IdSuscripcionPasarela");
    END IF;
END $$;
COMMIT;
