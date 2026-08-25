"""agregar Modo a RutasDiarias"""

revision = '9823b3c44de0'
down_revision = '0022_create_rutas_diarias'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "RutasDiarias",
        sa.Column("Modo", sa.String(length=20), nullable=False, server_default="walking"),
    )


def downgrade() -> None:
    op.drop_column("RutasDiarias", "Modo")