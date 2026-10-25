-- Precios base aprobados. Idempotente; conserva cambios posteriores del administrador.
UPDATE "Planes"
SET "PrecioMensualARS" = COALESCE("PrecioMensualARS", 4900.00),
    "PrecioAnualARS" = COALESCE("PrecioAnualARS", 49000.00)
WHERE "Nombre" = 'pro';
