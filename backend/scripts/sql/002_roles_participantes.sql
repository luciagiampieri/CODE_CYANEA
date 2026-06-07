CREATE TABLE IF NOT EXISTS public."RolesParticipantes" (
    "IdRolParticipante" SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL,
    "Descripcion" VARCHAR(200) NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_RolesParticipantes_Nombre"
    ON public."RolesParticipantes" ("Nombre");
