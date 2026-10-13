"""Quién puede ver un gasto.

- Un gasto compartido lo ve cualquier participante del viaje.
- Un gasto personal solo lo ven su creador y su pagador (normalmente la misma
  persona). En los gastos anteriores a la US 79 no hay creador: queda el pagador.
  Son las mismas personas que pueden editarlo.

Para los demás, un gasto personal ajeno no existe: el listado no lo devuelve y
el detalle, la edición y la eliminación responden 404, igual que un gasto
inexistente (así no se revela que existe).
"""

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.sql.elements import ColumnElement

from app.models.gasto import Gasto
from app.models.participante_viaje import ParticipanteViaje

MENSAJE_GASTO_NO_ENCONTRADO = "Gasto no encontrado."


def es_gasto_personal(gasto: Gasto) -> bool:
    return gasto.TipoDivision is None


def gasto_visible_para(gasto: Gasto, id_usuario: int) -> bool:
    if not es_gasto_personal(gasto):
        return True
    duenos = {gasto.Pagador.IdUsuario}
    if gasto.ParticipanteCreador is not None:
        duenos.add(gasto.ParticipanteCreador.IdUsuario)
    return id_usuario in duenos


def participa_en_el_gasto(gasto: Gasto, id_usuario: int) -> bool:
    """El usuario está en la división del gasto, lo pagó o es su gasto personal."""
    if gasto.Pagador.IdUsuario == id_usuario:
        return True
    if es_gasto_personal(gasto):
        # Un gasto personal visible es propio (lo creó o lo pagó).
        return gasto_visible_para(gasto, id_usuario)
    return any(
        asignacion.ParticipanteViaje.IdUsuario == id_usuario
        for asignacion in gasto.ParticipantesAsociados
    )


def condicion_gasto_visible(id_usuario: int) -> ColumnElement[bool]:
    """Misma regla que `gasto_visible_para`, para filtrar consultas."""
    mis_participaciones = select(ParticipanteViaje.IdParticipanteViaje).where(
        ParticipanteViaje.IdUsuario == id_usuario
    )
    return or_(
        Gasto.TipoDivision.is_not(None),
        Gasto.IdPagador.in_(mis_participaciones),
        Gasto.IdParticipanteCreador.in_(mis_participaciones),
    )


def exigir_gasto_visible(gasto: Gasto | None, id_usuario: int) -> Gasto:
    """Devuelve el gasto o lanza 404 si no existe o es un gasto personal ajeno."""
    if gasto is None or not gasto_visible_para(gasto, id_usuario):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=MENSAJE_GASTO_NO_ENCONTRADO,
        )
    return gasto