-- US 113: estructura de consulta; no crea cobros ni datos de tarjetas.
BEGIN;
INSERT INTO "EstadosSuscripciones" ("Nombre", "Descripcion", "Activo")
SELECT 'pendiente_pago', 'Suscripcion pendiente de confirmacion de pago.', TRUE
WHERE NOT EXISTS (SELECT 1 FROM "EstadosSuscripciones" WHERE "Nombre" = 'pendiente_pago');
CREATE TABLE IF NOT EXISTS "EstadosPagosSuscripciones" (
    "IdEstadoPagoSuscripcion" SERIAL PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL UNIQUE,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO "EstadosPagosSuscripciones" ("Nombre")
SELECT nombre FROM (VALUES ('aprobado'), ('rechazado'), ('pendiente')) AS datos(nombre)
WHERE NOT EXISTS (SELECT 1 FROM "EstadosPagosSuscripciones" e WHERE e."Nombre" = datos.nombre);
CREATE TABLE IF NOT EXISTS "PagosSuscripciones" (
    "IdPagoSuscripcion" SERIAL PRIMARY KEY,
    "IdSuscripcionUsuario" INTEGER NOT NULL REFERENCES "SuscripcionesUsuarios"("IdSuscripcionUsuario"),
    "IdEstadoPagoSuscripcion" INTEGER NOT NULL REFERENCES "EstadosPagosSuscripciones"("IdEstadoPagoSuscripcion"),
    "FechaPago" TIMESTAMPTZ NOT NULL,
    "MontoARS" NUMERIC(12,2) NOT NULL CHECK ("MontoARS" > 0),
    "IdOperacionPasarela" VARCHAR(150) UNIQUE
);
CREATE INDEX IF NOT EXISTS "ix_PagosSuscripciones_IdSuscripcionUsuario" ON "PagosSuscripciones"("IdSuscripcionUsuario");
CREATE INDEX IF NOT EXISTS "ix_PagosSuscripciones_IdEstadoPagoSuscripcion" ON "PagosSuscripciones"("IdEstadoPagoSuscripcion");
CREATE INDEX IF NOT EXISTS "ix_PagosSuscripciones_FechaPago" ON "PagosSuscripciones"("FechaPago");
COMMIT;
