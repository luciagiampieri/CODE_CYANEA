"""agrega advertencia horarios en actividades del itineario"""

revision = '87d013f40fc2'
down_revision = '4e9f6a58a352'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.add_column(
            'ActividadesItinerario',
            sa.Column('TipoAdvertenciaHorario', sa.String(length=30), nullable=True),
        )
    op.add_column(
            'ActividadesItinerario',
            sa.Column('AdvertenciaHorario', sa.String(length=300), nullable=True),
        )

def downgrade() -> None:
    op.drop_column('ActividadesItinerario', 'AdvertenciaHorario')
    op.drop_column('ActividadesItinerario', 'TipoAdvertenciaHorario')