"""add google place id portada to viajes

Revision ID: 0016_cover_place_id
Revises: 0015_create_lugares_interes
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_cover_place_id"
down_revision = "0015_create_lugares_interes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Viajes", sa.Column("GooglePlaceIdPortada", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("Viajes", "GooglePlaceIdPortada")
