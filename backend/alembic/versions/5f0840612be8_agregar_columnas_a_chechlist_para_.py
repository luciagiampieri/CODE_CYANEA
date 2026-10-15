"""agregar columnas a chechlist para tareas creadas desde recomendacion de entradas"""

revision = '5f0840612be8'
down_revision = 'f8c0b4e37d69'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa

CATEGORIA = "Reservas y entradas"

def upgrade() -> None:

    op.alter_column(
            'Checklists',
            'Nombre',
            existing_type=sa.String(length=60),
            type_=sa.String(length=150),
            existing_nullable=False,
        )
    op.add_column('Checklists', sa.Column('Enlace', sa.String(length=500), nullable=True))
    op.add_column('Checklists', sa.Column('IdActividad', sa.Integer(), nullable=True))
    op.add_column(
            'Checklists',
            sa.Column('GooglePlaceIdEntradas', sa.String(length=255), nullable=True),
        )
    op.create_foreign_key(
            'FK_Checklists_ActividadesItinerario',
            'Checklists',
            'ActividadesItinerario',
            ['IdActividad'],
            ['IdActividad'],
            ondelete='SET NULL',
        )
    op.create_index('ix_Checklists_IdActividad', 'Checklists', ['IdActividad'])
    
    op.execute(
            sa.text(
                'INSERT INTO "CategoriasChecklist" ("Nombre", "Activo") '
                'SELECT :nombre, TRUE '
                'WHERE NOT EXISTS (SELECT 1 FROM "CategoriasChecklist" WHERE "Nombre" = :nombre)'
            ).bindparams(nombre=CATEGORIA)
        )

def downgrade() -> None:

# La categoría no se borra: puede haber tareas creadas a mano que la usan.
    op.drop_index('ix_Checklists_IdActividad', table_name='Checklists')
    op.drop_constraint('FK_Checklists_ActividadesItinerario', 'Checklists', type_='foreignkey')
    op.drop_column('Checklists', 'GooglePlaceIdEntradas')
    op.drop_column('Checklists', 'IdActividad')
    op.drop_column('Checklists', 'Enlace')
    # Los títulos de más de 60 caracteres se recortan para volver al largo anterior.
    op.execute('UPDATE "Checklists" SET "Nombre" = LEFT("Nombre", 60) WHERE LENGTH("Nombre") > 60')
    op.alter_column(
        'Checklists',
        'Nombre',
        existing_type=sa.String(length=150),
        type_=sa.String(length=60),
        existing_nullable=False,
    )