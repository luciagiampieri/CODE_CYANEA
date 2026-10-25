"""US 112: tarifas, límites mensuales y auditoría de planes."""

from alembic import op
import sqlalchemy as sa

revision = "f112a1b2c3d4"
down_revision = "98ef8b59d8e5"
branch_labels = None
depends_on = None


def upgrade():
    # Se conservan los cupos numéricos existentes; cambia el período a mes calendario.
    op.alter_column("Planes", "MaxEscaneosSemanales", new_column_name="MaxEscaneosMensuales")
    for campo in ("PrecioMensualARS", "PrecioAnualARS"):
        op.add_column("Planes", sa.Column(campo, sa.Numeric(12, 2), nullable=True))
        op.create_check_constraint(
            f"CK_Planes_{campo}", "Planes", f'"{campo}" IS NULL OR "{campo}" > 0'
        )
    op.add_column(
        "SuscripcionesUsuarios", sa.Column("PrecioPeriodoARS", sa.Numeric(12, 2), nullable=True)
    )
    op.add_column("SuscripcionesUsuarios", sa.Column("MesesPeriodo", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "CK_SuscripcionesUsuarios_Precio",
        "SuscripcionesUsuarios",
        '"PrecioPeriodoARS" IS NULL OR "PrecioPeriodoARS" > 0',
    )
    op.create_check_constraint(
        "CK_SuscripcionesUsuarios_Periodo",
        "SuscripcionesUsuarios",
        '"MesesPeriodo" IS NULL OR "MesesPeriodo" IN (1, 12)',
    )
    op.create_table(
        "AuditoriaPlanes",
        sa.Column("IdAuditoriaPlan", sa.Integer(), primary_key=True),
        sa.Column("IdPlan", sa.Integer(), sa.ForeignKey("Planes.IdPlan"), nullable=False),
        sa.Column(
            "IdAdministrador", sa.Integer(), sa.ForeignKey("Usuarios.IdUsuario"), nullable=False
        ),
        sa.Column("Campo", sa.String(50), nullable=False),
        sa.Column("ValorAnterior", sa.String(50), nullable=True),
        sa.Column("ValorNuevo", sa.String(50), nullable=False),
        sa.Column("DireccionIp", sa.String(45), nullable=True),
        sa.Column("FechaHora", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_AuditoriaPlanes_FechaHora", "AuditoriaPlanes", ["FechaHora"])


def downgrade():
    op.drop_table("AuditoriaPlanes")
    op.drop_constraint("CK_SuscripcionesUsuarios_Precio", "SuscripcionesUsuarios", type_="check")
    op.drop_constraint("CK_SuscripcionesUsuarios_Periodo", "SuscripcionesUsuarios", type_="check")
    op.drop_column("SuscripcionesUsuarios", "PrecioPeriodoARS")
    op.drop_column("SuscripcionesUsuarios", "MesesPeriodo")
    for campo in ("PrecioMensualARS", "PrecioAnualARS"):
        op.drop_constraint(f"CK_Planes_{campo}", "Planes", type_="check")
        op.drop_column("Planes", campo)
    op.alter_column("Planes", "MaxEscaneosMensuales", new_column_name="MaxEscaneosSemanales")
