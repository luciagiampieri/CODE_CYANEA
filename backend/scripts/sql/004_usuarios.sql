CREATE TABLE IF NOT EXISTS public."Usuarios" (
    "IdUsuario" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Email" VARCHAR(255) NOT NULL,
    "Nombre" VARCHAR(100) NOT NULL,
    "Apellido" VARCHAR(100) NOT NULL,
    "NombreUsuario" VARCHAR(50) NOT NULL,
    "HashedPassword" VARCHAR(255) NOT NULL,
    "FotoUrl" TEXT NULL,
    "FechaAlta" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "FechaBaja" TIMESTAMPTZ NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "EmailConfirmado" BOOLEAN NOT NULL DEFAULT FALSE,
    "ConsienteNotificacionesEmail" BOOLEAN NOT NULL DEFAULT FALSE,
    "RecibeEmailsNuevaVotacion" BOOLEAN NOT NULL DEFAULT TRUE,
    "RecibeEmailsCambiosViaje" BOOLEAN NOT NULL DEFAULT TRUE,
    "RecibeEmailsRecordatoriosDeuda" BOOLEAN NOT NULL DEFAULT TRUE,
    "RecibeEmailsRecordatoriosReserva" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_Usuarios_Email"
    ON public."Usuarios" ("Email");

CREATE UNIQUE INDEX IF NOT EXISTS "UX_Usuarios_NombreUsuario"
    ON public."Usuarios" ("NombreUsuario");
