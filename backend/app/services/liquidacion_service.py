from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select, update
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
    MiSaldoGastoRead,
    MiSaldoRead,
    MiSaldoTransferenciaRead,
    TransferenciaLiquidacionRead,
)


DECIMAL_ZERO = Decimal("0.00")
DECIMAL_CENT = Decimal("0.01")

# Estados de una transferencia (US: confirmar transferencias):
# - pendiente: falta pagarla.
# - informada: el deudor avisó "Ya transferí" y falta que el acreedor confirme.
# - realizada: el acreedor confirmó que le llegó.
# Para recalcular, "informada" ya cuenta como pagada: si se carga un gasto
# nuevo mientras el acreedor no confirmó, ese monto no se vuelve a pedir.
ESTADOS_PAGADOS = ("realizada", "informada")


class PermisoTransferenciaError(Exception):
    """El usuario no puede hacer esa acción sobre la transferencia."""


@dataclass(frozen=True)
class DatosTransferencia:
    """Lo necesario para avisar sobre una transferencia (se toma antes de recalcular)."""
    id_usuario_deudor: int
    id_usuario_acreedor: int
    nombre_deudor: str
    nombre_acreedor: str
    monto: Decimal


def _datos_transferencia(transferencia: TransferenciaLiquidacion) -> DatosTransferencia:
    deudor = transferencia.ParticipanteDeudor.Usuario
    acreedor = transferencia.ParticipanteAcreedor.Usuario
    return DatosTransferencia(
        id_usuario_deudor=deudor.IdUsuario,
        id_usuario_acreedor=acreedor.IdUsuario,
        nombre_deudor=f"{deudor.Nombre} {deudor.Apellido}".strip(),
        nombre_acreedor=f"{acreedor.Nombre} {acreedor.Apellido}".strip(),
        monto=_round_money(Decimal(transferencia.Monto)),
    )


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
    ids_estados_pagados = select(
        EstadoTransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion
    ).where(EstadoTransferenciaLiquidacion.Nombre.in_(ESTADOS_PAGADOS))
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
            TransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion.in_(ids_estados_pagados),
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


def _calcular_resumen_gastos_participantes(
    db: Session,
    trip_id: int,
    participantes: list[ParticipanteViaje],
) -> tuple[Decimal, dict[int, Decimal], dict[int, Decimal]]:
    """Totales del grupo: solo gastos compartidos.

    Este resumen lo ve todo el grupo, así que los gastos personales (que solo
    ve su dueño) no cuentan ni en el total ni en lo pagado o consumido por
    cada uno. Los saldos no cambian: un gasto personal siempre da saldo 0.
    """
    total_gastos_viaje = _round_money(
        Decimal(
            db.scalar(
                select(func.coalesce(func.sum(Gasto.Monto), 0)).where(
                    Gasto.IdViaje == trip_id,
                    Gasto.TipoDivision.is_not(None),
                )
            )
            or 0
        )
    )
    total_pagado = {participante.IdParticipanteViaje: DECIMAL_ZERO for participante in participantes}
    gasto_individual = {participante.IdParticipanteViaje: DECIMAL_ZERO for participante in participantes}

    if not participantes:
        return total_gastos_viaje, total_pagado, gasto_individual

    estado_aceptado = _get_estado_aceptado(db)

    pagos = db.execute(
        select(Gasto.IdPagador, func.coalesce(func.sum(Gasto.Monto), 0))
        .join(
            ParticipanteViaje,
            ParticipanteViaje.IdParticipanteViaje == Gasto.IdPagador,
        )
        .where(
            Gasto.IdViaje == trip_id,
            Gasto.TipoDivision.is_not(None),
            ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
        )
        .group_by(Gasto.IdPagador)
    ).all()
    for participante_id, monto in pagos:
        if participante_id in total_pagado:
            total_pagado[participante_id] = _round_money(Decimal(monto))

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
            Gasto.TipoDivision.is_not(None),
            ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion,
        )
        .group_by(ParticipantesGastos.IdParticipanteViaje)
    ).all()
    for participante_id, monto in consumos:
        if participante_id in gasto_individual:
            gasto_individual[participante_id] = _round_money(Decimal(monto))

    return total_gastos_viaje, total_pagado, gasto_individual


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

    # Las transferencias "informada" y "realizada" de todas las versiones
    # anteriores pasan a la nueva (se mueven, no se copian, así no se cuentan
    # dos veces). Si quedaran en una versión vieja, la pantalla —que muestra
    # solo la activa— dejaría de verlas: el acreedor no podría confirmar un
    # aviso y "Ya saldadas" se vaciaría cada vez que alguien carga un gasto.
    # Ya se descontaron de los saldos en _apply_realized_transfers.
    ids_estados_pagados = select(
        EstadoTransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion
    ).where(EstadoTransferenciaLiquidacion.Nombre.in_(ESTADOS_PAGADOS))
    ids_versiones_anteriores = select(LiquidacionViaje.IdLiquidacion).where(
        LiquidacionViaje.IdViaje == trip_id,
        LiquidacionViaje.IdLiquidacion != nueva_liquidacion.IdLiquidacion,
    )
    db.execute(
        update(TransferenciaLiquidacion)
        .where(
            TransferenciaLiquidacion.IdLiquidacion.in_(ids_versiones_anteriores),
            TransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion.in_(ids_estados_pagados),
        )
        .values(IdLiquidacion=nueva_liquidacion.IdLiquidacion)
        .execution_options(synchronize_session=False)
    )

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


