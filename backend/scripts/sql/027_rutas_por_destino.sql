BEGIN;
-- US 138: un día de traslado sin noches en viaje tiene una ruta por destino.
ALTER TABLE "RutasDiarias" ADD COLUMN IF NOT EXISTS "IdDestino" INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_RutasDiarias_Destinos_IdDestino'
    ) THEN
        ALTER TABLE "RutasDiarias" ADD CONSTRAINT "FK_RutasDiarias_Destinos_IdDestino"
            FOREIGN KEY ("IdDestino") REFERENCES "Destinos" ("IdDestino");
    END IF;
END $$;

ALTER TABLE "RutasDiarias" DROP CONSTRAINT IF EXISTS "UQ_RutasDiarias_IdDiaCronograma";

CREATE UNIQUE INDEX IF NOT EXISTS "UX_RutasDiarias_Dia"
    ON "RutasDiarias" ("IdDiaCronograma")
    WHERE "IdDestino" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UX_RutasDiarias_Dia_Destino"
    ON "RutasDiarias" ("IdDiaCronograma", "IdDestino")
    WHERE "IdDestino" IS NOT NULL;
COMMIT;
