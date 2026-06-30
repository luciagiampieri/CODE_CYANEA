"""create destinos and viajes-destinos"""

revision = '2d4b8ab8e722'
down_revision = '5d50656022c7'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    
    op.create_table(
        'Destinos',
        sa.Column('IdDestino', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('Nombre', sa.String(200), nullable=False),
        sa.Column('Pais', sa.String(100), nullable=True),
        sa.Column('Lat', sa.Float, nullable=True),
        sa.Column('Lng', sa.Float, nullable=True)
    )

    op.create_table(
        'DestinosViajes',
        sa.Column('IdViaje', sa.Integer, sa.ForeignKey('Viajes.IdViaje'), primary_key=True),
        sa.Column('IdDestino', sa.Integer, sa.ForeignKey('Destinos.IdDestino'), primary_key=True)
    )

    op.execute("""
               INSERT INTO "Destinos" ("Nombre")
               SELECT DISTINCT "Destino" FROM "Viajes"
               WHERE "Destino" IS NOT NULL;
               """)
    
    op.execute("""
               INSERT INTO "DestinosViajes" ("IdViaje", "IdDestino")
               SELECT v."IdViaje", d."IdDestino"
               FROM "Viajes" v
               JOIN "Destinos" d ON v."Destino" = d."Nombre"
               """)
    

def downgrade() -> None:

    op.drop_table('DestinosViajes')
    op.drop_table('Destinos')
