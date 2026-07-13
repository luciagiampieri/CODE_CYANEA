from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0013_add_facebook_id"
down_revision = "0012_add_google_auth_fields"  
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column("FacebookId", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "FacebookId")