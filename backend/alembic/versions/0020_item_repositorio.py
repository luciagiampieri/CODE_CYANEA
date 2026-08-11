"""crear ItemsRepositorioViaje

Revision ID: 0020_item_repositorio
Revises: 0019_votaciones_cancelacion
Create Date: 2026-08-11
"""

from alembic import op
import sqlalchemy as sa


revision = "0020_item_repositorio"
down_revision = "0019_votaciones_cancelacion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tipo_item_repositorio_enum = sa.Enum(
        "enlace", "direccion", "contacto", "otro",
        name="tipo_item_repositorio_enum",
    )

    op.create_table(
        "ItemsRepositorioViaje",
        sa.Column("IdItemRepositorio", sa.Integer(), nullable=False),
        sa.Column("IdViaje", sa.Integer(), nullable=False),
        sa.Column("IdUsuarioCreador", sa.Integer(), nullable=False),
        sa.Column("Titulo", sa.String(length=150), nullable=False),
        sa.Column("Tipo", tipo_item_repositorio_enum, nullable=False),
        sa.Column("Contenido", sa.Text(), nullable=False),
        sa.Column("Descripcion", sa.Text(), nullable=True),
        sa.Column("EsPublico", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("FechaCreacion", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("FechaActualizacion", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint('TRIM("Titulo") <> \'\'', name="CK_ItemsRepositorioViaje_Titulo"),
        sa.CheckConstraint('TRIM("Contenido") <> \'\'', name="CK_ItemsRepositorioViaje_Contenido"),
        sa.ForeignKeyConstraint(
            ["IdViaje"], ["Viajes.IdViaje"],
            name="FK_ItemsRepositorioViaje_Viajes_IdViaje",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["IdUsuarioCreador"], ["Usuarios.IdUsuario"],
            name="FK_ItemsRepositorioViaje_Usuarios_IdCreador",
        ),
        sa.PrimaryKeyConstraint("IdItemRepositorio"),
    )


def downgrade() -> None:
    op.drop_table("ItemsRepositorioViaje")
    sa.Enum(name="tipo_item_repositorio_enum").drop(op.get_bind(), checkfirst=True)