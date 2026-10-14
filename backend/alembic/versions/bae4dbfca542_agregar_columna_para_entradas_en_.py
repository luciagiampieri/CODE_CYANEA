"""agregar columna para entradas en actividades del itinerario"""

revision = 'bae4dbfca542'
down_revision = '38f1e3b2f55d'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
            'ActividadesItinerario',
            sa.Column('GooglePlaceIdEntradas', sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    op.drop_column('ActividadesItinerario', 'GooglePlaceIdEntradas')