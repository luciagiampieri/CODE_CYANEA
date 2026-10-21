CREATE TABLE IF NOT EXISTS "EscaneosComprobantes" (
    "IdEscaneoComprobante" SERIAL PRIMARY KEY,
    "IdUsuario" INTEGER NOT NULL REFERENCES "Usuarios" ("IdUsuario"),
    "IdViaje" INTEGER NOT NULL REFERENCES "Viajes" ("IdViaje"),
    "FechaEscaneo" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IX_EscaneosComprobantes_Usuario_Fecha"
    ON "EscaneosComprobantes" ("IdUsuario", "FechaEscaneo");

ALTER TABLE "DocumentosViajes" ADD COLUMN IF NOT EXISTS "TamanoBytes" BIGINT;