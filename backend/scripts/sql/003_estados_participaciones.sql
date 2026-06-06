CREATE TABLE IF NOT EXISTS public."EstadosParticipaciones" (
    "IdEstadoParticipacion" SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL,
    "Descripcion" VARCHAR(200) NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_EstadosParticipaciones_Nombre"
    ON public."EstadosParticipaciones" ("Nombre");
