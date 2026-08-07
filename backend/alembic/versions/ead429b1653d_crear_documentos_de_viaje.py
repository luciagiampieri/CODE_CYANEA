"""crear documentos de viaje"""

revision = 'ead429b1653d'
down_revision = '0c82d0651795'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:

    op.alter_column(
        "CategoriasDocumentos",
        "IdCategoriaDocumento",
        existing_type=sa.BIGINT(),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_autoincrement=True,
    )
    
    op.create_table('DocumentosViajes',
    sa.Column('IdDocumento', sa.Integer(), nullable=False),
    sa.Column('IdViaje', sa.Integer(), nullable=False),
    sa.Column('IdCategoriaDocumento', sa.Integer(), nullable=False),
    sa.Column('IdUsuarioSubida', sa.Integer(), nullable=False),
    sa.Column('NombreArchivo', sa.String(length=255), nullable=False),
    sa.Column('UrlArchivo', sa.String(length=500), nullable=False),
    sa.Column('FechaSubida', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['IdCategoriaDocumento'], ['CategoriasDocumentos.IdCategoriaDocumento'], name='FK_DocumentosViajes_CategoriasDocumentos_IdCategoriaDocumento'),
    sa.ForeignKeyConstraint(['IdUsuarioSubida'], ['Usuarios.IdUsuario'], name='FK_DocumentosViajes_Usuarios_IdUsuario'),
    sa.ForeignKeyConstraint(['IdViaje'], ['Viajes.IdViaje'], name='FK_DocumentosViajes_Viajes_IdViaje'),
    sa.PrimaryKeyConstraint('IdDocumento')
    )

def downgrade() -> None:

    op.drop_table('DocumentosViajes')

    op.alter_column(
        "CategoriasDocumentos",
        "IdCategoriaDocumento",
        existing_type=sa.Integer(),
        type_=sa.BIGINT(),
        existing_nullable=False,
        existing_autoincrement=True,
    )