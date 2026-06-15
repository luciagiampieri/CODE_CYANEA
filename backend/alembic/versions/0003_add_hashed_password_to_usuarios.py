"""add HashedPassword to Usuarios"""

from alembic import op
import sqlalchemy as sa

# Verificá este valor con: alembic heads
revision = "0003_add_hashed_password"
down_revision = "d10b250a5927"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column("HashedPassword", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "HashedPassword")