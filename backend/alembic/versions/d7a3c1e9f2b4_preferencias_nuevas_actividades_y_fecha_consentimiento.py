"""preferencias de nuevas actividades y fechas de consentimiento (US 60)

Separa "nuevas actividades" de "cambios en el viaje" como categoría de
notificación independiente, para email y push. Los usuarios existentes
heredan el valor que tenían en "cambios en el viaje", porque hasta ahora las
actividades nuevas se notificaban bajo esa categoría.

Agrega además la fecha en que se otorgó el consentimiento explícito de cada
canal (RNF-13). Los usuarios que ya habían consentido quedan con fecha nula,
porque no hay registro de cuándo lo hicieron.

Revision ID: d7a3c1e9f2b4
Revises: c93e5a7b1d20
Create Date: 2026-10-02 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7a3c1e9f2b4"
down_revision: Union[str, None] = "c93e5a7b1d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column(
            "RecibeEmailsNuevasActividades",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column(
            "RecibePushNuevasActividades",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.execute(
        'UPDATE "Usuarios" SET '
        '"RecibeEmailsNuevasActividades" = "RecibeEmailsCambiosViaje", '
        '"RecibePushNuevasActividades" = "RecibePushCambiosViaje"'
    )

    op.add_column(
        "Usuarios",
        sa.Column(
            "FechaConsentimientoNotificacionesEmail",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column(
            "FechaConsentimientoNotificacionesPush",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "FechaConsentimientoNotificacionesPush")
    op.drop_column("Usuarios", "FechaConsentimientoNotificacionesEmail")
    op.drop_column("Usuarios", "RecibePushNuevasActividades")
    op.drop_column("Usuarios", "RecibeEmailsNuevasActividades")
