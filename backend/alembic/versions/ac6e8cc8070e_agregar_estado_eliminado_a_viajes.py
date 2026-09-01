"""agregar estado eliminado a viajes"""

revision = 'ac6e8cc8070e'
down_revision = 'f568800db926'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.execute(
        """
        INSERT INTO "EstadosViajes" ("Nombre", "Descripcion", "Activo")
        VALUES (
            'eliminado',
            'Viaje eliminado y no disponible para los usuarios.',
            true
        )
        """
    )

def downgrade() -> None:
    op.execute(
        """
        DELETE FROM "EstadosViajes"
        WHERE "Nombre" = 'eliminado'
        """
    )
