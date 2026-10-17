"""Registro de solicitudes de reenvio de confirmacion de cuenta."""

from alembic import op
import sqlalchemy as sa

revision = "e1710c0f1a01"
down_revision = "a1060d4b5c7e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "SolicitudesConfirmacionEmail",
        sa.Column("IdSolicitud", sa.Integer(), primary_key=True),
        sa.Column("EmailHash", sa.String(64), nullable=False),
        sa.Column("Ip", sa.String(45), nullable=True),
        sa.Column(
            "Fecha", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "IX_SolicitudesConfirmacionEmail_Email_Fecha",
        "SolicitudesConfirmacionEmail",
        ["EmailHash", "Fecha"],
    )
    op.create_index(
        "IX_SolicitudesConfirmacionEmail_Ip_Fecha", "SolicitudesConfirmacionEmail", ["Ip", "Fecha"]
    )


def downgrade():
    op.drop_table("SolicitudesConfirmacionEmail")
