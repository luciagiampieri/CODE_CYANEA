"""cotizacion en gastos"""

revision = 'b0bcca3ac886'
down_revision = 'd138a1b2c3d4'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("Gastos", sa.Column("FuenteCotizacion", sa.String(length=30), nullable=True))
    op.add_column("Gastos", sa.Column("FechaCotizacion", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("Gastos", "FechaCotizacion")
    op.drop_column("Gastos", "FuenteCotizacion")