"""unificando migraciones de ramas"""

revision = '6fa467fa28ec'
down_revision = ('b5d2f7a9c3e1', 'f1c3a5e7b9d2')
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
