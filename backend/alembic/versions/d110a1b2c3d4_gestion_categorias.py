"""US 110: íconos, estado y categorías de sistema para gestionar categorías"""

revision = "d110a1b2c3d4"
down_revision = "c118b2c3d4e5"
branch_labels = None
depends_on = None

from alembic import op


ICONOS_GASTOS = {
    "Comida y Bebida": "utensils",
    "Transporte": "car",
    "Alojamiento": "hotel",
    "Entretenimiento": "ticket-simple",
    "Compras": "bag-shopping",
    "Servicios": "file-invoice-dollar",
    "Otros": "ellipsis",
}

ICONOS_DOCUMENTOS = {
    "Vuelos": "plane",
    "Alojamiento": "hotel",
    "Excursiones": "map-location-dot",
    "Seguros": "shield-halved",
    "Documentación": "id-card",
    "Comprobantes": "receipt",
    "Otros": "ellipsis",
}

ICONOS_CHECKLIST = {
    "Documentación": "passport",
    "Transporte": "car",
    "Alojamiento": "hotel",
    "Equipamiento": "suitcase",
    "Salud": "kit-medical",
    "Seguros": "shield-halved",
    "Finanzas": "money-bill-transfer",
    "Comida": "utensils",
    "Reservas y entradas": "ticket",
    "Otros": "list-check",
}


def _cargar_iconos(tabla: str, iconos: dict[str, str]) -> None:
    for nombre, icono in iconos.items():
        nombre_sql = nombre.replace("'", "''")
        op.execute(
            f"""UPDATE "{tabla}" SET "Icono" = '{icono}' WHERE "Nombre" = '{nombre_sql}'"""
        )


def upgrade() -> None:
    for tabla in ("CategoriasGastos", "CategoriasDocumentos", "CategoriasChecklist"):
        op.execute(
            f"""ALTER TABLE "{tabla}" ADD COLUMN IF NOT EXISTS "Icono" VARCHAR(50) NOT NULL DEFAULT 'tags'"""
        )
    op.execute(
        """ALTER TABLE "CategoriasDocumentos" ADD COLUMN IF NOT EXISTS "Activo" BOOLEAN NOT NULL DEFAULT TRUE"""
    )
    op.execute(
        """ALTER TABLE "CategoriasDocumentos" ADD COLUMN IF NOT EXISTS "EsSistema" BOOLEAN NOT NULL DEFAULT FALSE"""
    )

    # "Comprobantes" la crea el sistema al guardar el comprobante de un gasto; se
    # asegura que exista para marcarla como protegida.
    op.execute(
        """
        INSERT INTO "CategoriasDocumentos" ("Nombre")
        SELECT 'Comprobantes'
        WHERE NOT EXISTS (SELECT 1 FROM "CategoriasDocumentos" WHERE "Nombre" = 'Comprobantes')
        """
    )
    op.execute(
        """UPDATE "CategoriasDocumentos" SET "EsSistema" = TRUE, "Activo" = TRUE WHERE "Nombre" = 'Comprobantes'"""
    )

    _cargar_iconos("CategoriasGastos", ICONOS_GASTOS)
    _cargar_iconos("CategoriasDocumentos", ICONOS_DOCUMENTOS)
    _cargar_iconos("CategoriasChecklist", ICONOS_CHECKLIST)


def downgrade() -> None:
    op.execute('ALTER TABLE "CategoriasDocumentos" DROP COLUMN IF EXISTS "EsSistema"')
    op.execute('ALTER TABLE "CategoriasDocumentos" DROP COLUMN IF EXISTS "Activo"')
    for tabla in ("CategoriasGastos", "CategoriasDocumentos", "CategoriasChecklist"):
        op.execute(f'ALTER TABLE "{tabla}" DROP COLUMN IF EXISTS "Icono"')
