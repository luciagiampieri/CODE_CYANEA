"""create lugares interes

Revision ID: 0015_create_lugares_interes
Revises: 0014_add_icono_to_actividades
Create Date: 2026-08-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_create_lugares_interes"
down_revision = "0014_add_icono_to_actividades"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "LugaresInteres",
        sa.Column("IdLugarInteres", sa.Integer(), nullable=False),
        sa.Column("GooglePlaceId", sa.String(length=255), nullable=False),
        sa.Column("Nombre", sa.String(length=200), nullable=False),
        sa.Column("Direccion", sa.String(length=255), nullable=False),
        sa.Column("Lat", sa.Float(), nullable=False),
        sa.Column("Lng", sa.Float(), nullable=False),
        sa.Column("Categoria", sa.String(length=100), nullable=True),
        sa.Column("FotoUrl", sa.String(length=500), nullable=True),
        sa.Column("MetadataJson", sa.JSON(), nullable=True),
        sa.Column("Activo", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("FechaAlta", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("IdLugarInteres"),
        sa.UniqueConstraint("GooglePlaceId", name="UQ_LugaresInteres_GooglePlaceId"),
    )
    op.create_table(
        "LugaresInteresViajes",
        sa.Column("IdLugarInteresViaje", sa.Integer(), nullable=False),
        sa.Column("IdViaje", sa.Integer(), nullable=False),
        sa.Column("IdLugarInteres", sa.Integer(), nullable=False),
        sa.Column("Notas", sa.Text(), nullable=True),
        sa.Column("IdUsuarioAlta", sa.Integer(), nullable=False),
        sa.Column("FechaAlta", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["IdLugarInteres"],
            ["LugaresInteres.IdLugarInteres"],
            name="FK_LugaresInteresViajes_LugaresInteres_IdLugarInteres",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["IdUsuarioAlta"],
            ["Usuarios.IdUsuario"],
            name="FK_LugaresInteresViajes_Usuarios_IdUsuarioAlta",
        ),
        sa.ForeignKeyConstraint(
            ["IdViaje"],
            ["Viajes.IdViaje"],
            name="FK_LugaresInteresViajes_Viajes_IdViaje",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("IdLugarInteresViaje"),
        sa.UniqueConstraint(
            "IdViaje",
            "IdLugarInteres",
            name="UQ_LugaresInteresViajes_IdViaje_IdLugarInteres",
        ),
    )
    op.add_column(
        "ActividadesItinerario",
        sa.Column("IdLugarInteresViaje", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "FK_ActIt_LugInteresViajes_IdLugarInteresViaje",
        "ActividadesItinerario",
        "LugaresInteresViajes",
        ["IdLugarInteresViaje"],
        ["IdLugarInteresViaje"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "FK_ActIt_LugInteresViajes_IdLugarInteresViaje",
        "ActividadesItinerario",
        type_="foreignkey",
    )
    op.drop_column("ActividadesItinerario", "IdLugarInteresViaje")
    op.drop_table("LugaresInteresViajes")
    op.drop_table("LugaresInteres")
