"""cargar datos maestros

Carga los estados, roles y categorías que la aplicación da por existentes
(antes se cargaban a mano con scripts/sql/007_datos_maestros.sql). Al estar
en una migración, cualquier base nueva queda lista con `alembic upgrade head`.

Es idempotente: solo inserta los registros que no existen por nombre, así
que no duplica datos en bases donde el script SQL ya se había ejecutado.

Revision ID: e5b2c7d9a1f3
Revises: a4c1d2e3f5b6
Create Date: 2026-10-04 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "e5b2c7d9a1f3"
down_revision: Union[str, None] = "a4c1d2e3f5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insertar_si_no_existe(tabla: str, columnas: list[str], filas: list[tuple]) -> None:
    """Inserta cada fila solo si no hay otra con el mismo "Nombre"."""
    columnas_sql = ", ".join(f'"{c}"' for c in columnas)
    valores_sql = ",\n        ".join(
        "(" + ", ".join(_literal(v) for v in fila) + ")" for fila in filas
    )
    op.execute(
        f'''
        INSERT INTO "{tabla}" ({columnas_sql})
        SELECT {", ".join(f'datos."{c}"' for c in columnas)}
        FROM (VALUES
        {valores_sql}
        ) AS datos({columnas_sql})
        WHERE NOT EXISTS (
            SELECT 1 FROM "{tabla}" t WHERE t."Nombre" = datos."Nombre"
        )
        '''
    )


def _literal(valor) -> str:
    if isinstance(valor, bool):
        return "TRUE" if valor else "FALSE"
    return "'" + str(valor).replace("'", "''") + "'"


def upgrade() -> None:
    _insertar_si_no_existe(
        "EstadosViajes",
        ["Nombre", "Descripcion", "Activo"],
        [
            ("borrador", "Viaje en preparacion inicial.", True),
            ("activo", "Viaje vigente y operativo.", True),
            ("finalizado", "Viaje concluido.", True),
            ("cancelado", "Viaje cancelado.", True),
            ("eliminado", "Viaje eliminado por el administrador.", True),
        ],
    )
    _insertar_si_no_existe(
        "RolesParticipantes",
        ["Nombre", "Descripcion", "Activo"],
        [
            ("administrador", "Usuario responsable del viaje.", True),
            ("participante", "Usuario invitado al viaje.", True),
        ],
    )
    _insertar_si_no_existe(
        "EstadosParticipaciones",
        ["Nombre", "Descripcion", "Activo"],
        [
            ("invitado", "Invitacion pendiente de respuesta.", True),
            ("aceptado", "Participacion aceptada.", True),
            ("rechazado", "Invitacion rechazada.", True),
            ("expulsado", "Participante removido del viaje.", True),
            ("salio", "Participante abandono voluntariamente el viaje.", True),
            ("cancelada", "Invitacion cancelada por el administrador.", True),
        ],
    )
    _insertar_si_no_existe(
        "EstadosInvitaciones",
        ["Nombre", "Descripcion", "Activo"],
        [
            ("pendiente", "Invitacion externa enviada y aun no aceptada.", True),
            ("aceptada", "Invitacion aceptada por una cuenta registrada.", True),
            ("vencida", "Invitacion expirada sin aceptacion.", True),
            ("cancelada", "Invitacion anulada por el administrador.", True),
        ],
    )
    _insertar_si_no_existe(
        "CategoriasGastos",
        ["Nombre", "Activo"],
        [
            ("Comida y Bebida", True),
            ("Transporte", True),
            ("Alojamiento", True),
            ("Entretenimiento", True),
            ("Compras", True),
            ("Servicios", True),
            ("Otros", True),
        ],
    )
    _insertar_si_no_existe(
        "CategoriasChecklist",
        ["Nombre", "Activo"],
        [
            ("Documentación", True),
            ("Transporte", True),
            ("Alojamiento", True),
            ("Equipamiento", True),
            ("Salud", True),
            ("Seguros", True),
            ("Finanzas", True),
            ("Comida", True),
            ("Otros", True),
        ],
    )


def downgrade() -> None:
    # No se eliminan datos maestros: otras tablas los referencian y borrarlos
    # rompería los datos existentes.
    pass
