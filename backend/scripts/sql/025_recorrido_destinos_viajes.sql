BEGIN;
-- US A: orden, noches y noches en viaje (hacia el destino siguiente) del recorrido.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'DestinosViajes' AND column_name = 'Orden'
    ) THEN
        ALTER TABLE "DestinosViajes" ADD COLUMN "Orden" INTEGER NOT NULL DEFAULT 0;

        -- Hasta ahora no se guardaba un orden: ctid es lo más cercano al orden de carga.
        UPDATE "DestinosViajes" dv
        SET "Orden" = o.orden
        FROM (
            SELECT "IdViaje", "IdDestino",
                   ROW_NUMBER() OVER (PARTITION BY "IdViaje" ORDER BY ctid) - 1 AS orden
            FROM "DestinosViajes"
        ) o
        WHERE dv."IdViaje" = o."IdViaje" AND dv."IdDestino" = o."IdDestino";
    END IF;
END $$;

-- Las noches quedan en NULL: los viajes existentes no se reparten automáticamente.
ALTER TABLE "DestinosViajes" ADD COLUMN IF NOT EXISTS "Noches" INTEGER;
ALTER TABLE "DestinosViajes" ADD COLUMN IF NOT EXISTS "NochesEnViaje" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CK_DestinosViajes_Noches'
    ) THEN
        ALTER TABLE "DestinosViajes" ADD CONSTRAINT "CK_DestinosViajes_Noches"
            CHECK ("Noches" IS NULL OR "Noches" >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CK_DestinosViajes_NochesEnViaje'
    ) THEN
        ALTER TABLE "DestinosViajes" ADD CONSTRAINT "CK_DestinosViajes_NochesEnViaje"
            CHECK ("NochesEnViaje" >= 0);
    END IF;
END $$;
COMMIT;
