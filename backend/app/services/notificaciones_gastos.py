"""A quién se notifica cuando se registra, edita o elimina un gasto.

- Un gasto personal no se notifica a nadie: no cambia saldos ni deudas.
- Un gasto compartido se notifica a los participantes de su división y a su
  pagador (sin quien lo registró).
- Como la liquidación simplifica deudas entre todo el grupo, un gasto puede
  cambiar a quién le transfiere (o de quién cobra) alguien que no participa.
  A esas personas se les avisa con un mensaje de "liquidación actualizada".
  Un cambio solo de monto, con las mismas personas, no se avisa.
- Lo mismo vale al editar o eliminar un gasto (notificar_liquidacion_actualizada).
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.gasto import Gasto
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.liquidacion_service import (
    TransferenciaPendiente,
    participantes_con_contrapartes_distintas,
)
from app.services.notifications import (
    NotificationType,
    TripNotificationEvent,
    dispatch_user_notification,
)


def _nombre(usuario: Usuario) -> str:
    return f"{usuario.Nombre} {usuario.Apellido}".strip() or usuario.NombreUsuario


def formatear_monto(monto: Decimal, moneda: str) -> str:
    """1234.5 -> "ARS 1.234,50" (formato argentino)."""
    texto = f"{Decimal(monto):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{moneda} {texto}"


def _enumerar(partes: list[str]) -> str:
    if len(partes) <= 1:
        return "".join(partes)
    return f"{', '.join(partes[:-1])} y {partes[-1]}"


def describir_transferencias(transferencias: list[TransferenciaPendiente], moneda: str) -> str:
    """Resume las transferencias pendientes de una persona en una frase."""
    paga = [t for t in transferencias if t.rol == "paga"]
    cobra = [t for t in transferencias if t.rol == "cobra"]
    frases = []
    if paga:
        frases.append(
            "Ahora tenés que transferir "
            + _enumerar([f"{formatear_monto(t.monto, moneda)} a {t.nombre_contraparte}" for t in paga])
            + "."
        )
    if cobra:
        frases.append(
            "Ahora vas a recibir "
            + _enumerar([f"{formatear_monto(t.monto, moneda)} de {t.nombre_contraparte}" for t in cobra])
            + "."
        )
    return " ".join(frases) or "Ya no tenés transferencias pendientes."


def _usuarios(db: Session, ids: set[int]) -> list[Usuario]:
    if not ids:
        return []
    return list(db.scalars(select(Usuario).where(Usuario.IdUsuario.in_(ids))).all())


async def notificar_alta_gasto(
    db: Session,
    viaje: Viaje,
    gasto: Gasto,
    actor: Usuario,
    transferencias_antes: dict[int, list[TransferenciaPendiente]],
    transferencias_despues: dict[int, list[TransferenciaPendiente]],
) -> None:
    # Gasto personal: no se notifica a nadie.
    if gasto.TipoDivision is None:
        return

    participantes = {
        p.IdParticipanteViaje: p
        for p in db.scalars(
            select(ParticipanteViaje).where(ParticipanteViaje.IdViaje == viaje.IdViaje)
        ).all()
    }

    # 1. División actual y pagador del gasto.
    involucrados = {
        participantes[a.IdParticipanteViaje].IdUsuario
        for a in gasto.ParticipantesAsociados
        if a.IdParticipanteViaje in participantes
    }
    if gasto.IdPagador in participantes:
        involucrados.add(participantes[gasto.IdPagador].IdUsuario)
    involucrados.discard(actor.IdUsuario)

    await dispatch_user_notification(
        db,
        TripNotificationEvent(
            notification_type=NotificationType.NUEVO_GASTO,
            tipo="gasto_creado",
            titulo=f"Nuevo gasto en {viaje.Titulo}",
            mensaje=f"{_nombre(actor)} registró el gasto {gasto.Nombre}.",
            id_viaje=viaje.IdViaje,
            id_usuario_actor=actor.IdUsuario,
            data={"eventType": "expense_created", "expenseId": gasto.IdGasto},
        ),
        _usuarios(db, involucrados),
    )

    # 2. Quienes no participan pero les cambió a quién transfieren o de quién cobran.
    await notificar_liquidacion_actualizada(
        db,
        viaje,
        actor,
        transferencias_antes,
        transferencias_despues,
        excluir_usuarios=involucrados,
    )


async def notificar_liquidacion_actualizada(
    db: Session,
    viaje: Viaje,
    actor: Usuario,
    transferencias_antes: dict[int, list[TransferenciaPendiente]],
    transferencias_despues: dict[int, list[TransferenciaPendiente]],
    excluir_usuarios: set[int] | None = None,
) -> None:
    """Avisa a quienes les cambió a quién transfieren o de quién cobran.

    Se usa al registrar, editar y eliminar un gasto. No se avisa a quien hizo
    el cambio ni a `excluir_usuarios` (los que ya recibieron el aviso del
    gasto en sí). Un cambio solo de monto no se avisa.
    """
    excluidos = set(excluir_usuarios or ()) | {actor.IdUsuario}
    cambiaron = participantes_con_contrapartes_distintas(
        transferencias_antes, transferencias_despues
    )
    if not cambiaron:
        return

    participantes = {
        p.IdParticipanteViaje: p
        for p in db.scalars(
            select(ParticipanteViaje).where(ParticipanteViaje.IdViaje == viaje.IdViaje)
        ).all()
    }
    moneda = (viaje.Moneda or "USD").upper()
    for id_participante in sorted(cambiaron):
        participante = participantes.get(id_participante)
        if participante is None or participante.IdUsuario in excluidos:
            continue
        await dispatch_user_notification(
            db,
            TripNotificationEvent(
                notification_type=NotificationType.LIQUIDACION_ACTUALIZADA,
                tipo="liquidacion_actualizada",
                titulo=f"Se actualizó la liquidación de {viaje.Titulo}",
                mensaje=describir_transferencias(
                    transferencias_despues.get(id_participante, []), moneda
                ),
                id_viaje=viaje.IdViaje,
                id_usuario_actor=actor.IdUsuario,
                data={"eventType": "settlement_updated"},
            ),
            _usuarios(db, {participante.IdUsuario}),
        )