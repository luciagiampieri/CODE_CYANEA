"""US 117: procesar notificaciones de la pasarela de pagos."""

from alembic import op
import sqlalchemy as sa

revision = "f117a1b2c3d4"
down_revision = "ee9a484ba2bb"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "SuscripcionesUsuarios",
        sa.Column("FechaPendientePago", sa.DateTime(timezone=True), nullable=True),
    )
    # Renovaciones que ya estaban en "pendiente_pago": el plazo corre desde la
    # fecha de renovación que no se pudo cobrar.
    op.execute("""
        UPDATE "SuscripcionesUsuarios" s SET "FechaPendientePago" = s."FechaFin"
        FROM "EstadosSuscripciones" e
        WHERE e."IdEstadoSuscripcion" = s."IdEstadoSuscripcion"
          AND e."Nombre" = 'pendiente_pago'
          AND s."FechaPendientePago" IS NULL
          AND EXISTS (
              SELECT 1 FROM "PagosSuscripciones" p
              JOIN "EstadosPagosSuscripciones" ep
                ON ep."IdEstadoPagoSuscripcion" = p."IdEstadoPagoSuscripcion"
              WHERE p."IdSuscripcionUsuario" = s."IdSuscripcionUsuario"
                AND ep."Nombre" = 'aprobado'
          )
    """)
    op.create_index(
        "IX_SuscripcionesUsuarios_FechaPendientePago",
        "SuscripcionesUsuarios",
        ["FechaPendientePago"],
    )

    op.create_table(
        "EstadosNotificacionesPasarela",
        sa.Column("IdEstadoNotificacionPasarela", sa.Integer(), primary_key=True),
        sa.Column("Nombre", sa.String(30), nullable=False, unique=True),
        sa.Column("Activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute("""INSERT INTO "EstadosNotificacionesPasarela" ("Nombre")
        VALUES ('procesada'), ('ignorada'), ('error')""")
    op.create_table(
        "NotificacionesPasarela",
        sa.Column("IdNotificacionPasarela", sa.Integer(), primary_key=True),
        sa.Column(
            "IdEstadoNotificacionPasarela",
            sa.Integer(),
            sa.ForeignKey("EstadosNotificacionesPasarela.IdEstadoNotificacionPasarela"),
            nullable=False,
        ),
        sa.Column("Tipo", sa.String(60), nullable=False),
        sa.Column("IdRecurso", sa.String(150), nullable=False),
        sa.Column("IdSolicitudPasarela", sa.String(150), nullable=True),
        sa.Column("Error", sa.String(500), nullable=True),
        sa.Column(
            "FechaRecepcion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "IX_NotificacionesPasarela_Estado_Fecha",
        "NotificacionesPasarela",
        ["IdEstadoNotificacionPasarela", "FechaRecepcion"],
    )
    op.create_index(
        "IX_NotificacionesPasarela_Recurso", "NotificacionesPasarela", ["Tipo", "IdRecurso"]
    )


def downgrade():
    op.drop_table("NotificacionesPasarela")
    op.drop_table("EstadosNotificacionesPasarela")
    op.execute('DROP INDEX IF EXISTS "IX_SuscripcionesUsuarios_FechaPendientePago"')
    op.drop_column("SuscripcionesUsuarios", "FechaPendientePago")
