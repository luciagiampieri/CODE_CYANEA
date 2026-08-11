"""add FechaCancelacion a Votaciones

Revision ID: 0019_votaciones_cancelacion
Revises: dfe420454d28
Create Date: 2026-08-11
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_votaciones_cancelacion"
down_revision = "dfe420454d28"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "Votaciones",
        sa.Column("FechaCancelacion", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("Votaciones", "FechaCancelacion")