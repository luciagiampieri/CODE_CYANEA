"""remove destino from viajes and require pais in destinos"""

revision = '412cd69a11de'
down_revision = '2d4b8ab8e722'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE "Destinos"
            SET "Pais" = 'No definido'
            WHERE "Pais" IS NULL OR TRIM("Pais") = ''
            """
        )
    )

    op.drop_column('Viajes', 'Destino')

    op.alter_column('Destinos', 'Pais',
               existing_type=sa.String(),
               nullable=False)

def downgrade() -> None:
    
    op.add_column('Viajes', sa.Column('Destino', sa.String(), nullable=True))

    op.alter_column('Destinos', 'Pais',
               existing_type=sa.String(),
               nullable=True)
