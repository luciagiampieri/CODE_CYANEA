"""push tokens and preferences

Revision ID: 4f0d9b62a7c1
Revises: 14dadec61532
Create Date: 2026-09-19 10:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "4f0d9b62a7c1"
down_revision: Union[str, None] = "14dadec61532"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column(
            "ConsienteNotificacionesPush",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column(
            "RecibePushNuevaVotacion",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column(
            "RecibePushCambiosViaje",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column(
            "RecibePushRecordatoriosDeuda",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column(
            "RecibePushRecordatoriosReserva",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    op.create_table(
        "TokensPushUsuarios",
        sa.Column("IdTokenPushUsuario", sa.Integer(), nullable=False),
        sa.Column("IdUsuario", sa.Integer(), nullable=False),
        sa.Column("Token", sa.String(length=255), nullable=False),
        sa.Column("Plataforma", sa.String(length=20), nullable=False),
        sa.Column("DispositivoId", sa.String(length=120), nullable=True),
        sa.Column("Activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("FechaAlta", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("FechaActualizacion", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("FechaBaja", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["IdUsuario"],
            ["Usuarios.IdUsuario"],
            name="FK_TokensPushUsuarios_Usuarios_IdUsuario",
        ),
        sa.PrimaryKeyConstraint("IdTokenPushUsuario"),
        sa.UniqueConstraint("Token", name="UX_TokensPushUsuarios_Token"),
    )
    op.create_index(
        "IX_TokensPushUsuarios_IdUsuario_Activo",
        "TokensPushUsuarios",
        ["IdUsuario", "Activo"],
    )


def downgrade() -> None:
    op.drop_index("IX_TokensPushUsuarios_IdUsuario_Activo", table_name="TokensPushUsuarios")
    op.drop_table("TokensPushUsuarios")
    op.drop_column("Usuarios", "RecibePushRecordatoriosReserva")
    op.drop_column("Usuarios", "RecibePushRecordatoriosDeuda")
    op.drop_column("Usuarios", "RecibePushCambiosViaje")
    op.drop_column("Usuarios", "RecibePushNuevaVotacion")
    op.drop_column("Usuarios", "ConsienteNotificacionesPush")
