"""unificar ramas de migraciones"""

revision = '4e9f6a58a352'
down_revision = ('b8e7535d0e5b', 'd719a5b3aa02')
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
