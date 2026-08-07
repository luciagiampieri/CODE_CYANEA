"""crear categorias de documentos"""

revision = '0c82d0651795'
down_revision = '0014_add_icono_to_actividades'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.create_table(
        'CategoriasDocumentos',
        sa.Column('IdCategoriaDocumento', sa.BigInteger(), nullable=False),
        sa.Column('Nombre', sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint('IdCategoriaDocumento'),
        sa.UniqueConstraint('Nombre', name='UQ_CategoriasDocumentos_Nombre')
    )

    op.bulk_insert(
    sa.table(
        'CategoriasDocumentos',
        sa.column('Nombre', sa.String())
    ),
    [
        {"Nombre": "Vuelos"},
        {"Nombre": "Alojamiento"},
        {"Nombre": "Excursiones"},
        {"Nombre": "Seguros"},
        {"Nombre": "Documentación"},
        {"Nombre": "Otros"},
    ]
)

def downgrade() -> None:

    op.drop_table('CategoriasDocumentos')