def _transferencia_activa(
    db: Session, trip_id: int, transfer_id: int
) -> TransferenciaLiquidacion:
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
    return transferencia


def _cambiar_estado(transferencia: TransferenciaLiquidacion, estado: EstadoTransferenciaLiquidacion) -> None:
    transferencia.IdEstadoTransferenciaLiquidacion = estado.IdEstadoTransferenciaLiquidacion
    transferencia.FechaConfirmacion = (
        datetime.now(timezone.utc) if estado.Nombre == "realizada" else None
    )


def _exigir_deudor(transferencia: TransferenciaLiquidacion, id_usuario: int) -> None:
    if transferencia.ParticipanteDeudor.IdUsuario != id_usuario:
        raise PermisoTransferenciaError(
            "Solo quien tiene que transferir puede avisar que ya lo hizo."
        )


def _exigir_acreedor(transferencia: TransferenciaLiquidacion, id_usuario: int) -> None:
    if transferencia.ParticipanteAcreedor.IdUsuario != id_usuario:
        raise PermisoTransferenciaError(
            "Solo quien recibe la transferencia puede confirmar si le llegó."
        )


def informar_transferencia(
    db: Session, trip_id: int, transfer_id: int, id_usuario: int
) -> tuple[LiquidacionViaje, DatosTransferencia]:
    """"Ya transferí": el deudor avisa que pagó. Queda esperando que el acreedor confirme."""
    transferencia = _transferencia_activa(db, trip_id, transfer_id)
    _exigir_deudor(transferencia, id_usuario)
    if transferencia.EstadoTransferencia.Nombre != "pendiente":
        raise ValueError("La transferencia ya no está pendiente.")

    datos = _datos_transferencia(transferencia)
    _cambiar_estado(transferencia, _get_estado_transferencia(db, "informada"))
    db.commit()
    return get_or_create_active_settlement(db, trip_id), datos


def marcar_transferencia_realizada(
    db: Session,
    trip_id: int,
    transfer_id: int,
    realizada: bool,
    id_usuario: int,
) -> LiquidacionViaje:
    """Solo el acreedor confirma que le llegó (realizada=True) o lo deshace (False).

    Puede confirmar aunque el deudor no haya avisado antes. Al deshacer, la
    deuda vuelve a pendiente y se recalcula la liquidación.
    """
    transferencia = _transferencia_activa(db, trip_id, transfer_id)
    _exigir_acreedor(transferencia, id_usuario)
    estado_actual = transferencia.EstadoTransferencia.Nombre

    if realizada:
        if estado_actual == "realizada":
            return get_or_create_active_settlement(db, trip_id)
        _cambiar_estado(transferencia, _get_estado_transferencia(db, "realizada"))
        db.commit()
        return get_or_create_active_settlement(db, trip_id)

    if estado_actual != "realizada":
        raise ValueError("Solo se puede deshacer una transferencia confirmada.")
    _cambiar_estado(transferencia, _get_estado_transferencia(db, "pendiente"))
    db.flush()
    return rebuild_settlement_plan(db, trip_id)


