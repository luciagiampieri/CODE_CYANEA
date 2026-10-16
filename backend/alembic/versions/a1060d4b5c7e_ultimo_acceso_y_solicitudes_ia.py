"""US 106: ultimo acceso de usuarios y registro de solicitudes a IA"""

revision = 'a1060d4b5c7e'
down_revision = '5f0840612be8'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        'Usuarios',
        sa.Column('UltimoAcceso', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_Usuarios_UltimoAcceso', 'Usuarios', ['UltimoAcceso'])

    op.create_table(
        'SolicitudesIA',
        sa.Column('IdSolicitudIA', sa.Integer(), primary_key=True),
        sa.Column(
            'Fecha',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column('Servicio', sa.String(length=50), nullable=False),
        sa.Column('Modelo', sa.String(length=100), nullable=False),
        sa.Column('Exitosa', sa.Boolean(), nullable=False),
    )
    op.create_index('ix_SolicitudesIA_Fecha', 'SolicitudesIA', ['Fecha'])


def downgrade() -> None:
    op.drop_index('ix_SolicitudesIA_Fecha', table_name='SolicitudesIA')
    op.drop_table('SolicitudesIA')
    op.drop_index('ix_Usuarios_UltimoAcceso', table_name='Usuarios')
    op.drop_column('Usuarios', 'UltimoAcceso')