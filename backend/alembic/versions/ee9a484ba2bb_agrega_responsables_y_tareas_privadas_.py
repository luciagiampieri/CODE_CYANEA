"""agrega responsables y tareas privadas en checklist"""

revision = 'ee9a484ba2bb'
down_revision = 'a839d1b13ab8'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('Checklists', sa.Column('IdUsuarioCompletada', sa.Integer(), nullable=True))
    op.create_foreign_key(
            'FK_Checklists_Usuarios_IdUsuarioCompletada',
            'Checklists',
            'Usuarios',
            ['IdUsuarioCompletada'],
            ['IdUsuario'],
            ondelete='SET NULL',
        )
    op.add_column(
            'Checklists',
            sa.Column('EsPrivada', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        )


def downgrade() -> None:
    op.drop_column('Checklists', 'EsPrivada')
    op.drop_constraint('FK_Checklists_Usuarios_IdUsuarioCompletada', 'Checklists', type_='foreignkey')
    op.drop_column('Checklists', 'IdUsuarioCompletada')
    
