"""nombre de usuario unico sin distinguir mayusculas

Los nombres de usuario se comparan con lower(): "u123" y "U123" son el mismo.
Antes de crear el indice se buscan duplicados existentes; si hay, no se crea y
queda un warning con los nombres para resolverlos a mano (la app ya impide crear
nuevos duplicados). Despues se puede crear con el script 028.
"""

revision = "e140a1b2c3d4"
down_revision = "b0bcca3ac886"
branch_labels = None
depends_on = None

import logging

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger("alembic.runtime.migration")

NOMBRE_INDICE = "UX_Usuarios_NombreUsuario_Minusculas"


def upgrade() -> None:
    duplicados = op.get_bind().execute(
        sa.text(
            'SELECT lower("NombreUsuario") AS nombre, count(*) AS cantidad '
            'FROM "Usuarios" GROUP BY lower("NombreUsuario") HAVING count(*) > 1'
        )
    ).all()
    if duplicados:
        logger.warning(
            "No se creo %s: hay nombres de usuario repetidos sin distinguir mayusculas: %s",
            NOMBRE_INDICE,
            ", ".join(f"{fila.nombre} ({fila.cantidad})" for fila in duplicados),
        )
        return
    op.create_index(
        NOMBRE_INDICE,
        "Usuarios",
        [sa.text('lower("NombreUsuario")')],
        unique=True,
    )


def downgrade() -> None:
    op.execute(f'DROP INDEX IF EXISTS "{NOMBRE_INDICE}"')
