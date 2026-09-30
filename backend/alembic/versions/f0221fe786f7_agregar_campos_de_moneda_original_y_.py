"""agregar campos de moneda original y tipo de cambio a gastos"""

revision = "f0221fe786f7"
down_revision = "4f4ab2082d92"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # 1. Agregar las columnas temporalmente permitiendo NULL.
    # Esto permite que la migración funcione aunque ya existan gastos.
    op.add_column(
        "Gastos",
        sa.Column(
            "MonedaOriginal",
            sa.String(length=3),
            nullable=True,
        ),
    )

    op.add_column(
        "Gastos",
        sa.Column(
            "MontoOriginal",
            sa.Numeric(precision=12, scale=2),
            nullable=True,
        ),
    )

    op.add_column(
        "Gastos",
        sa.Column(
            "TipoCambio",
            sa.Numeric(precision=12, scale=6),
            nullable=True,
        ),
    )

    # 2. Completar los datos de los gastos existentes.
    #
    # Los gastos existentes se consideran expresados
    # en la moneda base de su viaje.
    op.execute(
        sa.text("""
            UPDATE "Gastos" g
            SET
                "MontoOriginal" = g."Monto",
                "MonedaOriginal" = v."Moneda",
                "TipoCambio" = 1
            FROM "Viajes" v
            WHERE g."IdViaje" = v."IdViaje"
        """)
    )

    # 3. Crear la FK hacia la tabla Monedas.
    op.create_foreign_key(
        "FK_Gastos_Monedas_Codigo",
        "Gastos",
        "Monedas",
        ["MonedaOriginal"],
        ["Codigo"],
    )

    # 4. Una vez completados los registros existentes,
    # convertir las columnas en obligatorias.
    op.alter_column(
        "Gastos",
        "MonedaOriginal",
        existing_type=sa.String(length=3),
        nullable=False,
    )

    op.alter_column(
        "Gastos",
        "MontoOriginal",
        existing_type=sa.Numeric(precision=12, scale=2),
        nullable=False,
    )

    op.alter_column(
        "Gastos",
        "TipoCambio",
        existing_type=sa.Numeric(precision=12, scale=6),
        nullable=False,
    )


def downgrade() -> None:
    # Eliminar la FK.
    op.drop_constraint(
        "FK_Gastos_Monedas_Codigo",
        "Gastos",
        type_="foreignkey",
    )

    # Eliminar las columnas agregadas.
    op.drop_column("Gastos", "TipoCambio")
    op.drop_column("Gastos", "MontoOriginal")
    op.drop_column("Gastos", "MonedaOriginal")