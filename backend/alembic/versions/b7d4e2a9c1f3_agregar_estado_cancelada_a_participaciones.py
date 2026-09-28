"""agregar estado cancelada a participaciones (HU 72)"""

revision = "b7d4e2a9c1f3"
down_revision = "8b9c1d2e3f4a"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO "EstadosParticipaciones" ("Nombre", "Descripcion", "Activo")
        SELECT 'cancelada', 'Invitacion cancelada por el administrador.', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM "EstadosParticipaciones" WHERE "Nombre" = 'cancelada'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM "EstadosParticipaciones" ep
        WHERE ep."Nombre" = 'cancelada'
          AND NOT EXISTS (
              SELECT 1 FROM "ParticipantesViajes" pv
              WHERE pv."IdEstadoParticipacion" = ep."IdEstadoParticipacion"
          )
        """
    )