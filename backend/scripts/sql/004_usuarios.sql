CREATE TABLE IF NOT EXISTS public."Usuarios" (
    "IdUsuario" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Email" VARCHAR(255) NOT NULL,
    "Nombre" VARCHAR(100) NOT NULL,
    "Apellido" VARCHAR(100) NOT NULL,
    "NombreUsuario" VARCHAR(50) NOT NULL,
    "FotoUrl" TEXT NULL,
    "FechaAlta" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "FechaBaja" TIMESTAMPTZ NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_Usuarios_Email"
    ON public."Usuarios" ("Email");

CREATE UNIQUE INDEX IF NOT EXISTS "UX_Usuarios_NombreUsuario"
    ON public."Usuarios" ("NombreUsuario");