def rechazar_transferencia(
    db: Session, trip_id: int, transfer_id: int, id_usuario: int
) -> tuple[LiquidacionViaje, DatosTransferencia]:
    """"No me llegó": el acreedor rechaza un aviso del deudor. La deuda vuelve
    a pendiente y se recalcula la liquidación (pudo haber cambiado mientras)."""
    transferencia = _transferencia_activa(db, trip_id, transfer_id)
    _exigir_acreedor(transferencia, id_usuario)
    if transferencia.EstadoTransferencia.Nombre != "informada":
        raise ValueError("Solo se puede rechazar una transferencia que el deudor avisó.")

    datos = _datos_transferencia(transferencia)
    _cambiar_estado(transferencia, _get_estado_transferencia(db, "pendiente"))
    db.flush()
    return rebuild_settlement_plan(db, trip_id), datos


def _gasto_personal_participante(db: Session, trip_id: int, id_participante: int) -> Decimal:
    """Suma de los gastos personales de un participante (su división es él solo)."""
    return _round_money(
        Decimal(
            db.scalar(
                select(func.coalesce(func.sum(ParticipantesGastos.MontoAsignado), 0))
                .join(Gasto, Gasto.IdGasto == ParticipantesGastos.IdGasto)
                .where(
                    Gasto.IdViaje == trip_id,
                    Gasto.TipoDivision.is_(None),
                    ParticipantesGastos.IdParticipanteViaje == id_participante,
                )
            )
            or 0
        )
    )


def build_settlement_response(
    db: Session,
    trip_id: int,
    liquidacion: LiquidacionViaje | None = None,
    id_usuario: int | None = None,
) -> LiquidacionViajeRead:
    """Resumen financiero del viaje.

    Si se indica `id_usuario`, incluye "Tu gasto" de esa persona
    (`GastoUsuario` = su parte de los gastos compartidos + sus gastos
    personales, y `GastoPersonalUsuario`).
    """
    liquidacion = liquidacion or get_or_create_active_settlement(db, trip_id)
    viaje, participantes, balances = calcular_balances_participantes(db, trip_id)
    total_gastos_viaje, total_pagado, gasto_individual = _calcular_resumen_gastos_participantes(
        db,
        trip_id,
        participantes,
    )

    gasto_usuario = None
    gasto_personal_usuario = None
    participante_usuario = next(
        (p for p in participantes if id_usuario is not None and p.IdUsuario == id_usuario),
        None,
    )
    if participante_usuario is not None:
        gasto_personal_usuario = _gasto_personal_participante(
            db, trip_id, participante_usuario.IdParticipanteViaje
        )
        gasto_usuario = _round_money(
            gasto_individual.get(participante_usuario.IdParticipanteViaje, DECIMAL_ZERO)
            + gasto_personal_usuario
        )

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
                TotalPagado=_round_money(
                    total_pagado.get(participante.IdParticipanteViaje, DECIMAL_ZERO)
                ),
                GastoIndividual=_round_money(
                    gasto_individual.get(participante.IdParticipanteViaje, DECIMAL_ZERO)
                ),
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
        TotalGastosViaje=total_gastos_viaje,
        GastoUsuario=gasto_usuario,
        GastoPersonalUsuario=gasto_personal_usuario,
        TieneDesbalances=any(item.Monto > DECIMAL_ZERO for item in transferencias if item.Estado == "pendiente"),
        ResumenParticipantes=resumen,
        Transferencias=transferencias,
    )


