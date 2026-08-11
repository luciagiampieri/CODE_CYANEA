"""Agregar provincia estado a destinos"""

revision = 'e1d5f323fbe0'
down_revision = '9a820d55b156'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.add_column(
    "Destinos",
    sa.Column("ProvinciaEstado", sa.String(length=150), nullable=True),
)


def downgrade() -> None:

    op.drop_column("Destinos", "ProvinciaEstado")
