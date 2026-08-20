"""create rutas diarias table"""

revision = "0022_create_rutas_diarias"
down_revision = "0021_user_name_uq"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table(
        "RutasDiarias",
        sa.Column("IdRutaDiaria", sa.Integer(), nullable=False),
        sa.Column("IdDiaCronograma", sa.Integer(), nullable=False),
        sa.Column("PolilineaCodificada", sa.String(), nullable=False),
        sa.Column("DistanciaMetros", sa.Integer(), nullable=False),
        sa.Column("DuracionSegundos", sa.Integer(), nullable=False),
        sa.Column("IdsActividadesOrdenadas", sa.JSON(), nullable=False),
        sa.Column(
            "FechaGeneracion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["IdDiaCronograma"],
            ["DiasCronogramas.IdDiaCronograma"],
            name="FK_RutasDiarias_DiasCronogramas_IdDiaCronograma",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("IdRutaDiaria"),
        sa.UniqueConstraint(
            "IdDiaCronograma",
            name="UQ_RutasDiarias_IdDiaCronograma",
        ),
    )


def downgrade() -> None:
    op.drop_table("RutasDiarias")