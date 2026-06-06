CREATE TABLE IF NOT EXISTS public."ParticipantesViajes" (
    "IdParticipanteViaje" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "IdViaje" BIGINT NOT NULL,
    "IdUsuario" BIGINT NOT NULL,
    "IdRolParticipante" SMALLINT NOT NULL,
    "IdEstadoParticipacion" SMALLINT NOT NULL,
    "FechaInvitacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "FechaRespuesta" TIMESTAMPTZ NULL,
    "FechaIncorporacion" TIMESTAMPTZ NULL,
    "InvitadoPor" BIGINT NULL,
    CONSTRAINT "FK_ParticipantesViajes_Viajes_IdViaje"
        FOREIGN KEY ("IdViaje")
        REFERENCES public."Viajes" ("IdViaje"),
    CONSTRAINT "FK_ParticipantesViajes_Usuarios_IdUsuario"
        FOREIGN KEY ("IdUsuario")
        REFERENCES public."Usuarios" ("IdUsuario"),
    CONSTRAINT "FK_ParticipantesViajes_Usuarios_InvitadoPor"
        FOREIGN KEY ("InvitadoPor")
        REFERENCES public."Usuarios" ("IdUsuario"),
    CONSTRAINT "FK_PartViajes_RolesPart_IdRolParticipante"
        FOREIGN KEY ("IdRolParticipante")
        REFERENCES public."RolesParticipantes" ("IdRolParticipante"),
    CONSTRAINT "FK_PartViajes_EstPart_IdEstadoParticipacion"
        FOREIGN KEY ("IdEstadoParticipacion")
        REFERENCES public."EstadosParticipaciones" ("IdEstadoParticipacion")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_ParticipantesViajes_IdViaje_IdUsuario"
    ON public."ParticipantesViajes" ("IdViaje", "IdUsuario");

CREATE INDEX IF NOT EXISTS "IX_ParticipantesViajes_IdUsuario"
    ON public."ParticipantesViajes" ("IdUsuario");

CREATE INDEX IF NOT EXISTS "IX_ParticipantesViajes_InvitadoPor"
    ON public."ParticipantesViajes" ("InvitadoPor");

CREATE INDEX IF NOT EXISTS "IX_ParticipantesViajes_IdRolParticipante"
    ON public."ParticipantesViajes" ("IdRolParticipante");

CREATE INDEX IF NOT EXISTS "IX_ParticipantesViajes_IdEstadoParticipacion"
    ON public."ParticipantesViajes" ("IdEstadoParticipacion");
