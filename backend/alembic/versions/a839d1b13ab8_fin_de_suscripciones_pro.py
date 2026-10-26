"""fin de suscripciones pro"""

revision = 'a839d1b13ab8'
down_revision = 'd7619b0cb76e'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa

TABLA = "SuscripcionesUsuarios"


def upgrade() -> None:
    op.add_column(TABLA, sa.Column("FechaAvisoFinalizacion", sa.DateTime(timezone=True), nullable=True))
    op.add_column(TABLA, sa.Column("FechaFinalizacion", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column(TABLA, "FechaFinalizacion")
    op.drop_column(TABLA, "FechaAvisoFinalizacion")