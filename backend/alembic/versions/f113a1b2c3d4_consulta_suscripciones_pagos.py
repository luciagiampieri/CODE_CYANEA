"""US 113: estados y registros de pagos de suscripciones."""

from alembic import op
import sqlalchemy as sa

revision = "f113a1b2c3d4"
down_revision = "f112b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO "EstadosSuscripciones" ("Nombre", "Descripcion", "Activo")
        SELECT 'pendiente_pago', 'Suscripcion pendiente de confirmacion de pago.', TRUE
        WHERE NOT EXISTS (SELECT 1 FROM "EstadosSuscripciones" WHERE "Nombre" = 'pendiente_pago')
    """)
    op.create_table(
        "EstadosPagosSuscripciones",
        sa.Column("IdEstadoPagoSuscripcion", sa.Integer(), primary_key=True),
        sa.Column("Nombre", sa.String(30), nullable=False, unique=True),
        sa.Column("Activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute("""INSERT INTO "EstadosPagosSuscripciones" ("Nombre")
        VALUES ('aprobado'), ('rechazado'), ('pendiente')""")
    op.create_table(
        "PagosSuscripciones",
        sa.Column("IdPagoSuscripcion", sa.Integer(), primary_key=True),
        sa.Column(
            "IdSuscripcionUsuario",
            sa.Integer(),
            sa.ForeignKey("SuscripcionesUsuarios.IdSuscripcionUsuario"),
            nullable=False,
        ),
        sa.Column(
            "IdEstadoPagoSuscripcion",
            sa.Integer(),
            sa.ForeignKey("EstadosPagosSuscripciones.IdEstadoPagoSuscripcion"),
            nullable=False,
        ),
        sa.Column("FechaPago", sa.DateTime(timezone=True), nullable=False),
        sa.Column("MontoARS", sa.Numeric(12, 2), nullable=False),
        sa.Column("IdOperacionPasarela", sa.String(150), nullable=True, unique=True),
        sa.CheckConstraint('"MontoARS" > 0', name="CK_PagosSuscripciones_MontoPositivo"),
    )
    for campo in ("IdSuscripcionUsuario", "IdEstadoPagoSuscripcion", "FechaPago"):
        op.create_index(f"ix_PagosSuscripciones_{campo}", "PagosSuscripciones", [campo])


def downgrade():
    op.drop_table("PagosSuscripciones")
    op.drop_table("EstadosPagosSuscripciones")
    # Conservar el estado maestro si alguna suscripción lo está utilizando.
    op.execute("""DELETE FROM "EstadosSuscripciones" e WHERE "Nombre" = 'pendiente_pago'
        AND NOT EXISTS (SELECT 1 FROM "SuscripcionesUsuarios" s
            WHERE s."IdEstadoSuscripcion" = e."IdEstadoSuscripcion")""")
