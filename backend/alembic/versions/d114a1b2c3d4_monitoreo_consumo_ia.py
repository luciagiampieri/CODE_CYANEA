"""US 114: métricas de consumo de IA y umbral de costo mensual"""

revision = "d114a1b2c3d4"
down_revision = "d110a1b2c3d4"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.execute('ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "DuracionMs" INTEGER')
    op.execute('ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "TokensEntrada" INTEGER')
    op.execute('ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "TokensSalida" INTEGER')
    op.execute('ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "Imagenes" INTEGER')
    op.execute(
        'ALTER TABLE "SolicitudesIA" ADD COLUMN IF NOT EXISTS "CostoEstimadoUSD" NUMERIC(12, 6) NOT NULL DEFAULT 0'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "IX_SolicitudesIA_Servicio_Fecha" ON "SolicitudesIA" ("Servicio", "Fecha")'
    )

    op.create_table(
        "ConfiguracionesMonitoreoIA",
        sa.Column("IdConfiguracionMonitoreoIA", sa.Integer(), primary_key=True),
        sa.Column("UmbralCostoMensualUSD", sa.Numeric(12, 2), nullable=True),
        sa.Column("FechaActualizacion", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "IdUsuarioActualizacion",
            sa.Integer(),
            sa.ForeignKey(
                "Usuarios.IdUsuario",
                name="FK_ConfiguracionesMonitoreoIA_Usuarios_IdUsuarioActualizacion",
            ),
            nullable=True,
        ),
        sa.Column("PeriodoUltimaAlerta", sa.String(length=7), nullable=True),
        sa.Column("UmbralUltimaAlertaUSD", sa.Numeric(12, 2), nullable=True),
        sa.Column("FechaUltimaAlerta", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            '"UmbralCostoMensualUSD" IS NULL OR "UmbralCostoMensualUSD" > 0',
            name="CK_ConfiguracionesMonitoreoIA_Umbral",
        ),
    )
    op.execute(
        'INSERT INTO "ConfiguracionesMonitoreoIA" ("IdConfiguracionMonitoreoIA") VALUES (1)'
    )


def downgrade() -> None:
    op.drop_table("ConfiguracionesMonitoreoIA")
    op.execute('DROP INDEX IF EXISTS "IX_SolicitudesIA_Servicio_Fecha"')
    for columna in ("CostoEstimadoUSD", "Imagenes", "TokensSalida", "TokensEntrada", "DuracionMs"):
        op.execute(f'ALTER TABLE "SolicitudesIA" DROP COLUMN IF EXISTS "{columna}"')
