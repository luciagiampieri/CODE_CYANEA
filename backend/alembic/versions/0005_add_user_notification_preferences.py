"""add user notification preferences

Revision ID: 0005_user_notif_flags
Revises: 0004_email_confirmado
Create Date: 2026-06-21 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_user_notif_flags"
down_revision = "0004_email_confirmado"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column("ConsienteNotificacionesEmail", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "Usuarios",
        sa.Column("RecibeEmailsNuevaVotacion", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "Usuarios",
        sa.Column("RecibeEmailsCambiosViaje", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "Usuarios",
        sa.Column("RecibeEmailsRecordatoriosDeuda", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "Usuarios",
        sa.Column("RecibeEmailsRecordatoriosReserva", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "RecibeEmailsRecordatoriosReserva")
    op.drop_column("Usuarios", "RecibeEmailsRecordatoriosDeuda")
    op.drop_column("Usuarios", "RecibeEmailsCambiosViaje")
    op.drop_column("Usuarios", "RecibeEmailsNuevaVotacion")
    op.drop_column("Usuarios", "ConsienteNotificacionesEmail")
