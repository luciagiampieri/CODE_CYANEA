"""Suspender y reactivar usuario"""

revision = '7098709748f2'
down_revision = 'd114a1b2c3d4'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table('AuditoriaSuspensionesUsuarios',
    sa.Column('IdAuditoriaSuspension', sa.Integer(), nullable=False),
    sa.Column('IdUsuario', sa.Integer(), nullable=False),
    sa.Column('IdAdministrador', sa.Integer(), nullable=False),
    sa.Column('Accion', sa.String(length=20), nullable=False),
    sa.Column('Motivo', sa.String(length=500), nullable=True),
    sa.Column('DireccionIp', sa.String(length=45), nullable=True),
    sa.Column('FechaHora', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['IdAdministrador'], ['Usuarios.IdUsuario'], ),
    sa.ForeignKeyConstraint(['IdUsuario'], ['Usuarios.IdUsuario'], ),
    sa.PrimaryKeyConstraint('IdAuditoriaSuspension')
    )
    op.create_index(op.f('ix_AuditoriaSuspensionesUsuarios_FechaHora'), 'AuditoriaSuspensionesUsuarios', ['FechaHora'], unique=False)
    op.create_index(op.f('ix_AuditoriaSuspensionesUsuarios_IdUsuario'), 'AuditoriaSuspensionesUsuarios', ['IdUsuario'], unique=False)
    op.add_column('Usuarios', sa.Column('MotivoSuspension', sa.String(length=500), nullable=True))
    op.add_column('Usuarios', sa.Column('FechaSuspension', sa.DateTime(timezone=True), nullable=True))
    op.add_column('Usuarios', sa.Column('FechaCierreSesiones', sa.DateTime(timezone=True), nullable=True))



def downgrade() -> None:
    op.drop_column('Usuarios', 'FechaCierreSesiones')
    op.drop_column('Usuarios', 'FechaSuspension')
    op.drop_column('Usuarios', 'MotivoSuspension')
    op.drop_index(op.f('ix_AuditoriaSuspensionesUsuarios_IdUsuario'), table_name='AuditoriaSuspensionesUsuarios')
    op.drop_index(op.f('ix_AuditoriaSuspensionesUsuarios_FechaHora'), table_name='AuditoriaSuspensionesUsuarios')
    op.drop_table('AuditoriaSuspensionesUsuarios')
