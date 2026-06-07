CREATE TABLE IF NOT EXISTS public."Viajes" (
    "IdViaje" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Titulo" VARCHAR(150) NOT NULL,
    "Destino" VARCHAR(150) NOT NULL,
    "Descripcion" TEXT NULL,
    "FechaInicio" DATE NULL,
    "FechaFin" DATE NULL,
    "IdEstadoViaje" SMALLINT NOT NULL,
    "Moneda" VARCHAR(3) NOT NULL DEFAULT 'ARS',
    "IdAdministrador" BIGINT NOT NULL,
    "FechaCreacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "FechaActualizacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "FK_Viajes_EstViajes_IdEstadoViaje"
        FOREIGN KEY ("IdEstadoViaje")
        REFERENCES public."EstadosViajes" ("IdEstadoViaje"),
    CONSTRAINT "FK_Viajes_Usuarios_IdAdministrador"
        FOREIGN KEY ("IdAdministrador")
        REFERENCES public."Usuarios" ("IdUsuario"),
    CONSTRAINT "CK_Viajes_Fechas"
        CHECK ("FechaFin" IS NULL OR "FechaInicio" IS NULL OR "FechaFin" >= "FechaInicio")
);

CREATE INDEX IF NOT EXISTS "IX_Viajes_IdEstadoViaje"
    ON public."Viajes" ("IdEstadoViaje");

CREATE INDEX IF NOT EXISTS "IX_Viajes_IdAdministrador"
    ON public."Viajes" ("IdAdministrador");
