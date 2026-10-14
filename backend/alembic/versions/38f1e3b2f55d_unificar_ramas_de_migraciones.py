"""unificar ramas de migraciones"""

revision = '38f1e3b2f55d'
down_revision = ('87d013f40fc2', 'd87e5a1b2c3f')
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
