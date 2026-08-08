from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    EstadoParticipacion,
    EstadoTransferenciaLiquidacion,
    Gasto,
    LiquidacionViaje,
    ParticipanteViaje,
    ParticipantesGastos,
    TransferenciaLiquidacion,
    Viaje,
)
from app.schemas.liquidacion import (
    LiquidacionParticipanteResumen,
    LiquidacionViajeRead,
    TransferenciaLiquidacionRead,
)


DECIMAL_ZERO = Decimal("0.00")
DECIMAL_CENT = Decimal("0.01")


@dataclass
class _SaldoParticipante:
    participante: ParticipanteViaje
    saldo: Decimal


def _round_money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(DECIMAL_CENT, rounding=ROUND_HALF_UP)


def _get_estado_aceptado(db: Session) -> EstadoParticipacion:
    estado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado",
            EstadoParticipacion.Activo.is_(True),
        )
    )
    if not estado:
        raise ValueError("Estado aceptado no configurado")
    return estado


def _get_estado_transferencia(db: Session, nombre: str) -> EstadoTransferenciaLiquidacion:
    estado = db.scalar(
        select(EstadoTransferenciaLiquidacion).where(
            EstadoTransferenciaLiquidacion.Nombre == nombre,
            EstadoTransferenciaLiquidacion.Activo.is_(True),
        )
    )
    if not estado:
        raise ValueError(f"Estado de transferencia '{nombre}' no configurado")
    return estado


def _load_liquidacion(db: Session, liquidacion_id: int) -> LiquidacionViaje | None:
    result = db.execute(
        select(LiquidacionViaje)
        .options(
            joinedload(LiquidacionViaje.Transferencias)
            .joinedload(TransferenciaLiquidacion.ParticipanteDeudor)
            .joinedload(ParticipanteViaje.Usuario),
            joinedload(LiquidacionViaje.Transferencias)
            .joinedload(TransferenciaLiquidacion.ParticipanteAcreedor)
            .joinedload(ParticipanteViaje.Usuario),
            joinedload(LiquidacionViaje.Transferencias).joinedload(
                TransferenciaLiquidacion.EstadoTransferencia
            ),
        )
        .where(LiquidacionViaje.IdLiquidacion == liquidacion_id)
    )
    return result.unique().scalar_one_or_none()


def _apply_realized_transfers(
    db: Session,
    trip_id: int,
    balances: dict[int, Decimal],
) -> dict[int, Decimal]:
    estado_realizada = _get_estado_transferencia(db, "realizada")
    transferencias_realizadas = db.execute(
        select(
            TransferenciaLiquidacion.IdParticipanteDeudor,
            TransferenciaLiquidacion.IdParticipanteAcreedor,
            TransferenciaLiquidacion.Monto,
        )
        .join(
            LiquidacionViaje,
            LiquidacionViaje.IdLiquidacion == TransferenciaLiquidacion.IdLiquidacion,
        )
        .where(
            LiquidacionViaje.IdViaje == trip_id,
            TransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion
            == estado_realizada.IdEstadoTransferenciaLiquidacion,
        )
    ).all()

    adjusted = {key: _round_money(value) for key, value in balances.items()}
    for deudor_id, acreedor_id, monto in transferencias_realizadas:
        monto_decimal = _round_money(Decimal(monto))
        if deudor_id in adjusted:
            adjusted[deudor_id] = _round_money(adjusted[deudor_id] + monto_decimal)
        if acreedor_id in adjusted:
            adjusted[acreedor_id] = _round_money(adjusted[acreedor_id] - monto_decimal)

    return adjusted


def get_trip_accepted_participants(db: Session, trip_id: int) -> list[ParticipanteViaje]:
    estado_aceptado = _get_estado_aceptado(db)
    return list(
        db.scalars(
            select(ParticipanteViaje)
            .options(joinedload(ParticipanteViaje.Usuario))
            .where(
                ParticipanteViaje.IdViaje == trip_id,
                ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
            )
            .order_by(ParticipanteViaje.IdParticipanteViaje)
        ).all()
    )


