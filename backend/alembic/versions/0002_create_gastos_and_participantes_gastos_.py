"""create gastos and participantes gastos tables"""

from alembic import op
import sqlalchemy as sa

revision = 'd10b250a5927'
down_revision = '0001_create_trips_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    
    op.create_table(
        "Gastos",
        sa.Column("IdGasto", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("IdViaje", sa.BigInteger(), nullable=False),
        sa.Column("Nombre", sa.String(length=150), nullable=False),
        sa.Column("Monto", sa.Numeric(12, 2), nullable=False),
        sa.Column("Categoria", sa.String(length=50), nullable=False),
        sa.Column("IdPagador", sa.BigInteger(), nullable=False),
        sa.Column(
            "DividirEntreTodos",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("FechaGasto", sa.Date(), nullable=False),
        sa.Column(
            "FechaCreacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "FechaActualizacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["IdViaje"],
            ["Viajes.IdViaje"],
            name="FK_Gastos_Viajes_IdViaje",
        ),
        sa.ForeignKeyConstraint(
            ["IdPagador"],
            ["ParticipantesViajes.IdParticipanteViaje"],
            name="FK_Gastos_ParticipantesViajes_IdPagador",
        ),
        sa.CheckConstraint(
            '"Monto" > 0',
            name="CK_Gastos_Monto",
        ),
        sa.CheckConstraint(
            "\"Categoria\" IN ('transporte','alojamiento','actividades','comidas','otros')",
            name="CK_Gastos_Categoria",
        ),

        sa.CheckConstraint(
            'TRIM("Nombre") <> \'\'',
            name="CK_Gastos_Nombre",
        ),
    )

    op.create_index("IX_Gastos_IdViaje", "Gastos", ["IdViaje"])
    op.create_index("IX_Gastos_IdPagador", "Gastos", ["IdPagador"])

    op.create_table(
        "ParticipantesGastos",
        sa.Column(
            "IdParticipanteGasto",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("IdGasto", sa.BigInteger(), nullable=False),
        sa.Column("IdParticipanteViaje", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["IdGasto"],
            ["Gastos.IdGasto"],
            name="FK_ParticipantesGastos_Gastos_IdGasto",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["IdParticipanteViaje"],
            ["ParticipantesViajes.IdParticipanteViaje"],
            name="FK_ParticipantesGastos_ParticipantesViajes_IdParticipanteViaje",
        ),
        sa.UniqueConstraint(
            "IdGasto",
            "IdParticipanteViaje",
            name="UX_ParticipantesGastos_IdGasto_IdParticipanteViaje",
        ),
    )

    op.create_index(
        "IX_ParticipantesGastos_IdGasto",
        "ParticipantesGastos",
        ["IdGasto"],
    )

    op.create_index(
        "IX_ParticipantesGastos_IdParticipanteViaje",
        "ParticipantesGastos",
        ["IdParticipanteViaje"],
    )

def downgrade() -> None:
  
    op.drop_index(
        "IX_ParticipantesGastos_IdParticipanteViaje",
        table_name="ParticipantesGastos",
    )
    op.drop_index(
        "IX_ParticipantesGastos_IdGasto",
        table_name="ParticipantesGastos",
    )
    op.drop_table("ParticipantesGastos")

    op.drop_index("IX_Gastos_IdPagador", table_name="Gastos")
    op.drop_index("IX_Gastos_IdViaje", table_name="Gastos")
    op.drop_table("Gastos")
