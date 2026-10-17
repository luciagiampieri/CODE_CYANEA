from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import Plan
from app.models.usuario import Usuario
from app.models.viaje import Viaje


def require_trip_capacity(db: Session, viaje: Viaje) -> None:
    """El llamador mantiene bloqueado el viaje hasta incorporar al participante."""
    # Se lee el plan vigente del administrador, no el de quien solicita unirse.
    id_plan = db.scalar(select(Usuario.IdPlan).where(Usuario.IdUsuario == viaje.IdAdministrador))
    plan = db.scalar(
        select(Plan)
        .where(Plan.IdPlan == id_plan)
        .with_for_update(read=True)
        .execution_options(populate_existing=True)
    )
    if plan is None or not plan.Activo:
        raise HTTPException(
            503,
            "No se pudo verificar el cupo del plan del administrador.",
            headers={"X-Error-Code": "PLAN_UNAVAILABLE"},
        )
    aceptados = (
        db.scalar(
            select(func.count())
            .select_from(ParticipanteViaje)
            .join(ParticipanteViaje.EstadoParticipacion)
            .where(
                ParticipanteViaje.IdViaje == viaje.IdViaje,
                EstadoParticipacion.Nombre == "aceptado",
            )
        )
        or 0
    )
    if aceptados >= plan.MaxParticipantesViaje:
        raise HTTPException(
            409,
            f"El viaje alcanzó el límite de {plan.MaxParticipantesViaje} participantes del plan de su administrador.",
            headers={"X-Error-Code": "TRIP_PARTICIPANT_LIMIT_REACHED"},
        )
