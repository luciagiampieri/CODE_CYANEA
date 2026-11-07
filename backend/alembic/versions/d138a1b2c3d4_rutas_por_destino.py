"""US 138: un día de traslado sin noches en viaje tiene una ruta por destino."""

from alembic import op
import sqlalchemy as sa

revision = "d138a1b2c3d4"
down_revision = "c136a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("RutasDiarias", sa.Column("IdDestino", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "FK_RutasDiarias_Destinos_IdDestino",
        "RutasDiarias",
        "Destinos",
        ["IdDestino"],
        ["IdDestino"],
    )
    op.execute(
        'ALTER TABLE "RutasDiarias" DROP CONSTRAINT IF EXISTS "UQ_RutasDiarias_IdDiaCronograma"'
    )
    op.create_index(
        "UX_RutasDiarias_Dia",
        "RutasDiarias",
        ["IdDiaCronograma"],
        unique=True,
        postgresql_where=sa.text('"IdDestino" IS NULL'),
    )
    op.create_index(
        "UX_RutasDiarias_Dia_Destino",
        "RutasDiarias",
        ["IdDiaCronograma", "IdDestino"],
        unique=True,
        postgresql_where=sa.text('"IdDestino" IS NOT NULL'),
    )


def downgrade():
    # Vuelve a haber una ruta por día: queda la primera.
    op.execute(
        """
        DELETE FROM "RutasDiarias" r
        USING "RutasDiarias" o
        WHERE r."IdDiaCronograma" = o."IdDiaCronograma"
          AND r."IdRutaDiaria" > o."IdRutaDiaria"
        """
    )
    op.execute('DROP INDEX IF EXISTS "UX_RutasDiarias_Dia_Destino"')
    op.execute('DROP INDEX IF EXISTS "UX_RutasDiarias_Dia"')
    op.execute(
        'ALTER TABLE "RutasDiarias" DROP CONSTRAINT IF EXISTS "FK_RutasDiarias_Destinos_IdDestino"'
    )
    op.execute('ALTER TABLE "RutasDiarias" DROP COLUMN IF EXISTS "IdDestino"')
    op.create_unique_constraint(
        "UQ_RutasDiarias_IdDiaCronograma", "RutasDiarias", ["IdDiaCronograma"]
    )
