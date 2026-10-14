"""US 91: incorporar automáticamente la sugerencia ganadora al itinerario

- Votaciones: EsDeSugerencias, IdDiaCronograma, EstadoResolucion, FechaResolucion,
  FechaLimiteDesempate.
- ActividadesItinerario: IdVotacionOrigen (UNIQUE) para que una votación nunca genere
  más de una actividad.
- Estados de sugerencia "aceptada" y "descartada" (si no existían).
"""

revision = "a91c3f2b7d10"
down_revision = "7b9d8cbc52e2"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


ESTADOS_RESOLUCION = "('incorporada','empate','sin_votos','dia_inexistente','empate_vencido')"


def upgrade() -> None:
    op.add_column(
        "Votaciones",
        sa.Column("EsDeSugerencias", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("Votaciones", sa.Column("IdDiaCronograma", sa.Integer(), nullable=True))
    op.add_column("Votaciones", sa.Column("EstadoResolucion", sa.String(20), nullable=True))
    op.add_column(
        "Votaciones", sa.Column("FechaResolucion", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "Votaciones", sa.Column("FechaLimiteDesempate", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        "FK_Votaciones_DiasCron_IdDia",
        "Votaciones",
        "DiasCronogramas",
        ["IdDiaCronograma"],
        ["IdDiaCronograma"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "CK_Votaciones_EstadoResolucion",
        "Votaciones",
        f'"EstadoResolucion" IS NULL OR "EstadoResolucion" IN {ESTADOS_RESOLUCION}',
    )
    op.create_index(
        "IX_Votaciones_Resolucion",
        "Votaciones",
        ["EsDeSugerencias", "EstadoResolucion", "FechaCierre"],
    )

    op.add_column(
        "ActividadesItinerario", sa.Column("IdVotacionOrigen", sa.BigInteger(), nullable=True)
    )
    op.create_foreign_key(
        "FK_ActIt_Votaciones_IdVotacionOrigen",
        "ActividadesItinerario",
        "Votaciones",
        ["IdVotacionOrigen"],
        ["IdVotacion"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "UX_ActividadesItinerario_IdVotacionOrigen",
        "ActividadesItinerario",
        ["IdVotacionOrigen"],
    )

    op.execute(
        """
        UPDATE "Votaciones"
        SET "EsDeSugerencias" = TRUE,
            "IdDiaCronograma" = (
                SELECT s."IdDiaCronograma"
                FROM "Propuestas" p
                JOIN "SugerenciasActividades" s
                  ON s."IdSugerenciaActividad" = p."IdSugerenciaActividad"
                WHERE p."IdVotacion" = "Votaciones"."IdVotacion"
                LIMIT 1
            )
        WHERE EXISTS (
            SELECT 1 FROM "Propuestas" p
            WHERE p."IdVotacion" = "Votaciones"."IdVotacion"
              AND p."IdSugerenciaActividad" IS NOT NULL
        )
        """
    )

    for nombre in ("aceptada", "descartada"):
        op.execute(
            f"""
            INSERT INTO "EstadosSugerenciasActividades" ("Nombre")
            SELECT '{nombre}'
            WHERE NOT EXISTS (
                SELECT 1 FROM "EstadosSugerenciasActividades"
                WHERE LOWER("Nombre") = '{nombre}'
            )
            """
        )


def downgrade() -> None:
    op.drop_constraint(
        "UX_ActividadesItinerario_IdVotacionOrigen", "ActividadesItinerario", type_="unique"
    )
    op.drop_constraint(
        "FK_ActIt_Votaciones_IdVotacionOrigen", "ActividadesItinerario", type_="foreignkey"
    )
    op.drop_column("ActividadesItinerario", "IdVotacionOrigen")

    op.drop_index("IX_Votaciones_Resolucion", table_name="Votaciones")
    op.drop_constraint("CK_Votaciones_EstadoResolucion", "Votaciones", type_="check")
    op.drop_constraint("FK_Votaciones_DiasCron_IdDia", "Votaciones", type_="foreignkey")
    op.drop_column("Votaciones", "FechaLimiteDesempate")
    op.drop_column("Votaciones", "FechaResolucion")
    op.drop_column("Votaciones", "EstadoResolucion")
    op.drop_column("Votaciones", "IdDiaCronograma")
    op.drop_column("Votaciones", "EsDeSugerencias")
