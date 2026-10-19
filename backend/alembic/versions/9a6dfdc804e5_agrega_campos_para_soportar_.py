"""agrega campos para soportar actualización automática del estado de los viajes"""

revision = '9a6dfdc804e5'
down_revision = 'f101a2b3c4d5'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO "EstadosParticipaciones" ("Nombre", "Descripcion", "Activo")
        SELECT 'vencida', 'Invitacion vencida porque el viaje finalizo.', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM "EstadosParticipaciones" WHERE "Nombre" = 'vencida'
        )
        """
    )
    op.add_column(
        "ParticipantesViajes",
        sa.Column(
            "VencidaPorFinViaje", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "InvitacionesViajes",
        sa.Column(
            "VencidaPorFinViaje", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "SugerenciasActividades",
        sa.Column(
            "DescartadaPorFinViaje", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.create_index(
        "IX_Viajes_Estado_FechaFin", "Viajes", ["IdEstadoViaje", "FechaFin"]
    )


def downgrade() -> None:
    
    op.drop_index("IX_Viajes_Estado_FechaFin", table_name="Viajes")
    op.drop_column("SugerenciasActividades", "DescartadaPorFinViaje")
    op.drop_column("InvitacionesViajes", "VencidaPorFinViaje")
    op.drop_column("ParticipantesViajes", "VencidaPorFinViaje")
    # Sin el estado 'vencida', esas invitaciones vuelven a quedar pendientes.
    op.execute(
        """
        UPDATE "ParticipantesViajes" pv
        SET "IdEstadoParticipacion" = inv."IdEstadoParticipacion"
        FROM "EstadosParticipaciones" ven, "EstadosParticipaciones" inv
        WHERE ven."Nombre" = 'vencida'
          AND inv."Nombre" = 'invitado'
          AND pv."IdEstadoParticipacion" = ven."IdEstadoParticipacion"
        """
    )
    op.execute("""DELETE FROM "EstadosParticipaciones" WHERE "Nombre" = 'vencida'""")
    
