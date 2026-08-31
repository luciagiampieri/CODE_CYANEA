"""agrega fecha de salida a participante de viaje"""

revision = 'f568800db926'
down_revision = '229f0e4ec62b'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    
    op.add_column(
        'ParticipantesViajes',
        sa.Column('FechaSalida', sa.DateTime(timezone=True), nullable=True)
    )
    


def downgrade() -> None:
    op.drop_column('ParticipantesViajes', 'FechaSalida')
    
