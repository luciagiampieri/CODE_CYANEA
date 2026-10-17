"""backoffice schema"""

revision = "9f4c2d1a0b3e"
down_revision = "7b9d8cbc52e2"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "RolesSistema" (
            "IdRolSistema" INTEGER PRIMARY KEY,
            "Nombre" VARCHAR(50) NOT NULL UNIQUE
        )
        """
    )
    op.execute(
        """
        INSERT INTO "RolesSistema" ("IdRolSistema", "Nombre") VALUES
            (1, 'viajero'),
            (2, 'administrador_sistema')
        ON CONFLICT ("IdRolSistema") DO NOTHING
        """
    )
    op.execute(
        """
        ALTER TABLE "Usuarios"
            ADD COLUMN IF NOT EXISTS "IdRolSistema" INTEGER NOT NULL DEFAULT 1
                REFERENCES "RolesSistema" ("IdRolSistema")
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "AuditoriaAccesosBackoffice" (
            "IdAuditoriaAcceso" SERIAL PRIMARY KEY,
            "Email" VARCHAR(255) NOT NULL,
            "IdUsuario" INTEGER NULL REFERENCES "Usuarios" ("IdUsuario"),
            "Exitoso" BOOLEAN NOT NULL,
            "Motivo" VARCHAR(40) NOT NULL,
            "DireccionIp" VARCHAR(45) NULL,
            "UserAgent" VARCHAR(255) NULL,
            "FechaHora" TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_AuditoriaAccesosBackoffice_Email"
            ON "AuditoriaAccesosBackoffice" ("Email")
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_AuditoriaAccesosBackoffice_FechaHora"
            ON "AuditoriaAccesosBackoffice" ("FechaHora")
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "IX_AuditoriaAccesosBackoffice_Email_FechaHora"
            ON "AuditoriaAccesosBackoffice" ("Email", "FechaHora")
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "SesionesBackoffice" (
            "IdSesionBackoffice" VARCHAR(36) PRIMARY KEY,
            "IdUsuario" INTEGER NOT NULL REFERENCES "Usuarios" ("IdUsuario"),
            "FechaInicio" TIMESTAMPTZ NOT NULL,
            "UltimaActividad" TIMESTAMPTZ NOT NULL,
            "FechaCierre" TIMESTAMPTZ NULL
        )
        """
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "SesionesBackoffice"')
    op.execute('DROP INDEX IF EXISTS "IX_AuditoriaAccesosBackoffice_Email_FechaHora"')
    op.execute('DROP INDEX IF EXISTS "ix_AuditoriaAccesosBackoffice_FechaHora"')
    op.execute('DROP INDEX IF EXISTS "ix_AuditoriaAccesosBackoffice_Email"')
    op.execute('DROP TABLE IF EXISTS "AuditoriaAccesosBackoffice"')
    op.execute('ALTER TABLE "Usuarios" DROP COLUMN IF EXISTS "IdRolSistema"')
    op.execute('DROP TABLE IF EXISTS "RolesSistema"')
