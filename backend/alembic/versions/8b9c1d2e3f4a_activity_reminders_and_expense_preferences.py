"""activity reminders and expense notification preferences

Revision ID: 8b9c1d2e3f4a
Revises: 4f0d9b62a7c1
Create Date: 2026-09-21 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "8b9c1d2e3f4a"
down_revision: Union[str, None] = "4f0d9b62a7c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLUMNAS_USUARIO = (
    "RecibeEmailsNuevosGastos",
    "RecibeEmailsRecordatoriosActividad",
    "RecibePushNuevosGastos",
    "RecibePushRecordatoriosActividad",
)


def upgrade() -> None:
    for nombre_columna in _COLUMNAS_USUARIO:
        op.add_column(
            "Usuarios",
            sa.Column(
                nombre_columna,
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
        )

    op.create_table(
        "RecordatoriosActividadesNotificados",
        sa.Column("IdRecordatorioActividadNotificado", sa.Integer(), nullable=False),
        sa.Column("IdActividad", sa.Integer(), nullable=False),
        sa.Column("Tipo", sa.String(length=50), nullable=False),
        sa.Column("MinutosAntes", sa.Integer(), nullable=False),
        sa.Column("FechaNotificacion", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["IdActividad"],
            ["ActividadesItinerario.IdActividad"],
            name="FK_RecordatoriosActNotif_ActividadesItinerario_IdActividad",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("IdRecordatorioActividadNotificado"),
        sa.UniqueConstraint(
            "IdActividad",
            "Tipo",
            "MinutosAntes",
            name="UX_RecordatoriosActividadesNotificados_Actividad_Tipo_Minutos",
        ),
    )


def downgrade() -> None:
    op.drop_table("RecordatoriosActividadesNotificados")
    for nombre_columna in reversed(_COLUMNAS_USUARIO):
        op.drop_column("Usuarios", nombre_columna)
