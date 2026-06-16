from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0004_email_confirmado'
down_revision = '0003_add_hashed_password'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Solo agregamos la columna nueva
    op.add_column('Usuarios', sa.Column('EmailConfirmado', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    # Si queremos deshacer los cambios, borramos la columna
    op.drop_column('Usuarios', 'EmailConfirmado')