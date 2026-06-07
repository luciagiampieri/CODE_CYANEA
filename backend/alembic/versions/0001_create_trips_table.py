"""create baseline domain tables"""

from alembic import op
import sqlalchemy as sa


revision = "0001_create_trips_table"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "EstadosViajes",
        sa.Column("IdEstadoViaje", sa.SmallInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("Nombre", sa.String(length=30), nullable=False),
        sa.Column("Descripcion", sa.String(length=200), nullable=True),
        sa.Column("Activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index("UX_EstadosViajes_Nombre", "EstadosViajes", ["Nombre"], unique=True)

    op.create_table(
        "RolesParticipantes",
        sa.Column(
            "IdRolParticipante",
            sa.SmallInteger(),
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("Nombre", sa.String(length=30), nullable=False),
        sa.Column("Descripcion", sa.String(length=200), nullable=True),
        sa.Column("Activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index("UX_RolesParticipantes_Nombre", "RolesParticipantes", ["Nombre"], unique=True)

    op.create_table(
        "EstadosParticipaciones",
        sa.Column(
            "IdEstadoParticipacion",
            sa.SmallInteger(),
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("Nombre", sa.String(length=30), nullable=False),
        sa.Column("Descripcion", sa.String(length=200), nullable=True),
        sa.Column("Activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index(
        "UX_EstadosParticipaciones_Nombre",
        "EstadosParticipaciones",
        ["Nombre"],
        unique=True,
    )
    op.create_table(
        "EstadosInvitaciones",
        sa.Column(
            "IdEstadoInvitacion",
            sa.SmallInteger(),
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("Nombre", sa.String(length=30), nullable=False),
        sa.Column("Descripcion", sa.String(length=200), nullable=True),
        sa.Column("Activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index("UX_EstadosInvitaciones_Nombre", "EstadosInvitaciones", ["Nombre"], unique=True)

    op.create_table(
        "Usuarios",
        sa.Column("IdUsuario", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("Email", sa.String(length=255), nullable=False),
        sa.Column("Nombre", sa.String(length=100), nullable=False),
        sa.Column("Apellido", sa.String(length=100), nullable=False),
        sa.Column("NombreUsuario", sa.String(length=50), nullable=False),
        sa.Column("FotoUrl", sa.Text(), nullable=True),
        sa.Column("FechaAlta", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("FechaBaja", sa.DateTime(timezone=True), nullable=True),
        sa.Column("Activo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index("UX_Usuarios_Email", "Usuarios", ["Email"], unique=True)
    op.create_index("UX_Usuarios_NombreUsuario", "Usuarios", ["NombreUsuario"], unique=True)

    op.create_table(
        "Viajes",
        sa.Column("IdViaje", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("Titulo", sa.String(length=150), nullable=False),
        sa.Column("Destino", sa.String(length=150), nullable=False),
        sa.Column("Descripcion", sa.Text(), nullable=True),
        sa.Column("FechaInicio", sa.Date(), nullable=True),
        sa.Column("FechaFin", sa.Date(), nullable=True),
        sa.Column("IdEstadoViaje", sa.SmallInteger(), nullable=False),
        sa.Column("Moneda", sa.String(length=3), server_default="ARS", nullable=False),
        sa.Column("IdAdministrador", sa.BigInteger(), nullable=False),
        sa.Column(
            "FechaCreacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "FechaActualizacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["IdEstadoViaje"],
            ["EstadosViajes.IdEstadoViaje"],
            name="FK_Viajes_EstViajes_IdEstadoViaje",
        ),
        sa.ForeignKeyConstraint(
            ["IdAdministrador"],
            ["Usuarios.IdUsuario"],
            name="FK_Viajes_Usuarios_IdAdministrador",
        ),
        sa.CheckConstraint(
            '"FechaFin" IS NULL OR "FechaInicio" IS NULL OR "FechaFin" >= "FechaInicio"',
            name="CK_Viajes_Fechas",
        ),
    )
    op.create_index("IX_Viajes_IdEstadoViaje", "Viajes", ["IdEstadoViaje"])
    op.create_index("IX_Viajes_IdAdministrador", "Viajes", ["IdAdministrador"])

    op.create_table(
        "ParticipantesViajes",
        sa.Column(
            "IdParticipanteViaje",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("IdViaje", sa.BigInteger(), nullable=False),
        sa.Column("IdUsuario", sa.BigInteger(), nullable=False),
        sa.Column("IdRolParticipante", sa.SmallInteger(), nullable=False),
        sa.Column("IdEstadoParticipacion", sa.SmallInteger(), nullable=False),
        sa.Column(
            "FechaInvitacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("FechaRespuesta", sa.DateTime(timezone=True), nullable=True),
        sa.Column("FechaIncorporacion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("InvitadoPor", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["IdViaje"],
            ["Viajes.IdViaje"],
            name="FK_ParticipantesViajes_Viajes_IdViaje",
        ),
        sa.ForeignKeyConstraint(
            ["IdUsuario"],
            ["Usuarios.IdUsuario"],
            name="FK_ParticipantesViajes_Usuarios_IdUsuario",
        ),
        sa.ForeignKeyConstraint(
            ["InvitadoPor"],
            ["Usuarios.IdUsuario"],
            name="FK_ParticipantesViajes_Usuarios_InvitadoPor",
        ),
        sa.ForeignKeyConstraint(
            ["IdRolParticipante"],
            ["RolesParticipantes.IdRolParticipante"],
            name="FK_PartViajes_RolesPart_IdRolParticipante",
        ),
        sa.ForeignKeyConstraint(
            ["IdEstadoParticipacion"],
            ["EstadosParticipaciones.IdEstadoParticipacion"],
            name="FK_PartViajes_EstPart_IdEstadoParticipacion",
        ),
        sa.UniqueConstraint(
            "IdViaje",
            "IdUsuario",
            name="UX_ParticipantesViajes_IdViaje_IdUsuario",
        ),
    )
    op.create_index("IX_ParticipantesViajes_IdUsuario", "ParticipantesViajes", ["IdUsuario"])
    op.create_index("IX_ParticipantesViajes_InvitadoPor", "ParticipantesViajes", ["InvitadoPor"])
    op.create_index(
        "IX_ParticipantesViajes_IdRolParticipante",
        "ParticipantesViajes",
        ["IdRolParticipante"],
    )
    op.create_index(
        "IX_ParticipantesViajes_IdEstadoParticipacion",
        "ParticipantesViajes",
        ["IdEstadoParticipacion"],
    )

    op.create_table(
        "InvitacionesViajes",
        sa.Column(
            "IdInvitacionViaje",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("IdViaje", sa.BigInteger(), nullable=False),
        sa.Column("EmailInvitado", sa.String(length=255), nullable=False),
        sa.Column("NombreInvitado", sa.String(length=150), nullable=True),
        sa.Column("TokenInvitacion", sa.String(length=120), nullable=False),
        sa.Column(
            "FechaInvitacion",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("FechaVencimiento", sa.DateTime(timezone=True), nullable=False),
        sa.Column("FechaAceptacion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("IdEstadoInvitacion", sa.SmallInteger(), nullable=False),
        sa.Column("InvitadoPor", sa.BigInteger(), nullable=False),
        sa.Column("IdUsuarioRegistrado", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(
            ["IdViaje"],
            ["Viajes.IdViaje"],
            name="FK_InvitacionesViajes_Viajes_IdViaje",
        ),
        sa.ForeignKeyConstraint(
            ["IdEstadoInvitacion"],
            ["EstadosInvitaciones.IdEstadoInvitacion"],
            name="FK_InvitacionesViajes_EstadosInvitaciones_IdEstadoInvitacion",
        ),
        sa.ForeignKeyConstraint(
            ["InvitadoPor"],
            ["Usuarios.IdUsuario"],
            name="FK_InvitacionesViajes_Usuarios_InvitadoPor",
        ),
        sa.ForeignKeyConstraint(
            ["IdUsuarioRegistrado"],
            ["Usuarios.IdUsuario"],
            name="FK_InvitacionesViajes_Usuarios_IdUsuarioRegistrado",
        ),
        sa.UniqueConstraint(
            "IdViaje",
            "EmailInvitado",
            name="UX_InvitacionesViajes_IdViaje_EmailInvitado",
        ),
        sa.UniqueConstraint(
            "TokenInvitacion",
            name="UX_InvitacionesViajes_TokenInvitacion",
        ),
    )
    op.create_index("IX_InvitacionesViajes_IdViaje", "InvitacionesViajes", ["IdViaje"])
    op.create_index(
        "IX_InvitacionesViajes_IdEstadoInvitacion",
        "InvitacionesViajes",
        ["IdEstadoInvitacion"],
    )
    op.create_index("IX_InvitacionesViajes_InvitadoPor", "InvitacionesViajes", ["InvitadoPor"])
    op.create_index(
        "IX_InvitacionesViajes_IdUsuarioRegistrado",
        "InvitacionesViajes",
        ["IdUsuarioRegistrado"],
    )


def downgrade() -> None:
    op.drop_index("IX_InvitacionesViajes_IdUsuarioRegistrado", table_name="InvitacionesViajes")
    op.drop_index("IX_InvitacionesViajes_InvitadoPor", table_name="InvitacionesViajes")
    op.drop_index("IX_InvitacionesViajes_IdEstadoInvitacion", table_name="InvitacionesViajes")
    op.drop_index("IX_InvitacionesViajes_IdViaje", table_name="InvitacionesViajes")
    op.drop_table("InvitacionesViajes")
    op.drop_index(
        "IX_ParticipantesViajes_IdEstadoParticipacion",
        table_name="ParticipantesViajes",
    )
    op.drop_index("IX_ParticipantesViajes_IdRolParticipante", table_name="ParticipantesViajes")
    op.drop_index("IX_ParticipantesViajes_InvitadoPor", table_name="ParticipantesViajes")
    op.drop_index("IX_ParticipantesViajes_IdUsuario", table_name="ParticipantesViajes")
    op.drop_table("ParticipantesViajes")
    op.drop_index("IX_Viajes_IdAdministrador", table_name="Viajes")
    op.drop_index("IX_Viajes_IdEstadoViaje", table_name="Viajes")
    op.drop_table("Viajes")
    op.drop_index("UX_Usuarios_NombreUsuario", table_name="Usuarios")
    op.drop_index("UX_Usuarios_Email", table_name="Usuarios")
    op.drop_table("Usuarios")
    op.drop_index("UX_EstadosInvitaciones_Nombre", table_name="EstadosInvitaciones")
    op.drop_table("EstadosInvitaciones")
    op.drop_index("UX_EstadosParticipaciones_Nombre", table_name="EstadosParticipaciones")
    op.drop_table("EstadosParticipaciones")
    op.drop_index("UX_RolesParticipantes_Nombre", table_name="RolesParticipantes")
    op.drop_table("RolesParticipantes")
    op.drop_index("UX_EstadosViajes_Nombre", table_name="EstadosViajes")
    op.drop_table("EstadosViajes")
