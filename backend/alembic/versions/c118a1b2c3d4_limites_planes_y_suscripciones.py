"""US 118: límites por plan y suscripciones de usuarios"""

revision = "c118a1b2c3d4"
down_revision = "9a6dfdc804e5"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa

COLUMNAS_LIMITES = (
    "MaxViajesActivos",
    "MaxSugerenciasDiarias",
    "MaxEscaneosSemanales",
    "MaxAlmacenamientoMb",
)


def upgrade() -> None:
    op.alter_column("Planes", "MaxParticipantesViaje", existing_type=sa.Integer(), nullable=True)
    for columna in COLUMNAS_LIMITES:
        op.add_column("Planes", sa.Column(columna, sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE "Planes"
        SET "MaxViajesActivos" = 5, "MaxSugerenciasDiarias" = 10,
            "MaxEscaneosSemanales" = 3, "MaxAlmacenamientoMb" = 100
        WHERE "Nombre" = 'gratuito'
        """
    )
    op.execute(
        """
        UPDATE "Planes"
        SET "MaxParticipantesViaje"= 10, "MaxViajesActivos" = 15, "MaxSugerenciasDiarias" = 20,
            "MaxEscaneosSemanales" = 50, "MaxAlmacenamientoMb" = 2048
        WHERE "Nombre" = 'pro'
        """
    )

    op.create_table(
        "EstadosSuscripciones",
        sa.Column("IdEstadoSuscripcion", sa.Integer(), primary_key=True),
        sa.Column("Nombre", sa.String(30), nullable=False, unique=True),
        sa.Column("Descripcion", sa.String(200), nullable=True),
        sa.Column("Activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute(
        """
        INSERT INTO "EstadosSuscripciones" ("Nombre", "Descripcion") VALUES
            ('activa', 'Suscripcion vigente con renovacion activa.'),
            ('cancelada', 'Renovacion cancelada; vigente hasta FechaFin.'),
            ('vencida', 'Suscripcion finalizada; el usuario vuelve al plan gratuito.')
        """
    )

    op.create_table(
        "SuscripcionesUsuarios",
        sa.Column("IdSuscripcionUsuario", sa.Integer(), primary_key=True),
        sa.Column(
            "IdUsuario", sa.Integer(),
            sa.ForeignKey("Usuarios.IdUsuario", name="FK_SuscUsuarios_Usuarios_IdUsuario"),
            nullable=False,
        ),
        sa.Column(
            "IdPlan", sa.Integer(),
            sa.ForeignKey("Planes.IdPlan", name="FK_SuscUsuarios_Planes_IdPlan"),
            nullable=False,
        ),
        sa.Column(
            "IdEstadoSuscripcion", sa.Integer(),
            sa.ForeignKey(
                "EstadosSuscripciones.IdEstadoSuscripcion",
                name="FK_SuscUsuarios_EstSusc_IdEstadoSuscripcion",
            ),
            nullable=False,
        ),
        sa.Column("FechaInicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("FechaFin", sa.DateTime(timezone=True), nullable=False),
        sa.Column("FechaCancelacion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("FechaCreacion", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('"FechaFin" > "FechaInicio"', name="CK_SuscripcionesUsuarios_Fechas"),
    )
    op.create_index(
        "IX_SuscripcionesUsuarios_Usuario_Estado",
        "SuscripcionesUsuarios", ["IdUsuario", "IdEstadoSuscripcion"],
    )
    op.create_index(
        "IX_SuscripcionesUsuarios_Estado_FechaFin",
        "SuscripcionesUsuarios", ["IdEstadoSuscripcion", "FechaFin"],
    )


def downgrade() -> None:
    op.drop_index("IX_SuscripcionesUsuarios_Estado_FechaFin", table_name="SuscripcionesUsuarios")
    op.drop_index("IX_SuscripcionesUsuarios_Usuario_Estado", table_name="SuscripcionesUsuarios")
    op.drop_table("SuscripcionesUsuarios")
    op.drop_table("EstadosSuscripciones")
    for columna in reversed(COLUMNAS_LIMITES):
        op.drop_column("Planes", columna)
    op.execute("""UPDATE "Planes" SET "MaxParticipantesViaje" = 3 WHERE "MaxParticipantesViaje" IS NULL""")
    op.alter_column("Planes", "MaxParticipantesViaje", existing_type=sa.Integer(), nullable=False)