CREATE TABLE IF NOT EXISTS public."EstadosInvitaciones" (
    "IdEstadoInvitacion" SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL,
    "Descripcion" VARCHAR(200) NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_EstadosInvitaciones_Nombre"
    ON public."EstadosInvitaciones" ("Nombre");
