-- US 114: métricas de consumo de IA y umbral de costo mensual.
-- La tabla "SolicitudesIA" la crea la migración de la US 106 (a1060d4b5c7e).
CREATE TABLE IF NOT EXISTS "SolicitudesIA" (
    "IdSolicitudIA" SERIAL PRIMARY KEY,
    "Fecha" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "Servicio" VARCHAR(50) NOT NULL,
    "Modelo" VARCHAR(100) NOT NULL,
    "Exitosa" BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_SolicitudesIA_Fecha" ON "SolicitudesIA" ("Fecha");

ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "DuracionMs" INTEGER;
ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "TokensEntrada" INTEGER;
ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "TokensSalida" INTEGER;
ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "Imagenes" INTEGER;
ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "CostoEstimadoUSD" NUMERIC(12, 6) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "IX_SolicitudesIA_Servicio_Fecha" ON "SolicitudesIA" ("Servicio", "Fecha");

CREATE TABLE IF NOT EXISTS "ConfiguracionesMonitoreoIA" (
    "IdConfiguracionMonitoreoIA" INTEGER PRIMARY KEY,
    "UmbralCostoMensualUSD" NUMERIC(12, 2) NULL,
    "FechaActualizacion" TIMESTAMPTZ NULL,
    "IdUsuarioActualizacion" INTEGER NULL
        CONSTRAINT "FK_ConfiguracionesMonitoreoIA_Usuarios_IdUsuarioActualizacion"
        REFERENCES "Usuarios" ("IdUsuario"),
    "PeriodoUltimaAlerta" VARCHAR(7) NULL,
    "UmbralUltimaAlertaUSD" NUMERIC(12, 2) NULL,
    "FechaUltimaAlerta" TIMESTAMPTZ NULL,
    CONSTRAINT "CK_ConfiguracionesMonitoreoIA_Umbral"
        CHECK ("UmbralCostoMensualUSD" IS NULL OR "UmbralCostoMensualUSD" > 0)
);

INSERT INTO "ConfiguracionesMonitoreoIA" ("IdConfiguracionMonitoreoIA")
VALUES (1)
ON CONFLICT ("IdConfiguracionMonitoreoIA") DO NOTHING;