def calcular_balances_participantes(
    db: Session,
    trip_id: int,
) -> tuple[Viaje, list[ParticipanteViaje], dict[int, Decimal]]:
    viaje = db.get(Viaje, trip_id)
    if viaje is None:
        raise ValueError("Viaje no encontrado")

    participantes = get_trip_accepted_participants(db, trip_id)
    balances = {participante.IdParticipanteViaje: DECIMAL_ZERO for participante in participantes}
    if not participantes:
        return viaje, participantes, balances

    estado_aceptado = _get_estado_aceptado(db)

    pagos = db.execute(
        select(Gasto.IdPagador, func.coalesce(func.sum(Gasto.Monto), 0))
        .join(
            ParticipanteViaje,
            ParticipanteViaje.IdParticipanteViaje == Gasto.IdPagador,
        )
        .where(
            Gasto.IdViaje == trip_id,
            ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
        )
        .group_by(Gasto.IdPagador)
    ).all()
    for participante_id, total_pagado in pagos:
        if participante_id in balances:
            balances[participante_id] = _round_money(balances[participante_id] + Decimal(total_pagado))

    consumos = db.execute(
        select(
            ParticipantesGastos.IdParticipanteViaje,
            func.coalesce(func.sum(ParticipantesGastos.MontoAsignado), 0),
        )
        .join(Gasto, Gasto.IdGasto == ParticipantesGastos.IdGasto)
        .join(
            ParticipanteViaje,
            ParticipanteViaje.IdParticipanteViaje == ParticipantesGastos.IdParticipanteViaje,
        )
        .where(
            Gasto.IdViaje == trip_id,
            ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
        )
        .group_by(ParticipantesGastos.IdParticipanteViaje)
    ).all()
    for participante_id, total_consumido in consumos:
        if participante_id in balances:
            balances[participante_id] = _round_money(balances[participante_id] - Decimal(total_consumido))

    return viaje, participantes, balances


def rebuild_settlement_plan(db: Session, trip_id: int) -> LiquidacionViaje:
    viaje, participantes, balances = calcular_balances_participantes(db, trip_id)
    balances_ajustados = _apply_realized_transfers(db, trip_id, balances)

    db.execute(
        LiquidacionViaje.__table__.update()
        .where(
            LiquidacionViaje.IdViaje == trip_id,
            LiquidacionViaje.Activa.is_(True),
        )
        .values(Activa=False)
    )

    ultima_version = db.scalar(
        select(func.max(LiquidacionViaje.Version)).where(LiquidacionViaje.IdViaje == trip_id)
    )
    nueva_liquidacion = LiquidacionViaje(
        IdViaje=trip_id,
        Version=(ultima_version or 0) + 1,
        Activa=True,
    )
    db.add(nueva_liquidacion)
    db.flush()

    estado_pendiente = _get_estado_transferencia(db, "pendiente")
    acreedores = sorted(
        (
            _SaldoParticipante(participante=participante, saldo=_round_money(saldo))
            for participante in participantes
            if (saldo := balances_ajustados[participante.IdParticipanteViaje]) > DECIMAL_ZERO
        ),
        key=lambda item: item.saldo,
        reverse=True,
    )
    deudores = sorted(
        (
            _SaldoParticipante(participante=participante, saldo=_round_money(-saldo))
            for participante in participantes
            if (saldo := balances_ajustados[participante.IdParticipanteViaje]) < DECIMAL_ZERO
        ),
        key=lambda item: item.saldo,
        reverse=True,
    )

    indice_acreedor = 0
    indice_deudor = 0
    while indice_acreedor < len(acreedores) and indice_deudor < len(deudores):
        acreedor = acreedores[indice_acreedor]
        deudor = deudores[indice_deudor]
        monto = _round_money(min(acreedor.saldo, deudor.saldo))

        if monto > DECIMAL_ZERO:
            db.add(
                TransferenciaLiquidacion(
                    IdLiquidacion=nueva_liquidacion.IdLiquidacion,
                    IdParticipanteDeudor=deudor.participante.IdParticipanteViaje,
                    IdParticipanteAcreedor=acreedor.participante.IdParticipanteViaje,
                    Monto=monto,
                    IdEstadoTransferenciaLiquidacion=estado_pendiente.IdEstadoTransferenciaLiquidacion,
                )
            )

        acreedor.saldo = _round_money(acreedor.saldo - monto)
        deudor.saldo = _round_money(deudor.saldo - monto)

        if acreedor.saldo <= DECIMAL_ZERO:
            indice_acreedor += 1
        if deudor.saldo <= DECIMAL_ZERO:
            indice_deudor += 1

    db.commit()
    return _load_liquidacion(db, nueva_liquidacion.IdLiquidacion)


def get_or_create_active_settlement(db: Session, trip_id: int) -> LiquidacionViaje:
    liquidacion_result = db.execute(
        select(LiquidacionViaje)
        .options(
            joinedload(LiquidacionViaje.Transferencias)
            .joinedload(TransferenciaLiquidacion.ParticipanteDeudor)
            .joinedload(ParticipanteViaje.Usuario),
            joinedload(LiquidacionViaje.Transferencias)
            .joinedload(TransferenciaLiquidacion.ParticipanteAcreedor)
            .joinedload(ParticipanteViaje.Usuario),
            joinedload(LiquidacionViaje.Transferencias).joinedload(
                TransferenciaLiquidacion.EstadoTransferencia
            ),
        )
        .where(
            LiquidacionViaje.IdViaje == trip_id,
            LiquidacionViaje.Activa.is_(True),
        )
    )
    liquidacion = liquidacion_result.unique().scalar_one_or_none()
    if liquidacion:
        return liquidacion
    return rebuild_settlement_plan(db, trip_id)


