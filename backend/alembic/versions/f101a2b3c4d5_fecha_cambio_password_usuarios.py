"""agregar fecha de cambio de contraseña a usuarios (US 101)

Al cambiar la contraseña desde "Mi cuenta" se registra la fecha del cambio: los
tokens emitidos antes quedan inválidos, lo que cierra las sesiones de los demás
dispositivos. El dispositivo que hizo el cambio recibe un token nuevo.
"""

revision = "f101a2b3c4d5"
down_revision = "4c6446a84818"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column("FechaCambioPassword", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "FechaCambioPassword")
