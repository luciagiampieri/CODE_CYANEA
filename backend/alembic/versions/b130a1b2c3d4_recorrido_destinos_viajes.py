"""US A: orden, noches y noches en viaje de cada destino del recorrido."""

from alembic import op
import sqlalchemy as sa

revision = "b130a1b2c3d4"
down_revision = "f120a1b2c3d4"
branch_labels = None
depends_on = None

# Hasta ahora no se guardaba un orden: ctid es lo más cercano al orden de carga.
# Las noches quedan en NULL: los viajes existentes no se reparten automáticamente.
BACKFILL_ORDEN = """
UPDATE "DestinosViajes" dv
SET "Orden" = o.orden
FROM (
    SELECT "IdViaje", "IdDestino",
           ROW_NUMBER() OVER (PARTITION BY "IdViaje" ORDER BY ctid) - 1 AS orden
    FROM "DestinosViajes"
) o
WHERE dv."IdViaje" = o."IdViaje" AND dv."IdDestino" = o."IdDestino"
"""


def upgrade():
    op.add_column(
        "DestinosViajes",
        sa.Column("Orden", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("DestinosViajes", sa.Column("Noches", sa.Integer(), nullable=True))
    op.add_column(
        "DestinosViajes",
        sa.Column("NochesEnViaje", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(BACKFILL_ORDEN)
    op.create_check_constraint(
        "CK_DestinosViajes_Noches",
        "DestinosViajes",
        '"Noches" IS NULL OR "Noches" >= 0',
    )
    op.create_check_constraint(
        "CK_DestinosViajes_NochesEnViaje",
        "DestinosViajes",
        '"NochesEnViaje" >= 0',
    )


def downgrade():
    op.execute(
        'ALTER TABLE "DestinosViajes" DROP CONSTRAINT IF EXISTS "CK_DestinosViajes_NochesEnViaje"'
    )
    op.execute(
        'ALTER TABLE "DestinosViajes" DROP CONSTRAINT IF EXISTS "CK_DestinosViajes_Noches"'
    )
    op.execute('ALTER TABLE "DestinosViajes" DROP COLUMN IF EXISTS "NochesEnViaje"')
    op.execute('ALTER TABLE "DestinosViajes" DROP COLUMN IF EXISTS "Noches"')
    op.execute('ALTER TABLE "DestinosViajes" DROP COLUMN IF EXISTS "Orden"')
