"""subir entradas o reservas al completar tarea"""

revision = '46d7955535d1'
down_revision = 'f117a1b2c3d4'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa

CATEGORIA = "Reservas y entradas"
ICONO = "ticket"

def upgrade() -> None:
    op.create_table(
            "DocumentosChecklists",
            sa.Column("IdChecklist", sa.Integer(), nullable=False),
            sa.Column("IdDocumento", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["IdChecklist"],
                ["Checklists.IdChecklist"],
                name="FK_DocumentosChecklists_Checklists",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["IdDocumento"],
                ["DocumentosViajes.IdDocumento"],
                name="FK_DocumentosChecklists_DocumentosViajes",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("IdChecklist", "IdDocumento", name="PK_DocumentosChecklists"),
        )
    op.create_index(
            "ix_DocumentosChecklists_IdDocumento", "DocumentosChecklists", ["IdDocumento"]
        )
    
    op.add_column(
            "Checklists",
            sa.Column(
                "SugerenciaDocumentoMostrada",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    
    op.execute(
            sa.text(
                'INSERT INTO "CategoriasDocumentos" ("Nombre", "Icono", "Activo", "EsSistema") '
                "SELECT :nombre, :icono, TRUE, FALSE "
                'WHERE NOT EXISTS (SELECT 1 FROM "CategoriasDocumentos" WHERE "Nombre" = :nombre)'
            ).bindparams(nombre=CATEGORIA, icono=ICONO)
        )


def downgrade() -> None:
    # La categoría no se borra: puede haber documentos subidos a mano que la usan.
    op.drop_column("Checklists", "SugerenciaDocumentoMostrada")
    op.drop_index("ix_DocumentosChecklists_IdDocumento", table_name="DocumentosChecklists")
    op.drop_table("DocumentosChecklists")