@dataclass(frozen=True)
class TransferenciaPendiente:
    """Transferencia pendiente vista desde un participante."""

    rol: str  # "paga" o "cobra"
    id_contraparte: int
    nombre_contraparte: str
    monto: Decimal


def transferencias_pendientes_por_participante(
    db: Session, trip_id: int
) -> dict[int, list[TransferenciaPendiente]]:
    """Transferencias pendientes de la liquidación activa, agrupadas por participante.

    No regenera la liquidación: si todavía no hay una activa devuelve un dict vacío.
    """
    liquidacion = db.execute(
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
        .where(LiquidacionViaje.IdViaje == trip_id, LiquidacionViaje.Activa.is_(True))
        .execution_options(populate_existing=True)
    ).unique().scalar_one_or_none()
    if liquidacion is None:
        return {}

    def nombre(participante: ParticipanteViaje) -> str:
        usuario = participante.Usuario
        return f"{usuario.Nombre} {usuario.Apellido}".strip() if usuario else "Participante"

    resultado: dict[int, list[TransferenciaPendiente]] = {}
    for transferencia in liquidacion.Transferencias:
        if transferencia.EstadoTransferencia.Nombre != "pendiente":
            continue
        monto = _round_money(Decimal(transferencia.Monto))
        deudor = transferencia.ParticipanteDeudor
        acreedor = transferencia.ParticipanteAcreedor
        resultado.setdefault(deudor.IdParticipanteViaje, []).append(
            TransferenciaPendiente("paga", acreedor.IdParticipanteViaje, nombre(acreedor), monto)
        )
        resultado.setdefault(acreedor.IdParticipanteViaje, []).append(
            TransferenciaPendiente("cobra", deudor.IdParticipanteViaje, nombre(deudor), monto)
        )
    return resultado


def participantes_con_contrapartes_distintas(
    antes: dict[int, list[TransferenciaPendiente]],
    despues: dict[int, list[TransferenciaPendiente]],
) -> set[int]:
    """Participantes a los que les cambió a quién transfieren o de quién cobran.

    Un cambio solo de monto con las mismas personas no cuenta.
    """
    def contrapartes(transferencias: list[TransferenciaPendiente]) -> set[tuple[str, int]]:
        return {(t.rol, t.id_contraparte) for t in transferencias}

    return {
        participante_id
        for participante_id in set(antes) | set(despues)
        if contrapartes(antes.get(participante_id, [])) != contrapartes(despues.get(participante_id, []))
    }


# ---------------------------------------------------------------------------
# "De dónde sale tu saldo"
# ---------------------------------------------------------------------------

def _nombre_usuario(participante: ParticipanteViaje) -> str:
    usuario = participante.Usuario
    if usuario is None:
        return "Participante"
    return f"{usuario.Nombre} {usuario.Apellido}".strip() or usuario.NombreUsuario


