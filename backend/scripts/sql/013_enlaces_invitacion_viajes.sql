CREATE TABLE IF NOT EXISTS "EnlacesInvitacionViajes" (
    "IdEnlaceInvitacionViaje" SERIAL PRIMARY KEY,
    "IdViaje" INTEGER NOT NULL UNIQUE REFERENCES "Viajes" ("IdViaje"),
    "TokenEnlace" VARCHAR(120) NOT NULL UNIQUE,
    "IdUsuarioCreador" INTEGER NOT NULL REFERENCES "Usuarios" ("IdUsuario"),
    "FechaCreacion" TIMESTAMPTZ NOT NULL,
    "FechaVencimiento" TIMESTAMPTZ NOT NULL,
    "FechaRevocacion" TIMESTAMPTZ NULL
);
