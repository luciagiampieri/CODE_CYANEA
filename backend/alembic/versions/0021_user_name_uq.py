"""agrega unicidad a nombre de usuario

Revision ID: 0021_user_name_uq
Revises: 2058f74946c1
Create Date: 2026-08-12
"""

from alembic import op


revision = "0021_user_name_uq"
down_revision = "2058f74946c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "UQ_Usuarios_NombreUsuario",
        "Usuarios",
        ["NombreUsuario"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "UQ_Usuarios_NombreUsuario",
        "Usuarios",
        type_="unique",
    )
