"""add fk viajes moneda"""

revision = '5d50656022c7'
down_revision = '0339b0e7da3e'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_foreign_key(
        "FK_Viajes_Monedas_Codigo",
        "Viajes",
        "Monedas",
        ["Moneda"],
        ["Codigo"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "FK_Viajes_Monedas_Codigo",
        "Viajes",
        type_="foreignkey",
    )
