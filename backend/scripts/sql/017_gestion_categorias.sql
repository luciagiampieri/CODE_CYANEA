-- US 110: íconos, estado y categorías de sistema para gestionar categorías desde el backoffice.
ALTER TABLE "CategoriasGastos" ADD COLUMN IF NOT EXISTS "Icono" VARCHAR(50) NOT NULL DEFAULT 'tags';
ALTER TABLE "CategoriasChecklist" ADD COLUMN IF NOT EXISTS "Icono" VARCHAR(50) NOT NULL DEFAULT 'tags';
ALTER TABLE "CategoriasDocumentos" ADD COLUMN IF NOT EXISTS "Icono" VARCHAR(50) NOT NULL DEFAULT 'tags';
ALTER TABLE "CategoriasDocumentos" ADD COLUMN IF NOT EXISTS "Activo" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "CategoriasDocumentos" ADD COLUMN IF NOT EXISTS "EsSistema" BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO "CategoriasDocumentos" ("Nombre")
SELECT 'Comprobantes'
WHERE NOT EXISTS (SELECT 1 FROM "CategoriasDocumentos" WHERE "Nombre" = 'Comprobantes');

UPDATE "CategoriasDocumentos" SET "EsSistema" = TRUE, "Activo" = TRUE WHERE "Nombre" = 'Comprobantes';

UPDATE "CategoriasGastos" AS c SET "Icono" = datos."Icono"
FROM (VALUES
    ('Comida y Bebida', 'utensils'),
    ('Transporte', 'car'),
    ('Alojamiento', 'hotel'),
    ('Entretenimiento', 'ticket-simple'),
    ('Compras', 'bag-shopping'),
    ('Servicios', 'file-invoice-dollar'),
    ('Otros', 'ellipsis')
) AS datos("Nombre", "Icono")
WHERE c."Nombre" = datos."Nombre" AND c."Icono" = 'tags';

UPDATE "CategoriasDocumentos" AS c SET "Icono" = datos."Icono"
FROM (VALUES
    ('Vuelos', 'plane'),
    ('Alojamiento', 'hotel'),
    ('Excursiones', 'map-location-dot'),
    ('Seguros', 'shield-halved'),
    ('Documentación', 'id-card'),
    ('Comprobantes', 'receipt'),
    ('Otros', 'ellipsis')
) AS datos("Nombre", "Icono")
WHERE c."Nombre" = datos."Nombre" AND c."Icono" = 'tags';

UPDATE "CategoriasChecklist" AS c SET "Icono" = datos."Icono"
FROM (VALUES
    ('Documentación', 'passport'),
    ('Transporte', 'car'),
    ('Alojamiento', 'hotel'),
    ('Equipamiento', 'suitcase'),
    ('Salud', 'kit-medical'),
    ('Seguros', 'shield-halved'),
    ('Finanzas', 'money-bill-transfer'),
    ('Comida', 'utensils'),
    ('Reservas y entradas', 'ticket'),
    ('Otros', 'list-check')
) AS datos("Nombre", "Icono")
WHERE c."Nombre" = datos."Nombre" AND c."Icono" = 'tags';
