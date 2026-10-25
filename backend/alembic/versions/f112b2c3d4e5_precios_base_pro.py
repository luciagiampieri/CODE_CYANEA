"""Precios base de Pro aprobados: ARS 4900 mensual y ARS 49000 anual."""

from alembic import op

revision = "f112b2c3d4e5"
down_revision = "f112a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade():
    # No sobrescribir tarifas que un administrador ya haya configurado.
    op.execute("""
        UPDATE "Planes"
        SET "PrecioMensualARS" = COALESCE("PrecioMensualARS", 4900.00),
            "PrecioAnualARS" = COALESCE("PrecioAnualARS", 49000.00)
        WHERE "Nombre" = 'pro'
    """)


def downgrade():
    # Una reversión técnica no debe borrar precios comerciales ya configurados.
    pass
