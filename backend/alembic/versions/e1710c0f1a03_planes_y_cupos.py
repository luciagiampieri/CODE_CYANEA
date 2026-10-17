"""Planes y cupos editables para participantes de viajes."""

from alembic import op
import sqlalchemy as sa

revision = "e1710c0f1a03"
down_revision = "e1710c0f1a02"
branch_labels = None
depends_on = None


def upgrade():
    planes = op.create_table(
        "Planes",
        sa.Column("IdPlan", sa.Integer(), primary_key=True),
        sa.Column("Nombre", sa.String(30), nullable=False, unique=True),
        sa.Column("MaxParticipantesViaje", sa.Integer(), nullable=False),
        sa.Column("Activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint('"MaxParticipantesViaje" > 0', name="CK_Planes_CupoPositivo"),
    )
    op.bulk_insert(
        planes,
        [
            {"IdPlan": 1, "Nombre": "gratuito", "MaxParticipantesViaje": 3, "Activo": True},
            {"IdPlan": 2, "Nombre": "pro", "MaxParticipantesViaje": 3, "Activo": True},
        ],
    )
    op.add_column("Usuarios", sa.Column("IdPlan", sa.Integer(), nullable=False, server_default="1"))
    op.create_foreign_key("FK_Usuarios_Planes_IdPlan", "Usuarios", "Planes", ["IdPlan"], ["IdPlan"])


def downgrade():
    op.drop_constraint("FK_Usuarios_Planes_IdPlan", "Usuarios", type_="foreignkey")
    op.drop_column("Usuarios", "IdPlan")
    op.drop_table("Planes")