def marcar_transferencia_realizada(
    db: Session,
    trip_id: int,
    transfer_id: int,
    realizada: bool,
) -> LiquidacionViaje:
    liquidacion = get_or_create_active_settlement(db, trip_id)
    transferencia = next(
        (
            item
            for item in liquidacion.Transferencias
            if item.IdTransferenciaLiquidacion == transfer_id
        ),
        None,
    )
    if transferencia is None:
        raise ValueError("Transferencia no encontrada")

    nombre_estado = "realizada" if realizada else "pendiente"
    estado = _get_estado_transferencia(db, nombre_estado)
    transferencia.IdEstadoTransferenciaLiquidacion = estado.IdEstadoTransferenciaLiquidacion
    transferencia.FechaConfirmacion = datetime.now(timezone.utc) if realizada else None
    db.commit()
    return get_or_create_active_settlement(db, trip_id)


def build_settlement_response(db: Session, trip_id: int, liquidacion: LiquidacionViaje | None = None) -> LiquidacionViajeRead:
    liquidacion = liquidacion or get_or_create_active_settlement(db, trip_id)
    viaje, participantes, balances = calcular_balances_participantes(db, trip_id)

    pendientes_por_participante = {participante.IdParticipanteViaje: DECIMAL_ZERO for participante in participantes}
    transferencias = []
    for transferencia in sorted(
        liquidacion.Transferencias,
        key=lambda item: (
            item.EstadoTransferencia.Nombre != "pendiente",
            item.IdTransferenciaLiquidacion,
        ),
    ):
        estado_nombre = transferencia.EstadoTransferencia.Nombre
        if estado_nombre == "pendiente":
            pendientes_por_participante[transferencia.IdParticipanteAcreedor] = _round_money(
                pendientes_por_participante[transferencia.IdParticipanteAcreedor] + Decimal(transferencia.Monto)
            )
            pendientes_por_participante[transferencia.IdParticipanteDeudor] = _round_money(
                pendientes_por_participante[transferencia.IdParticipanteDeudor] - Decimal(transferencia.Monto)
            )

        transferencias.append(
            TransferenciaLiquidacionRead(
                IdTransferenciaLiquidacion=transferencia.IdTransferenciaLiquidacion,
                IdParticipanteDeudor=transferencia.IdParticipanteDeudor,
                IdParticipanteAcreedor=transferencia.IdParticipanteAcreedor,
                NombreDeudor=f"{transferencia.ParticipanteDeudor.Usuario.Nombre} {transferencia.ParticipanteDeudor.Usuario.Apellido}".strip(),
                NombreAcreedor=f"{transferencia.ParticipanteAcreedor.Usuario.Nombre} {transferencia.ParticipanteAcreedor.Usuario.Apellido}".strip(),
                Monto=_round_money(Decimal(transferencia.Monto)),
                Estado=estado_nombre,
                FechaConfirmacion=transferencia.FechaConfirmacion,
            )
        )

    resumen = []
    for participante in participantes:
        usuario = participante.Usuario
        resumen.append(
            LiquidacionParticipanteResumen(
                IdParticipanteViaje=participante.IdParticipanteViaje,
                IdUsuario=usuario.IdUsuario if usuario else None,
                NombreCompleto=f"{usuario.Nombre} {usuario.Apellido}".strip() if usuario else "Participante",
                NombreUsuario=usuario.NombreUsuario if usuario else None,
                FotoUrl=usuario.FotoUrl if usuario else None,
                BalanceOriginal=_round_money(balances.get(participante.IdParticipanteViaje, DECIMAL_ZERO)),
                BalancePendiente=_round_money(
                    pendientes_por_participante.get(participante.IdParticipanteViaje, DECIMAL_ZERO)
                ),
            )
        )

    resumen.sort(key=lambda item: (item.BalancePendiente, item.NombreCompleto))
    return LiquidacionViajeRead(
        IdLiquidacion=liquidacion.IdLiquidacion,
        IdViaje=trip_id,
        Version=liquidacion.Version,
        Moneda=viaje.Moneda,
        TieneDesbalances=any(item.Monto > DECIMAL_ZERO for item in transferencias if item.Estado == "pendiente"),
        ResumenParticipantes=resumen,
        Transferencias=transferencias,
    )
