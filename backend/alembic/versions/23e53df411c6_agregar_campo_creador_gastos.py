"""agregar_campo_creador_gastos"""

revision = '23e53df411c6'
down_revision = 'acba6c3668f2'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.add_column(
        "Gastos",
        sa.Column("IdParticipanteCreador", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "FK_Gastos_ParticipantesViajes_IdParticipanteCreador",
        "Gastos",
        "ParticipantesViajes",
        ["IdParticipanteCreador"],
        ["IdParticipanteViaje"],
    )


def downgrade() -> None:
    
    op.drop_constraint(
        "FK_Gastos_ParticipantesViajes_IdParticipanteCreador",
        "Gastos",
        type_="foreignkey",
    )
    op.drop_column("Gastos", "IdParticipanteCreador")
    
