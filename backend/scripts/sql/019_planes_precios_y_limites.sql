-- US 112. Complemento para instalaciones manuales; preferir Alembic.
BEGIN;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Planes' AND column_name = 'MaxEscaneosSemanales')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Planes' AND column_name = 'MaxEscaneosMensuales') THEN
        ALTER TABLE "Planes" RENAME COLUMN "MaxEscaneosSemanales" TO "MaxEscaneosMensuales";
    END IF;
END $$;
ALTER TABLE "Planes" ADD COLUMN IF NOT EXISTS "PrecioMensualARS" NUMERIC(12,2) CHECK ("PrecioMensualARS" > 0);
ALTER TABLE "Planes" ADD COLUMN IF NOT EXISTS "PrecioAnualARS" NUMERIC(12,2) CHECK ("PrecioAnualARS" > 0);
ALTER TABLE "SuscripcionesUsuarios" ADD COLUMN IF NOT EXISTS "PrecioPeriodoARS" NUMERIC(12,2) CHECK ("PrecioPeriodoARS" > 0);
ALTER TABLE "SuscripcionesUsuarios" ADD COLUMN IF NOT EXISTS "MesesPeriodo" INTEGER CHECK ("MesesPeriodo" IN (1,12));
CREATE TABLE IF NOT EXISTS "AuditoriaPlanes" (
    "IdAuditoriaPlan" SERIAL PRIMARY KEY,
    "IdPlan" INTEGER NOT NULL REFERENCES "Planes"("IdPlan"),
    "IdAdministrador" INTEGER NOT NULL REFERENCES "Usuarios"("IdUsuario"),
    "Campo" VARCHAR(50) NOT NULL,
    "ValorAnterior" VARCHAR(50),
    "ValorNuevo" VARCHAR(50) NOT NULL,
    "DireccionIp" VARCHAR(45),
    "FechaHora" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_AuditoriaPlanes_FechaHora" ON "AuditoriaPlanes"("FechaHora");
COMMIT;
