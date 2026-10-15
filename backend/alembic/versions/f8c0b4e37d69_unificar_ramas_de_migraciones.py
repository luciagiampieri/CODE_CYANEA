"""unificar ramas de migraciones"""

revision = 'f8c0b4e37d69'
down_revision = ('a91c3f2b7d10', 'bae4dbfca542')
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
