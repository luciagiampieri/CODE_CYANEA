BEGIN;
-- Nombre de usuario unico sin distinguir mayusculas ("u123" y "U123" son el mismo).
-- Falla si ya hay duplicados: listarlos con
--   SELECT lower("NombreUsuario"), count(*) FROM "Usuarios" GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "UX_Usuarios_NombreUsuario_Minusculas"
    ON "Usuarios" (lower("NombreUsuario"));
COMMIT;
