"""preferencias de privacidad de usuarios (US 61)

Agrega la visibilidad de nombre, email y foto de perfil para los demás
participantes de los viajes compartidos ("participantes" o "privado"), y si
la cuenta puede encontrarse buscando por nombre de usuario.

Los valores por defecto mantienen el comportamiento previo: todo visible
para los participantes y la cuenta encontrable.

Revision ID: f1c3a5e7b9d2
Revises: e5b2c7d9a1f3
Create Date: 2026-10-04 20:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f1c3a5e7b9d2"
down_revision: Union[str, None] = "e5b2c7d9a1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CAMPOS_VISIBILIDAD = ("VisibilidadNombre", "VisibilidadEmail", "VisibilidadFotoPerfil")


def upgrade() -> None:
    for campo in _CAMPOS_VISIBILIDAD:
        op.add_column(
            "Usuarios",
            sa.Column(
                campo,
                sa.String(length=20),
                nullable=False,
                server_default="participantes",
            ),
        )
        op.create_check_constraint(
            f"ck_usuarios_{campo.lower()}",
            "Usuarios",
            f"\"{campo}\" IN ('participantes', 'privado')",
        )

    op.add_column(
        "Usuarios",
        sa.Column(
            "PermiteBusquedaPorUsuario",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "PermiteBusquedaPorUsuario")
    for campo in reversed(_CAMPOS_VISIBILIDAD):
        op.drop_constraint(f"ck_usuarios_{campo.lower()}", "Usuarios", type_="check")
        op.drop_column("Usuarios", campo)
