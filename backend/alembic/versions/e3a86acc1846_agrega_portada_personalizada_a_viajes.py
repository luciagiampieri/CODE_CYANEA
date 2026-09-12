"""agrega portada personalizada a viajes"""

revision = 'e3a86acc1846'
down_revision = 'a74611df1e0a'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
   
    op.add_column('Viajes', sa.Column('UrlPortadaPersonalizada', sa.String(length=500), nullable=True))
   


def downgrade() -> None:
    
    op.drop_column('Viajes', 'UrlPortadaPersonalizada')
    