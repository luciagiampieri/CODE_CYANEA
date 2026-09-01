"""agrega columna AdministradorCuandoAbandono a ParticipanteViaje"""

revision = 'f78fb910696e'
down_revision = 'ac6e8cc8070e'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.add_column(
        "ParticipantesViajes",
        sa.Column("IdAdministradorAlMomentoDeSalida", sa.Integer(), nullable=True),
    )

    op.create_foreign_key(
        "FK_ParticipantesViajes_AdminSalida",
        "ParticipantesViajes",
        "Usuarios",
        ["IdAdministradorAlMomentoDeSalida"],
        ["IdUsuario"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "FK_ParticipantesViajes_AdminSalida"
        "ParticipantesViajes",
        type_="foreignkey",
    )

    op.drop_column("ParticipantesViajes", "IdAdministradorAlMomentoDeSalida")
