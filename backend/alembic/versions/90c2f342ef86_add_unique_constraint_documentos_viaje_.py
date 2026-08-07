"""add unique constraint documentos viaje nombre"""

revision = '90c2f342ef86'
down_revision = 'ead429b1653d'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.create_unique_constraint(
        'uq_documentos_viaje_nombre',
        'DocumentosViajes',
        ['IdViaje', 'NombreArchivo']
    )


def downgrade() -> None:

    op.drop_constraint(
        'uq_documentos_viaje_nombre',
        'DocumentosViajes',
        type_='unique'
    )
