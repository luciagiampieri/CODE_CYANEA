"""crear preferencias de planificacion (US 86)

Crea las tablas maestras InteresesPlanificacion y RitmosViajes (con sus datos),
la tabla PreferenciasPlanificacion (una fila por participante de viaje) y la
tabla intermedia PreferenciasPlanificacionIntereses.
"""

revision = "b86a1c2d3e4f"
down_revision = "f0221fe786f7"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


INTERESES = [
    # (Nombre, Icono FontAwesome6, Orden)
    ("Gastronomía", "utensils", 1),
    ("Cultura e historia", "landmark", 2),
    ("Naturaleza y aire libre", "tree", 3),
    ("Aventura", "person-hiking", 4),
    ("Vida nocturna", "martini-glass-citrus", 5),
    ("Compras", "bag-shopping", 6),
    ("Relax", "spa", 7),
]

RITMOS = [
    ("Tranquilo", "Pocas actividades por día, con tiempo libre entre ellas.", 1),
    ("Moderado", "Un equilibrio entre actividades y descanso.", 2),
    ("Intenso", "Aprovechar el día al máximo con varias actividades.", 3),
]


def upgrade() -> None:
    intereses = op.create_table(
        "InteresesPlanificacion",
        sa.Column("IdInteresPlanificacion", sa.Integer(), nullable=False),
        sa.Column("Nombre", sa.String(length=50), nullable=False),
        sa.Column("Icono", sa.String(length=50), nullable=False),
        sa.Column("Orden", sa.Integer(), nullable=False),
        sa.Column("Activo", sa.Boolean(), server_default="true", nullable=False),
        sa.PrimaryKeyConstraint("IdInteresPlanificacion"),
        sa.UniqueConstraint("Nombre", name="UQ_InteresesPlanificacion_Nombre"),
    )

    ritmos = op.create_table(
        "RitmosViajes",
        sa.Column("IdRitmoViaje", sa.Integer(), nullable=False),
        sa.Column("Nombre", sa.String(length=30), nullable=False),
        sa.Column("Descripcion", sa.String(length=150), nullable=False),
        sa.Column("Orden", sa.Integer(), nullable=False),
        sa.Column("Activo", sa.Boolean(), server_default="true", nullable=False),
        sa.PrimaryKeyConstraint("IdRitmoViaje"),
        sa.UniqueConstraint("Nombre", name="UQ_RitmosViajes_Nombre"),
    )

    op.create_table(
        "PreferenciasPlanificacion",
        sa.Column("IdPreferenciaPlanificacion", sa.Integer(), nullable=False),
        sa.Column("IdParticipanteViaje", sa.Integer(), nullable=False),
        sa.Column("IdRitmoViaje", sa.Integer(), nullable=False),
        sa.Column("PresupuestoDiarioARS", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("Consideraciones", sa.String(length=300), nullable=True),
        sa.Column(
            "FechaCreacion",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "FechaActualizacion",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            '"PresupuestoDiarioARS" IS NULL OR "PresupuestoDiarioARS" > 0',
            name="CK_PreferenciasPlanificacion_Presupuesto",
        ),
        sa.ForeignKeyConstraint(
            ["IdParticipanteViaje"],
            ["ParticipantesViajes.IdParticipanteViaje"],
            name="FK_PrefPlan_PartViajes_IdParticipanteViaje",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["IdRitmoViaje"],
            ["RitmosViajes.IdRitmoViaje"],
            name="FK_PrefPlan_RitmosViajes_IdRitmoViaje",
        ),
        sa.PrimaryKeyConstraint("IdPreferenciaPlanificacion"),
        sa.UniqueConstraint(
            "IdParticipanteViaje", name="UQ_PreferenciasPlanificacion_IdParticipanteViaje"
        ),
    )

    op.create_table(
        "PreferenciasPlanificacionIntereses",
        sa.Column("IdPreferenciaPlanificacion", sa.Integer(), nullable=False),
        sa.Column("IdInteresPlanificacion", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["IdPreferenciaPlanificacion"],
            ["PreferenciasPlanificacion.IdPreferenciaPlanificacion"],
            name="FK_PrefPlanInt_PrefPlan_IdPreferenciaPlanificacion",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["IdInteresPlanificacion"],
            ["InteresesPlanificacion.IdInteresPlanificacion"],
            name="FK_PrefPlanInt_IntPlan_IdInteresPlanificacion",
        ),
        sa.PrimaryKeyConstraint("IdPreferenciaPlanificacion", "IdInteresPlanificacion"),
    )

    op.bulk_insert(
        intereses,
        [
            {"Nombre": nombre, "Icono": icono, "Orden": orden, "Activo": True}
            for nombre, icono, orden in INTERESES
        ],
    )
    op.bulk_insert(
        ritmos,
        [
            {"Nombre": nombre, "Descripcion": descripcion, "Orden": orden, "Activo": True}
            for nombre, descripcion, orden in RITMOS
        ],
    )


def downgrade() -> None:
    op.drop_table("PreferenciasPlanificacionIntereses")
    op.drop_table("PreferenciasPlanificacion")
    op.drop_table("RitmosViajes")
    op.drop_table("InteresesPlanificacion")
