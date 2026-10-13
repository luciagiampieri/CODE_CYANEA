"""US 90: votacion desde sugerencias de actividades"""

revision = 'c90a1b2c3d4e'
down_revision = '1580d781e066'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        'Propuestas',
        sa.Column('IdSugerenciaActividad', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'FK_Propuestas_SugAct_IdSugerencia',
        'Propuestas',
        'SugerenciasActividades',
        ['IdSugerenciaActividad'],
        ['IdSugerenciaActividad'],
        ondelete='SET NULL',
    )
    op.create_index(
        'IX_Propuestas_IdSugerenciaActividad',
        'Propuestas',
        ['IdSugerenciaActividad'],
        unique=False,
    )


    op.execute(
        """
        INSERT INTO "EstadosSugerenciasActividades" ("IdEstadoSugerenciaActividad", "Nombre")
        SELECT COALESCE(MAX("IdEstadoSugerenciaActividad"), 0) + 1, 'en_votacion'
        FROM "EstadosSugerenciasActividades"
        HAVING NOT EXISTS (
            SELECT 1 FROM "EstadosSugerenciasActividades" WHERE LOWER("Nombre") = 'en_votacion'
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
    op.execute(
        """
        UPDATE "SugerenciasActividades"
        SET "IdEstadoSugerenciaActividad" = (
            SELECT "IdEstadoSugerenciaActividad" FROM "EstadosSugerenciasActividades"
            WHERE LOWER("Nombre") = 'pendiente'
        )
        WHERE "IdEstadoSugerenciaActividad" = (
            SELECT "IdEstadoSugerenciaActividad" FROM "EstadosSugerenciasActividades"
            WHERE LOWER("Nombre") = 'en_votacion'
        )
        """
    )
    op.execute("""DELETE FROM "EstadosSugerenciasActividades" WHERE LOWER("Nombre") = 'en_votacion'""")
    op.drop_index('IX_Propuestas_IdSugerenciaActividad', table_name='Propuestas')
    op.drop_constraint('FK_Propuestas_SugAct_IdSugerencia', 'Propuestas', type_='foreignkey')
    op.drop_column('Propuestas', 'IdSugerenciaActividad')