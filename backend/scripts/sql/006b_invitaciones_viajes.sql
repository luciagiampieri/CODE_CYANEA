CREATE TABLE IF NOT EXISTS public."InvitacionesViajes" (
    "IdInvitacionViaje" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "IdViaje" BIGINT NOT NULL,
    "EmailInvitado" VARCHAR(255) NOT NULL,
    "NombreInvitado" VARCHAR(150) NULL,
    "TokenInvitacion" VARCHAR(120) NOT NULL,
    "FechaInvitacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "FechaVencimiento" TIMESTAMPTZ NOT NULL,
    "FechaAceptacion" TIMESTAMPTZ NULL,
    "IdEstadoInvitacion" SMALLINT NOT NULL,
    "InvitadoPor" BIGINT NOT NULL,
    "IdUsuarioRegistrado" BIGINT NULL,
    CONSTRAINT "FK_InvitacionesViajes_Viajes_IdViaje"
        FOREIGN KEY ("IdViaje") REFERENCES public."Viajes" ("IdViaje"),
    CONSTRAINT "FK_InvitacionesViajes_EstadosInvitaciones_IdEstadoInvitacion"
        FOREIGN KEY ("IdEstadoInvitacion") REFERENCES public."EstadosInvitaciones" ("IdEstadoInvitacion"),
    CONSTRAINT "FK_InvitacionesViajes_Usuarios_InvitadoPor"
        FOREIGN KEY ("InvitadoPor") REFERENCES public."Usuarios" ("IdUsuario"),
    CONSTRAINT "FK_InvitacionesViajes_Usuarios_IdUsuarioRegistrado"
        FOREIGN KEY ("IdUsuarioRegistrado") REFERENCES public."Usuarios" ("IdUsuario"),
    CONSTRAINT "UX_InvitacionesViajes_IdViaje_EmailInvitado"
        UNIQUE ("IdViaje", "EmailInvitado"),
    CONSTRAINT "UX_InvitacionesViajes_TokenInvitacion"
        UNIQUE ("TokenInvitacion")
);

CREATE INDEX IF NOT EXISTS "IX_InvitacionesViajes_IdViaje"
    ON public."InvitacionesViajes" ("IdViaje");

CREATE INDEX IF NOT EXISTS "IX_InvitacionesViajes_IdEstadoInvitacion"
    ON public."InvitacionesViajes" ("IdEstadoInvitacion");

CREATE INDEX IF NOT EXISTS "IX_InvitacionesViajes_InvitadoPor"
    ON public."InvitacionesViajes" ("InvitadoPor");

CREATE INDEX IF NOT EXISTS "IX_InvitacionesViajes_IdUsuarioRegistrado"
    ON public."InvitacionesViajes" ("IdUsuarioRegistrado");
