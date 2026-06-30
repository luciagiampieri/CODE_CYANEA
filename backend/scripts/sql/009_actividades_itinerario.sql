CREATE TABLE IF NOT EXISTS public."ActividadesItinerario" (
    "IdActividad" SERIAL PRIMARY KEY,
    "IdDiaCronograma" INTEGER NOT NULL,
    "Nombre" VARCHAR(150) NOT NULL,
    "Descripcion" TEXT NULL,
    "HoraInicio" TIME NOT NULL,
    "HoraFin" TIME NOT NULL,
    "FechaCreacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_ActividadesItinerario_DiasCronogramas_IdDiaCronograma"
        FOREIGN KEY ("IdDiaCronograma")
        REFERENCES public."DiasCronogramas" ("IdDiaCronograma")
        ON DELETE CASCADE,
    CONSTRAINT "CK_ActividadesItinerario_Horarios"
        CHECK ("HoraFin" > "HoraInicio")
);

CREATE INDEX IF NOT EXISTS "IX_ActividadesItinerario_IdDiaCronograma"
    ON public."ActividadesItinerario" ("IdDiaCronograma");