"""add google auth fields to usuarios

revision = '0012_add_google_auth_fields'
down_revision = '7e0fdeb99a98'
branch_labels = None
depends_on = None
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_add_google_auth_fields"
down_revision = "7e0fdeb99a98"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Usuarios", sa.Column("GoogleSub", sa.String(length=255), nullable=True))
    op.add_column(
        "Usuarios",
        sa.Column(
            "ProveedorAutenticacion",
            sa.String(length=30),
            nullable=False,
            server_default="local",
        ),
    )
    op.create_unique_constraint(
        "UQ_Usuarios_GoogleSub",
        "Usuarios",
        ["GoogleSub"],
    )


def downgrade() -> None:
    op.drop_constraint("UQ_Usuarios_GoogleSub", "Usuarios", type_="unique")
    op.drop_column("Usuarios", "ProveedorAutenticacion")
    op.drop_column("Usuarios", "GoogleSub")