def desglose_saldo_usuario(db: Session, trip_id: int, id_usuario: int) -> MiSaldoRead:
    """Explica el saldo del usuario gasto por gasto.

    Saldo = lo que pagó - su parte (solo gastos compartidos: un gasto personal
    da 0) + transferencias que hizo - transferencias que recibió (confirmadas o
    avisadas). Coincide con lo que le queda por cobrar o pagar en la
    liquidación.
    """
    viaje = db.get(Viaje, trip_id)
    if viaje is None:
        raise ValueError("Viaje no encontrado")
    yo = next(
        (p for p in get_trip_accepted_participants(db, trip_id) if p.IdUsuario == id_usuario),
        None,
    )
    if yo is None:
        raise PermisoTransferenciaError("No participás de la liquidación de este viaje.")
    mi_id = yo.IdParticipanteViaje

    gastos = db.scalars(
        select(Gasto)
        .options(
            joinedload(Gasto.Categoria),
            joinedload(Gasto.Pagador).joinedload(ParticipanteViaje.Usuario),
            joinedload(Gasto.ParticipantesAsociados),
        )
        .where(Gasto.IdViaje == trip_id, Gasto.TipoDivision.is_not(None))
        .order_by(Gasto.FechaGasto.desc(), Gasto.IdGasto.desc())
    ).unique().all()

    detalle_gastos = []
    total_pagado = DECIMAL_ZERO
    total_parte = DECIMAL_ZERO
    for gasto in gastos:
        pague = gasto.IdPagador == mi_id
        parte = next(
            (
                Decimal(a.MontoAsignado)
                for a in gasto.ParticipantesAsociados
                if a.IdParticipanteViaje == mi_id
            ),
            None,
        )
        if not pague and parte is None:
            continue  # no me toca
        pagado = _round_money(Decimal(gasto.Monto)) if pague else DECIMAL_ZERO
        parte = _round_money(parte or DECIMAL_ZERO)
        total_pagado += pagado
        total_parte += parte
        detalle_gastos.append(
            MiSaldoGastoRead(
                IdGasto=gasto.IdGasto,
                Nombre=gasto.Nombre,
                FechaGasto=gasto.FechaGasto,
                NombreCategoria=gasto.Categoria.Nombre,
                Monto=_round_money(Decimal(gasto.Monto)),
                NombrePagador=_nombre_usuario(gasto.Pagador),
                PagasteVos=pague,
                Pagado=pagado,
                TuParte=parte,
                Efecto=_round_money(pagado - parte),
            )
        )

    transferencias = db.scalars(
        select(TransferenciaLiquidacion)
        .options(
            joinedload(TransferenciaLiquidacion.ParticipanteDeudor).joinedload(ParticipanteViaje.Usuario),
            joinedload(TransferenciaLiquidacion.ParticipanteAcreedor).joinedload(ParticipanteViaje.Usuario),
            joinedload(TransferenciaLiquidacion.EstadoTransferencia),
        )
        .join(
            LiquidacionViaje,
            LiquidacionViaje.IdLiquidacion == TransferenciaLiquidacion.IdLiquidacion,
        )
        .join(
            EstadoTransferenciaLiquidacion,
            EstadoTransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion
            == TransferenciaLiquidacion.IdEstadoTransferenciaLiquidacion,
        )
        .where(
            LiquidacionViaje.IdViaje == trip_id,
            EstadoTransferenciaLiquidacion.Nombre.in_(ESTADOS_PAGADOS),
            (TransferenciaLiquidacion.IdParticipanteDeudor == mi_id)
            | (TransferenciaLiquidacion.IdParticipanteAcreedor == mi_id),
        )
        .order_by(TransferenciaLiquidacion.IdTransferenciaLiquidacion)
    ).unique().all()

    detalle_transferencias = []
    enviadas = DECIMAL_ZERO
    recibidas = DECIMAL_ZERO
    for transferencia in transferencias:
        monto = _round_money(Decimal(transferencia.Monto))
        enviada = transferencia.IdParticipanteDeudor == mi_id
        if enviada:
            enviadas += monto
        else:
            recibidas += monto
        contraparte = (
            transferencia.ParticipanteAcreedor if enviada else transferencia.ParticipanteDeudor
        )
        detalle_transferencias.append(
            MiSaldoTransferenciaRead(
                IdTransferenciaLiquidacion=transferencia.IdTransferenciaLiquidacion,
                Enviada=enviada,
                NombreContraparte=_nombre_usuario(contraparte),
                Monto=monto,
                Estado=transferencia.EstadoTransferencia.Nombre,
                Efecto=monto if enviada else -monto,
            )
        )

    return MiSaldoRead(
        Moneda=(viaje.Moneda or "USD").upper(),
        TotalPagado=_round_money(total_pagado),
        TotalParte=_round_money(total_parte),
        TransferenciasEnviadas=_round_money(enviadas),
        TransferenciasRecibidas=_round_money(recibidas),
        Saldo=_round_money(total_pagado - total_parte + enviadas - recibidas),
        Gastos=detalle_gastos,
        Transferencias=detalle_transferencias,
    )