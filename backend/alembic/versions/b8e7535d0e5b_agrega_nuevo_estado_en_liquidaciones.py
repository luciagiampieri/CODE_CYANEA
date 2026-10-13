"""estado de transferencia "informada"
 
El deudor avisa "Ya transferí" y la transferencia queda esperando que el
acreedor confirme si le llegó. Para recalcular la liquidación ya cuenta como
pagada. Solo agrega un dato maestro: no hay columnas nuevas.
"""

revision = 'b8e7535d0e5b'
down_revision = '23e53df411c6'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

     op.execute(
        """
        INSERT INTO "EstadosTransferenciasLiquidaciones" ("Nombre", "Activo")
        SELECT 'informada', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM "EstadosTransferenciasLiquidaciones" WHERE "Nombre" = 'informada'
        )
        """
    )
 

def downgrade() -> None:

    op.execute(
        """
        UPDATE "TransferenciasLiquidaciones"
        SET "IdEstadoTransferenciaLiquidacion" = (
            SELECT "IdEstadoTransferenciaLiquidacion"
            FROM "EstadosTransferenciasLiquidaciones" WHERE "Nombre" = 'pendiente'
        )
        WHERE "IdEstadoTransferenciaLiquidacion" = (
            SELECT "IdEstadoTransferenciaLiquidacion"
            FROM "EstadosTransferenciasLiquidaciones" WHERE "Nombre" = 'informada'
        )
        """
    )
    op.execute(
        """DELETE FROM "EstadosTransferenciasLiquidaciones" WHERE "Nombre" = 'informada'"""
    )
    
