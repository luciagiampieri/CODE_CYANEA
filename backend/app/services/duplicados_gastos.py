from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.gasto import Gasto
from app.models.participante_viaje import ParticipanteViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.services.visibilidad_gastos import condicion_gasto_visible

CENTAVO = Decimal("0.01")


def buscar_posibles_duplicados(
    db: Session,
    *,
    id_viaje: int,
    id_usuario: int,
    fecha_gasto: date,
    monto_original: Decimal,
    moneda_original: str,
    id_pagador: int,
    es_compartido: bool,
) -> list[Gasto]:
    """Gastos existentes que podrían ser el mismo pago que se está registrando.

    `id_pagador` es el participante que paga: en un gasto personal, el propio
    usuario. Se filtra por `condicion_gasto_visible` para no revelar nunca un
    gasto personal de otro usuario.
    """
    monto = Decimal(str(monto_original)).quantize(CENTAVO, rounding=ROUND_HALF_UP)
    tipo = Gasto.TipoDivision.is_not(None) if es_compartido else Gasto.TipoDivision.is_(None)

    consulta = (
        select(Gasto)
        # Las mismas relaciones que el detalle del gasto, que es como se muestra
        # cada posible duplicado en la advertencia.
        .options(
            selectinload(Gasto.Categoria),
            selectinload(Gasto.Pagador).selectinload(ParticipanteViaje.Usuario),
            selectinload(Gasto.ParticipanteCreador).selectinload(ParticipanteViaje.Usuario),
            selectinload(Gasto.ParticipantesAsociados)
            .selectinload(ParticipantesGastos.ParticipanteViaje)
            .selectinload(ParticipanteViaje.Usuario),
        )
        .where(
            Gasto.IdViaje == id_viaje,
            Gasto.FechaGasto == fecha_gasto,
            Gasto.MontoOriginal == monto,
            Gasto.MonedaOriginal == (moneda_original or "").upper(),
            Gasto.IdPagador == id_pagador,
            tipo,
            condicion_gasto_visible(id_usuario),
        )
        .order_by(Gasto.FechaCreacion.desc(), Gasto.IdGasto.desc())
    )
    return list(db.scalars(consulta).all())
