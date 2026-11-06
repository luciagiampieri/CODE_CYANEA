BEGIN;
-- US 136: traslados por tramo del recorrido y categorías de actividades.

CREATE TABLE IF NOT EXISTS "TiposTramosTraslados" (
    "IdTipoTramoTraslado" INTEGER PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL UNIQUE,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO "TiposTramosTraslados" ("IdTipoTramoTraslado", "Nombre")
VALUES (1, 'ida'), (2, 'entre_destinos'), (3, 'regreso')
ON CONFLICT ("IdTipoTramoTraslado") DO NOTHING;

CREATE TABLE IF NOT EXISTS "TramosTrasladosViajes" (
    "IdTramoTraslado" SERIAL PRIMARY KEY,
    "IdViaje" INTEGER NOT NULL,
    "IdTipoTramoTraslado" INTEGER NOT NULL,
    "IdDestinoOrigen" INTEGER,
    "IdDestinoLlegada" INTEGER,
    "Oculto" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "FK_TramosTrasladosViajes_Viajes_IdViaje"
        FOREIGN KEY ("IdViaje") REFERENCES "Viajes" ("IdViaje") ON DELETE CASCADE,
    CONSTRAINT "FK_TramosTrasladosViajes_TiposTramos_IdTipo"
        FOREIGN KEY ("IdTipoTramoTraslado") REFERENCES "TiposTramosTraslados" ("IdTipoTramoTraslado"),
    CONSTRAINT "FK_TramosTrasladosViajes_Destinos_IdOrigen"
        FOREIGN KEY ("IdDestinoOrigen") REFERENCES "Destinos" ("IdDestino"),
    CONSTRAINT "FK_TramosTrasladosViajes_Destinos_IdLlegada"
        FOREIGN KEY ("IdDestinoLlegada") REFERENCES "Destinos" ("IdDestino"),
    CONSTRAINT "CK_TramosTrasladosViajes_Destinos" CHECK (
        ("IdTipoTramoTraslado" = 2 AND "IdDestinoOrigen" IS NOT NULL AND "IdDestinoLlegada" IS NOT NULL)
        OR ("IdTipoTramoTraslado" <> 2 AND "IdDestinoOrigen" IS NULL AND "IdDestinoLlegada" IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_TramosTrasladosViajes_Viaje_Tipo"
    ON "TramosTrasladosViajes" ("IdViaje", "IdTipoTramoTraslado")
    WHERE "IdTipoTramoTraslado" <> 2;
CREATE UNIQUE INDEX IF NOT EXISTS "UX_TramosTrasladosViajes_Viaje_Par"
    ON "TramosTrasladosViajes" ("IdViaje", "IdDestinoOrigen", "IdDestinoLlegada")
    WHERE "IdTipoTramoTraslado" = 2;

ALTER TABLE "ActividadesItinerario" ADD COLUMN IF NOT EXISTS "IdTramoTraslado" INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FK_ActIt_TramosTraslados_IdTramoTraslado'
    ) THEN
        ALTER TABLE "ActividadesItinerario" ADD CONSTRAINT "FK_ActIt_TramosTraslados_IdTramoTraslado"
            FOREIGN KEY ("IdTramoTraslado") REFERENCES "TramosTrasladosViajes" ("IdTramoTraslado")
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UX_ActividadesItinerario_IdTramoTraslado'
    ) THEN
        ALTER TABLE "ActividadesItinerario" ADD CONSTRAINT "UX_ActividadesItinerario_IdTramoTraslado"
            UNIQUE ("IdTramoTraslado");
    END IF;
END $$;

ALTER TABLE "ActividadesItinerario" DROP CONSTRAINT IF EXISTS "CK_ActividadesItinerario_Horarios";
ALTER TABLE "ActividadesItinerario" ADD CONSTRAINT "CK_ActividadesItinerario_Horarios"
    CHECK ("HoraFin" > "HoraInicio" OR "IdTramoTraslado" IS NOT NULL);

-- Vuelo (plane) y Traslado (car) dejan de ser categorías. Si la actividad cae en un día de
-- traslado y el tramo sigue libre, se convierte en su traslado; si no, pasa a "Otro". La
-- misma regla que `convertir_actividades` de la migración c136a1b2c3d4.
DO $$
DECLARE
    a RECORD;
    v_tipo INTEGER;
    v_origen INTEGER;
    v_llegada INTEGER;
    v_destino TEXT;
    v_id_tramo INTEGER;
    v_medio TEXT;
    v_nombre TEXT;
BEGIN
    FOR a IN
        SELECT act."IdActividad", act."Nombre", act."Descripcion", act."HoraInicio", act."HoraFin",
               act."Icono", dia."Fecha", v."IdViaje", v."FechaInicio", v."FechaFin"
        FROM "ActividadesItinerario" act
        JOIN "DiasCronogramas" dia ON dia."IdDiaCronograma" = act."IdDiaCronograma"
        JOIN "Viajes" v ON v."IdViaje" = dia."IdViaje"
        WHERE act."Icono" IN ('plane', 'car') AND act."IdTramoTraslado" IS NULL
        ORDER BY v."IdViaje", dia."Fecha", act."HoraInicio", act."IdActividad"
    LOOP
        v_tipo := NULL;
        v_origen := NULL;
        v_llegada := NULL;
        v_destino := NULL;

        IF a."Fecha" = a."FechaInicio"
            AND EXISTS (SELECT 1 FROM "DestinosViajes" d WHERE d."IdViaje" = a."IdViaje")
            AND NOT EXISTS (
                SELECT 1 FROM "TramosTrasladosViajes" t
                WHERE t."IdViaje" = a."IdViaje" AND t."IdTipoTramoTraslado" = 1
            )
        THEN
            v_tipo := 1;
            SELECT des."Nombre" INTO v_destino
            FROM "DestinosViajes" d
            JOIN "Destinos" des ON des."IdDestino" = d."IdDestino"
            WHERE d."IdViaje" = a."IdViaje"
            ORDER BY d."Orden", d."IdDestino"
            LIMIT 1;
        END IF;

        IF v_tipo IS NULL THEN
            SELECT r."IdDestino", r."Siguiente", des."Nombre"
            INTO v_origen, v_llegada, v_destino
            FROM (
                SELECT d."IdDestino",
                       LEAD(d."IdDestino") OVER w AS "Siguiente",
                       COUNT(*) OVER todos AS "Cantidad",
                       COUNT(d."Noches") OVER todos AS "ConNoches",
                       a."FechaInicio"
                           + (SUM(COALESCE(d."Noches", 0) + d."NochesEnViaje") OVER w)::INTEGER
                           - d."NochesEnViaje" AS "Salida"
                FROM "DestinosViajes" d
                WHERE d."IdViaje" = a."IdViaje"
                WINDOW w AS (ORDER BY d."Orden", d."IdDestino"), todos AS ()
            ) r
            JOIN "Destinos" des ON des."IdDestino" = r."Siguiente"
            WHERE r."Cantidad" > 1
              AND r."ConNoches" = r."Cantidad"
              AND r."Salida" = a."Fecha"
              AND NOT EXISTS (
                  SELECT 1 FROM "TramosTrasladosViajes" t
                  WHERE t."IdViaje" = a."IdViaje"
                    AND t."IdTipoTramoTraslado" = 2
                    AND t."IdDestinoOrigen" = r."IdDestino"
                    AND t."IdDestinoLlegada" = r."Siguiente"
              )
            LIMIT 1;

            IF v_origen IS NOT NULL THEN
                v_tipo := 2;
            END IF;
        END IF;

        IF v_tipo IS NULL
            AND a."Fecha" = a."FechaFin"
            AND EXISTS (SELECT 1 FROM "DestinosViajes" d WHERE d."IdViaje" = a."IdViaje")
            AND NOT EXISTS (
                SELECT 1 FROM "TramosTrasladosViajes" t
                WHERE t."IdViaje" = a."IdViaje" AND t."IdTipoTramoTraslado" = 3
            )
        THEN
            v_tipo := 3;
        END IF;

        IF v_tipo IS NULL THEN
            UPDATE "ActividadesItinerario"
            SET "Icono" = 'location-dot'
            WHERE "IdActividad" = a."IdActividad";
            CONTINUE;
        END IF;

        v_medio := CASE a."Icono" WHEN 'plane' THEN 'Avión' ELSE 'Auto' END;
        v_nombre := CASE
            WHEN v_tipo = 3 THEN v_medio || ' de regreso'
            ELSE LEFT(v_medio || ' a ' || v_destino, 150)
        END;

        INSERT INTO "TramosTrasladosViajes" (
            "IdViaje", "IdTipoTramoTraslado", "IdDestinoOrigen", "IdDestinoLlegada"
        )
        VALUES (a."IdViaje", v_tipo, v_origen, v_llegada)
        RETURNING "IdTramoTraslado" INTO v_id_tramo;

        UPDATE "ActividadesItinerario"
        SET "IdTramoTraslado" = v_id_tramo,
            "Nombre" = v_nombre,
            "Descripcion" = CASE
                WHEN a."Nombre" = v_nombre THEN a."Descripcion"
                WHEN a."Descripcion" IS NOT NULL AND BTRIM(a."Descripcion") <> ''
                    THEN a."Descripcion" || E'\n' || a."Nombre"
                ELSE a."Nombre"
            END,
            "HoraInicio" = CASE WHEN v_tipo = 1 THEN a."HoraFin" ELSE a."HoraInicio" END,
            "HoraFin" = CASE WHEN v_tipo = 3 THEN a."HoraInicio" ELSE a."HoraFin" END,
            "TipoAdvertenciaHorario" = NULL,
            "AdvertenciaHorario" = NULL
        WHERE "IdActividad" = a."IdActividad";
    END LOOP;
END $$;
COMMIT;
