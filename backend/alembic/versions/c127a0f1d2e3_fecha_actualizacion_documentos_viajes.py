"""fecha actualizacion documentos viajes"""

revision = 'c127a0f1d2e3'
down_revision = '46d7955535d1'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "DocumentosViajes",
        sa.Column("FechaActualizacion", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute('UPDATE "DocumentosViajes" SET "FechaActualizacion" = "FechaSubida"')
    op.alter_column(
        "DocumentosViajes",
        "FechaActualizacion",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )


def downgrade() -> None:
    op.drop_column("DocumentosViajes", "FechaActualizacion")