"""create notificaciones table"""

revision = '229f0e4ec62b'
down_revision = '9823b3c44de0'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    
    op.create_table(
        'Notificaciones',
        sa.Column('IdNotificacion', sa.Integer(), nullable=False),
        sa.Column('IdUsuario', sa.Integer(), nullable=False),
        sa.Column('IdViaje', sa.Integer(), nullable=True),
        sa.Column('Tipo', sa.String(length=50), nullable=False),
        sa.Column('Titulo', sa.String(length=150), nullable=False),
        sa.Column('Mensaje', sa.Text(), nullable=False),
        sa.Column('Leida', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('FechaCreacion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),

        sa.ForeignKeyConstraint(['IdUsuario'], ['Usuarios.IdUsuario'], name='FK_Notificaciones_Usuarios_IdUsuario'),
        sa.ForeignKeyConstraint(['IdViaje'], ['Viajes.IdViaje'], name='FK_Notificaciones_Viajes_IdViaje'),
        sa.PrimaryKeyConstraint('IdNotificacion')
    )
    
    
def downgrade() -> None:
   
    op.drop_table('Notificaciones')
   
