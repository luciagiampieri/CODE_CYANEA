"""agrega tipo division y monto asignado a tabla gastos"""

revision = '4959f46b9f77'
down_revision = '0004_email_confirmado'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa

tipo_division_enum = sa.Enum(
    "igualitaria",
    "personalizada",
    name="tipo_division_enum"
)

def upgrade() -> None:
    
    bind = op.get_bind()

    tipo_division_enum.create(bind, checkfirst=True)

    op.add_column(
        "Gastos",
        sa.Column("TipoDivision", tipo_division_enum, nullable=True)
    )

    op.add_column(
        "ParticipantesGastos",
        sa.Column("MontoAsignado", sa.Numeric(12, 2), nullable=True)
    )

    op.execute("""
        UPDATE "Gastos"
        SET "TipoDivision" = 'igualitaria'
        WHERE "TipoDivision" IS NULL
    """)


def downgrade() -> None:
    
    op.drop_column("ParticipantesGastos", "MontoAsignado")
    op.drop_column("Gastos", "TipoDivision")
    tipo_division_enum.drop(op.get_bind(), checkfirst=True)
    