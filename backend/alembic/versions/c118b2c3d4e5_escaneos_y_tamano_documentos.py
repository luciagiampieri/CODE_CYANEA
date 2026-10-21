"""US 118: escaneos de comprobantes y tamaño de documentos"""

revision = "c118b2c3d4e5"
down_revision = "c118a1b2c3d4"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table(
        "EscaneosComprobantes",
        sa.Column("IdEscaneoComprobante", sa.Integer(), primary_key=True),
        sa.Column(
            "IdUsuario", sa.Integer(),
            sa.ForeignKey("Usuarios.IdUsuario", name="FK_EscaneosComprobantes_Usuarios_IdUsuario"),
            nullable=False,
        ),
        sa.Column(
            "IdViaje", sa.Integer(),
            sa.ForeignKey("Viajes.IdViaje", name="FK_EscaneosComprobantes_Viajes_IdViaje"),
            nullable=False,
        ),
        sa.Column("FechaEscaneo", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "IX_EscaneosComprobantes_Usuario_Fecha",
        "EscaneosComprobantes", ["IdUsuario", "FechaEscaneo"],
    )
    op.add_column("DocumentosViajes", sa.Column("TamanoBytes", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("DocumentosViajes", "TamanoBytes")
    op.drop_index("IX_EscaneosComprobantes_Usuario_Fecha", table_name="EscaneosComprobantes")
    op.drop_table("EscaneosComprobantes")