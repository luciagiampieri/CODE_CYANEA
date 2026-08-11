"""Agregar lugar de interes a actividad"""

revision = '9a820d55b156'
down_revision = '8444ecee3300'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    
    op.add_column(
    "ActividadesItinerario",
    sa.Column("IdLugarInteres", sa.Integer(), nullable=True)
    )

    op.create_foreign_key(
        "FK_ActIt_LugaresInteres_IdLugarInteres",
        "ActividadesItinerario",
        "LugaresInteres",
        ["IdLugarInteres"],
        ["IdLugarInteres"],
        ondelete="SET NULL",
    )

def downgrade() -> None:
    
    op.drop_constraint(
        "FK_ActIt_LugaresInteres_IdLugarInteres",
        "ActividadesItinerario",
        type_="foreignkey",
    )

    op.drop_column(
        "ActividadesItinerario",
        "IdLugarInteres",
    )


