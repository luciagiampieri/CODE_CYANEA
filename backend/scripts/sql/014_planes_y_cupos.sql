CREATE TABLE IF NOT EXISTS "Planes" (
    "IdPlan" INTEGER PRIMARY KEY,
    "Nombre" VARCHAR(30) NOT NULL UNIQUE,
    "MaxParticipantesViaje" INTEGER NOT NULL CHECK ("MaxParticipantesViaje" > 0),
    "Activo" BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO "Planes" ("IdPlan", "Nombre", "MaxParticipantesViaje")
VALUES (1, 'gratuito', 3), (2, 'pro', 3)
ON CONFLICT ("IdPlan") DO NOTHING;
ALTER TABLE "Usuarios" ADD COLUMN IF NOT EXISTS "IdPlan" INTEGER NOT NULL DEFAULT 1 REFERENCES "Planes" ("IdPlan");
