"""create liquidaciones de viajes

Revision ID: 0017_create_liquidaciones
Revises: 0016_cover_place_id
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_create_liquidaciones"
down_revision = "0016_cover_place_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "EstadosTransferenciasLiquidaciones",
        sa.Column("IdEstadoTransferenciaLiquidacion", sa.Integer(), nullable=False),
        sa.Column("Nombre", sa.String(length=50), nullable=False),
        sa.Column("Activo", sa.Boolean(), server_default="true", nullable=False),
        sa.PrimaryKeyConstraint("IdEstadoTransferenciaLiquidacion"),
        sa.UniqueConstraint("Nombre", name="UQ_EstadosTransferenciasLiquidaciones_Nombre"),
    )

    op.create_table(
        "LiquidacionesViajes",
        sa.Column("IdLiquidacion", sa.Integer(), nullable=False),
        sa.Column("IdViaje", sa.Integer(), nullable=False),
        sa.Column("Version", sa.Integer(), nullable=False),
        sa.Column("Activa", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("FechaGeneracion", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["IdViaje"],
            ["Viajes.IdViaje"],
            name="FK_LiqViajes_Viajes_IdViaje",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("IdLiquidacion"),
        sa.UniqueConstraint("IdViaje", "Version", name="UX_LiquidacionesViajes_IdViaje_Version"),
    )

    op.create_table(
        "TransferenciasLiquidaciones",
        sa.Column("IdTransferenciaLiquidacion", sa.Integer(), nullable=False),
        sa.Column("IdLiquidacion", sa.Integer(), nullable=False),
        sa.Column("IdParticipanteDeudor", sa.Integer(), nullable=False),
        sa.Column("IdParticipanteAcreedor", sa.Integer(), nullable=False),
        sa.Column("Monto", sa.Numeric(12, 2), nullable=False),
        sa.Column("IdEstadoTransferenciaLiquidacion", sa.Integer(), nullable=False),
        sa.Column("FechaCreacion", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("FechaConfirmacion", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('"Monto" > 0', name="CK_TransferenciasLiquidaciones_Monto"),
        sa.CheckConstraint(
            '"IdParticipanteDeudor" <> "IdParticipanteAcreedor"',
            name="CK_TransferenciasLiquidaciones_ParticipantesDistintos",
        ),
        sa.ForeignKeyConstraint(
            ["IdEstadoTransferenciaLiquidacion"],
            ["EstadosTransferenciasLiquidaciones.IdEstadoTransferenciaLiquidacion"],
            name="FK_TransLiq_Estados_IdEstado",
        ),
        sa.ForeignKeyConstraint(
            ["IdLiquidacion"],
            ["LiquidacionesViajes.IdLiquidacion"],
            name="FK_TransLiq_LiqViajes_IdLiquidacion",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["IdParticipanteAcreedor"],
            ["ParticipantesViajes.IdParticipanteViaje"],
            name="FK_TransLiq_PartViajes_IdAcreedor",
        ),
        sa.ForeignKeyConstraint(
            ["IdParticipanteDeudor"],
            ["ParticipantesViajes.IdParticipanteViaje"],
            name="FK_TransLiq_PartViajes_IdDeudor",
        ),
        sa.PrimaryKeyConstraint("IdTransferenciaLiquidacion"),
    )

    op.bulk_insert(
        sa.table(
            "EstadosTransferenciasLiquidaciones",
            sa.column("Nombre", sa.String),
            sa.column("Activo", sa.Boolean),
        ),
        [
            {"Nombre": "pendiente", "Activo": True},
            {"Nombre": "realizada", "Activo": True},
            {"Nombre": "anulada", "Activo": True},
        ],
    )


def downgrade() -> None:
    op.drop_table("TransferenciasLiquidaciones")
    op.drop_table("LiquidacionesViajes")
    op.drop_table("EstadosTransferenciasLiquidaciones")
