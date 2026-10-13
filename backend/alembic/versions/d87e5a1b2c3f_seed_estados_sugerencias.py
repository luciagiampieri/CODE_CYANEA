"""Datos maestros: estados de sugerencias de actividades"""

revision = 'd87e5a1b2c3f'
down_revision = 'c90a1b2c3d4e'
branch_labels = None
depends_on = None

from alembic import op

ESTADOS = ("pendiente", "aceptada", "descartada", "en_votacion")


def upgrade() -> None:
    # Idempotente: solo inserta los estados que falten. El Id se calcula a mano por si
    # la tabla se sembró antes con Ids explícitos y la secuencia quedó atrasada.
    for nombre in ESTADOS:
        op.execute(
            f"""
            INSERT INTO "EstadosSugerenciasActividades" ("IdEstadoSugerenciaActividad", "Nombre")
            SELECT COALESCE(MAX("IdEstadoSugerenciaActividad"), 0) + 1, '{nombre}'
            FROM "EstadosSugerenciasActividades"
            HAVING NOT EXISTS (
                SELECT 1 FROM "EstadosSugerenciasActividades" WHERE LOWER("Nombre") = '{nombre}'
            )
            """
        )
    op.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('"EstadosSugerenciasActividades"', 'IdEstadoSugerenciaActividad'),
            (SELECT MAX("IdEstadoSugerenciaActividad") FROM "EstadosSugerenciasActividades")
        )
        """
    )


def downgrade() -> None:
    # Son datos maestros referenciados por las sugerencias: no se borran al bajar.
    pass