"""agregar aceptacion terminos usuarios

Revision ID: a4c1d2e3f5b6
Revises: d7a3c1e9f2b4
Create Date: 2026-10-02 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a4c1d2e3f5b6"
down_revision: str | Sequence[str] | None = "d7a3c1e9f2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "Usuarios",
        sa.Column(
            "AceptaTerminos",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "Usuarios",
        sa.Column("FechaAceptacionTerminos", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "Usuarios",
        sa.Column("VersionTerminosAceptada", sa.String(length=30), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE "Usuarios"
            SET
                "AceptaTerminos" = true,
                "FechaAceptacionTerminos" = "FechaAlta",
                "VersionTerminosAceptada" = 'legacy'
            WHERE "FechaAceptacionTerminos" IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("Usuarios", "VersionTerminosAceptada")
    op.drop_column("Usuarios", "FechaAceptacionTerminos")
    op.drop_column("Usuarios", "AceptaTerminos")
