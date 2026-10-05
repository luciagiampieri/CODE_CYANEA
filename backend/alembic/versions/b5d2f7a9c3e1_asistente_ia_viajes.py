"""asistente ia viajes

Revision ID: b5d2f7a9c3e1
Revises: a4c1d2e3f5b6
Create Date: 2026-10-03 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b5d2f7a9c3e1"
down_revision: str | Sequence[str] | None = "a4c1d2e3f5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column(
            "ConsienteAsistenteIA",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column("FechaConsentimientoAsistenteIA", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "AccionesAsistenteViaje",
        sa.Column("IdAccionAsistente", sa.String(length=36), nullable=False),
        sa.Column("IdViaje", sa.Integer(), nullable=False),
        sa.Column("IdUsuario", sa.Integer(), nullable=False),
        sa.Column("Tipo", sa.String(length=50), nullable=False),
        sa.Column("Estado", sa.String(length=30), server_default="propuesta", nullable=False),
        sa.Column("Etiqueta", sa.String(length=150), nullable=False),
        sa.Column("PayloadJson", sa.Text(), nullable=False),
        sa.Column("ResultadoJson", sa.Text(), nullable=True),
        sa.Column("FechaCreacion", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("FechaConfirmacion", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["IdUsuario"], ["Usuarios.IdUsuario"], name="FK_AccionesAsistenteViaje_Usuarios_IdUsuario"),
        sa.ForeignKeyConstraint(["IdViaje"], ["Viajes.IdViaje"], name="FK_AccionesAsistenteViaje_Viajes_IdViaje"),
        sa.PrimaryKeyConstraint("IdAccionAsistente"),
    )


def downgrade() -> None:
    op.drop_table("AccionesAsistenteViaje")
    op.drop_column("Usuarios", "FechaConsentimientoAsistenteIA")
    op.drop_column("Usuarios", "ConsienteAsistenteIA")
