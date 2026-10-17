"""Enlaces compartibles de invitacion a viajes."""

from alembic import op
import sqlalchemy as sa

revision = "e1710c0f1a02"
down_revision = "e1710c0f1a01"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "EnlacesInvitacionViajes",
        sa.Column("IdEnlaceInvitacionViaje", sa.Integer(), primary_key=True),
        sa.Column(
            "IdViaje", sa.Integer(), sa.ForeignKey("Viajes.IdViaje"), nullable=False, unique=True
        ),
        sa.Column("TokenEnlace", sa.String(120), nullable=False, unique=True),
        sa.Column(
            "IdUsuarioCreador", sa.Integer(), sa.ForeignKey("Usuarios.IdUsuario"), nullable=False
        ),
        sa.Column("FechaCreacion", sa.DateTime(timezone=True), nullable=False),
        sa.Column("FechaVencimiento", sa.DateTime(timezone=True), nullable=False),
        sa.Column("FechaRevocacion", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table("EnlacesInvitacionViajes")
