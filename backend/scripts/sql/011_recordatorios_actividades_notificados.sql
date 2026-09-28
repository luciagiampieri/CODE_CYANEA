CREATE TABLE IF NOT EXISTS public."RecordatoriosActividadesNotificados" (
    "IdRecordatorioActividadNotificado" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "IdActividad" BIGINT NOT NULL,
    "Tipo" VARCHAR(50) NOT NULL,
    "MinutosAntes" INTEGER NOT NULL,
    "FechaNotificacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_RecordatoriosActNotif_ActividadesItinerario_IdActividad"
        FOREIGN KEY ("IdActividad")
        REFERENCES public."ActividadesItinerario" ("IdActividad")
        ON DELETE CASCADE,
    CONSTRAINT "UX_RecordatoriosActividadesNotificados_Actividad_Tipo_Minutos"
        UNIQUE ("IdActividad", "Tipo", "MinutosAntes")
);
