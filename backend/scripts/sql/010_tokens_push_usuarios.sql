CREATE TABLE IF NOT EXISTS public."TokensPushUsuarios" (
    "IdTokenPushUsuario" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "IdUsuario" BIGINT NOT NULL,
    "Token" VARCHAR(255) NOT NULL,
    "Plataforma" VARCHAR(20) NOT NULL,
    "DispositivoId" VARCHAR(120) NULL,
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "FechaAlta" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "FechaActualizacion" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "FechaBaja" TIMESTAMPTZ NULL,
    CONSTRAINT "FK_TokensPushUsuarios_Usuarios_IdUsuario"
        FOREIGN KEY ("IdUsuario")
        REFERENCES public."Usuarios" ("IdUsuario")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UX_TokensPushUsuarios_Token"
    ON public."TokensPushUsuarios" ("Token");

CREATE INDEX IF NOT EXISTS "IX_TokensPushUsuarios_IdUsuario_Activo"
    ON public."TokensPushUsuarios" ("IdUsuario", "Activo");
