"""create actividades itinerario table"""

revision = '0006_create_actividades'
down_revision = 'f2bda3d1364f'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table(
        'ActividadesItinerario',
        sa.Column('IdActividad', sa.Integer(), nullable=False),
        sa.Column('IdDiaCronograma', sa.Integer(), nullable=False),
        sa.Column('Nombre', sa.String(length=150), nullable=False),
        sa.Column('Descripcion', sa.Text(), nullable=True),
        sa.Column('HoraInicio', sa.Time(), nullable=False),
        sa.Column('HoraFin', sa.Time(), nullable=False),
        sa.Column(
            'FechaCreacion',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['IdDiaCronograma'],
            ['DiasCronogramas.IdDiaCronograma'],
            name='FK_ActividadesItinerario_DiasCronogramas_IdDiaCronograma',
            ondelete='CASCADE',
        ),
        sa.CheckConstraint(
            '"HoraFin" > "HoraInicio"',
            name='CK_ActividadesItinerario_Horarios',
        ),
        sa.PrimaryKeyConstraint('IdActividad'),
    )
    op.create_index(
        'IX_ActividadesItinerario_IdDiaCronograma',
        'ActividadesItinerario',
        ['IdDiaCronograma'],
    )


def downgrade() -> None:
    op.drop_index('IX_ActividadesItinerario_IdDiaCronograma', table_name='ActividadesItinerario')
    op.drop_table('ActividadesItinerario')