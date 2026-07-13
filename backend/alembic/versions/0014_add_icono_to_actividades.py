"""add icono to actividades itinerario"""

revision = '0014_add_icono_to_actividades'
down_revision = '0013_add_facebook_id'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        'ActividadesItinerario',
        sa.Column('Icono', sa.String(length=50), nullable=False, server_default='location-dot'),
    )


def downgrade() -> None:
    op.drop_column('ActividadesItinerario', 'Icono')