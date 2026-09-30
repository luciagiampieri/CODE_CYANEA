"""agregar consentimiento de procesamiento con IA (US 93)

Agrega a Usuarios el consentimiento explícito para que las imágenes de
comprobantes se procesen con un servicio externo de inteligencia artificial
(RNF-13, RNF-33) y la fecha en que se otorgó.
"""

revision = "c93e5a7b1d20"
down_revision = "b86a1c2d3e4f"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column(
            "ConsienteProcesamientoIA",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column("FechaConsentimientoIA", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "FechaConsentimientoIA")
    op.drop_column("Usuarios", "ConsienteProcesamientoIA")
