CREATE TABLE IF NOT EXISTS "RolesSistema" (
    "IdRolSistema" INTEGER PRIMARY KEY,
    "Nombre" VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO "RolesSistema" ("IdRolSistema", "Nombre") VALUES
    (1, 'viajero'),
    (2, 'administrador_sistema')
ON CONFLICT ("IdRolSistema") DO NOTHING;

ALTER TABLE "Usuarios"
    ADD COLUMN IF NOT EXISTS "IdRolSistema" INTEGER NOT NULL DEFAULT 1
    REFERENCES "RolesSistema" ("IdRolSistema");

CREATE TABLE IF NOT EXISTS "AuditoriaAccesosBackoffice" (
    "IdAuditoriaAcceso" SERIAL PRIMARY KEY,
    "Email" VARCHAR(255) NOT NULL,
    "IdUsuario" INTEGER NULL REFERENCES "Usuarios" ("IdUsuario"),
    "Exitoso" BOOLEAN NOT NULL,
    "Motivo" VARCHAR(40) NOT NULL,
    "DireccionIp" VARCHAR(45) NULL,
    "UserAgent" VARCHAR(255) NULL,
    "FechaHora" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS "IX_AuditoriaAccesosBackoffice_Email_FechaHora"
    ON "AuditoriaAccesosBackoffice" ("Email", "FechaHora");

CREATE TABLE IF NOT EXISTS "SesionesBackoffice" (
    "IdSesionBackoffice" VARCHAR(36) PRIMARY KEY,
    "IdUsuario" INTEGER NOT NULL REFERENCES "Usuarios" ("IdUsuario"),
    "FechaInicio" TIMESTAMPTZ NOT NULL,
    "UltimaActividad" TIMESTAMPTZ NOT NULL,
    "FechaCierre" TIMESTAMPTZ NULL
);