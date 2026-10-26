"""agrega estado descartada en SuscripcionesUsuarios"""

revision = 'd7619b0cb76e'
down_revision = 'f113a1b2c3d4'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.execute("""
            INSERT INTO "EstadosSuscripciones" ("Nombre", "Descripcion", "Activo")
            SELECT 'descartada', 'Intento de suscripcion sin pago que no se concreto.', TRUE
            WHERE NOT EXISTS (SELECT 1 FROM "EstadosSuscripciones" WHERE "Nombre" = 'descartada')
        """)
    op.add_column(
            "SuscripcionesUsuarios",
            sa.Column("IdSuscripcionPasarela", sa.String(150), nullable=True),
        )
    op.add_column(
            "SuscripcionesUsuarios",
            sa.Column("EstadoPasarela", sa.String(30), nullable=True),
        )
    op.add_column(
            "SuscripcionesUsuarios",
            sa.Column("FechaAceptacionRenovacion", sa.DateTime(timezone=True), nullable=True),
        )
    op.create_unique_constraint(
            "UQ_SuscripcionesUsuarios_IdSuscripcionPasarela",
            "SuscripcionesUsuarios",
            ["IdSuscripcionPasarela"],
        )


def downgrade() -> None:
    op.drop_constraint(
            "UQ_SuscripcionesUsuarios_IdSuscripcionPasarela", "SuscripcionesUsuarios", type_="unique"
        )
    op.drop_column("SuscripcionesUsuarios", "FechaAceptacionRenovacion")
    op.drop_column("SuscripcionesUsuarios", "EstadoPasarela")
    op.drop_column("SuscripcionesUsuarios", "IdSuscripcionPasarela")
        # Conservar el estado maestro si alguna suscripción lo está utilizando.
    op.execute("""DELETE FROM "EstadosSuscripciones" e WHERE "Nombre" = 'descartada'
            AND NOT EXISTS (SELECT 1 FROM "SuscripcionesUsuarios" s
                WHERE s."IdEstadoSuscripcion" = e."IdEstadoSuscripcion")""")
    
