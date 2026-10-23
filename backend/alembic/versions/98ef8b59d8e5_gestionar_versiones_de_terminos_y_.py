revision = '98ef8b59d8e5'
down_revision = '7098709748f2'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table('VersionesTerminos',
    sa.Column('IdVersionTerminos', sa.Integer(), nullable=False),
    sa.Column('Numero', sa.String(length=30), nullable=False),
    sa.Column('Titulo', sa.String(length=200), nullable=False),
    sa.Column('Contenido', sa.Text(), nullable=False),
    sa.Column('Estado', sa.String(length=20), server_default='borrador', nullable=False),
    sa.Column('FechaCreacion', sa.DateTime(timezone=True), nullable=False),
    sa.Column('FechaPublicacion', sa.DateTime(timezone=True), nullable=True),
    sa.Column('IdAdministradorCreacion', sa.Integer(), nullable=True),
    sa.Column('IdAdministradorPublicacion', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['IdAdministradorCreacion'], ['Usuarios.IdUsuario'], ),
    sa.ForeignKeyConstraint(['IdAdministradorPublicacion'], ['Usuarios.IdUsuario'], ),
    sa.PrimaryKeyConstraint('IdVersionTerminos'),
    sa.UniqueConstraint('Numero')
    )
    op.create_index('UX_VersionesTerminos_Vigente', 'VersionesTerminos', ['Estado'], unique=True, postgresql_where=sa.text('"Estado" = \'vigente\''), sqlite_where=sa.text('"Estado" = \'vigente\''))
    op.create_table('AuditoriaTerminos',
    sa.Column('IdAuditoriaTerminos', sa.Integer(), nullable=False),
    sa.Column('IdVersionTerminos', sa.Integer(), nullable=False),
    sa.Column('NumeroVersion', sa.String(length=30), nullable=False),
    sa.Column('IdAdministrador', sa.Integer(), nullable=False),
    sa.Column('Accion', sa.String(length=20), nullable=False),
    sa.Column('DireccionIp', sa.String(length=45), nullable=True),
    sa.Column('FechaHora', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['IdAdministrador'], ['Usuarios.IdUsuario'], ),
    sa.ForeignKeyConstraint(['IdVersionTerminos'], ['VersionesTerminos.IdVersionTerminos'], ),
    sa.PrimaryKeyConstraint('IdAuditoriaTerminos')
    )
    op.create_index(op.f('ix_AuditoriaTerminos_FechaHora'), 'AuditoriaTerminos', ['FechaHora'], unique=False)
    op.create_index(op.f('ix_AuditoriaTerminos_IdVersionTerminos'), 'AuditoriaTerminos', ['IdVersionTerminos'], unique=False)



def downgrade() -> None:
    op.drop_index(op.f('ix_AuditoriaTerminos_IdVersionTerminos'), table_name='AuditoriaTerminos')
    op.drop_index(op.f('ix_AuditoriaTerminos_FechaHora'), table_name='AuditoriaTerminos')
    op.drop_table('AuditoriaTerminos')
    op.drop_index('UX_VersionesTerminos_Vigente', table_name='VersionesTerminos', postgresql_where=sa.text('"Estado" = \'vigente\''), sqlite_where=sa.text('"Estado" = \'vigente\''))
    op.drop_table('VersionesTerminos')
