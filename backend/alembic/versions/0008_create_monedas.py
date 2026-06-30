revision = '0339b0e7da3e'
down_revision = '716effb6abd2'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
import pycountry


def upgrade() -> None:

    op.create_table('Monedas',
    sa.Column('Codigo', sa.String(length=3), nullable=False),
    sa.Column('Nombre', sa.String(length=100), nullable=False),
    sa.PrimaryKeyConstraint('Codigo')
    )

    excluir = {
        "XAU", "XAG", "XPT", "XPD", "XDR", "XUA", "XSU",
        "BOV", "CHE", "CHW", "CLF", "COU", "MXV", "UYI",
        "UYW", "USN", "XAD", "XTS", "XXX", "XBA", "XBB",
        "XBC", "XBD"
    }

    monedas_data = []
    for cur in pycountry.currencies:
        if hasattr(cur, 'alpha_3') and cur.alpha_3 not in excluir:
            monedas_data.append({
                'Codigo': cur.alpha_3,
                'Nombre': cur.name
            })
    
    op.bulk_insert(
        sa.table('Monedas',
            sa.column('Codigo', sa.String),
            sa.column('Nombre', sa.String)
        ),
        monedas_data
    )

def downgrade() -> None:
    
    op.drop_table('Monedas')
    
