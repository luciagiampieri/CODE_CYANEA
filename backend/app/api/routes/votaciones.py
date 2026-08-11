from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.api.routes.itinerary import manager as ws_manager
from app.db.session import get_db
from app.models.participante_viaje import ParticipanteViaje
from app.models.propuesta import Propuesta
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.votacion import Votacion
from app.models.voto import Voto
from app.schemas.votacion import (
    PropuestaRead,
    ResultadoPropuesta,
    VotacionCreate,
    VotacionRead,
    VotacionResultados,
)

router = APIRouter()


def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(fecha: datetime) -> datetime:
    return fecha if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)


def _estado(votacion: Votacion) -> str:
    if votacion.FechaCancelacion is not None:
        return "cancelada"
    return "cerrada" if _aware(votacion.FechaCierre) <= _ahora_utc() else "abierta"


def _tipo_str(votacion: Votacion) -> str:
    tipo = votacion.Tipo
    return tipo.value if hasattr(tipo, "value") else str(tipo)


def _es_miembro_del_viaje(db: Session, viaje: Viaje, usuario: Usuario) -> bool:
    if viaje.IdAdministrador == usuario.IdUsuario:
        return True
    participacion = db.scalar(
        select(ParticipanteViaje).where(
            ParticipanteViaje.IdViaje == viaje.IdViaje,
            ParticipanteViaje.IdUsuario == usuario.IdUsuario,
        )
    )
    return participacion is not None


def _build_votacion_read(
    db: Session, votacion: Votacion, current_user_id: int
) -> VotacionRead:
    ya_voto = (
        db.scalar(
            select(func.count())
            .select_from(Voto)
            .where(
                Voto.IdVotacion == votacion.IdVotacion,
                Voto.IdUsuario == current_user_id,
            )
        )
        or 0
    ) > 0

    propuestas = sorted(votacion.Propuestas, key=lambda p: (p.Orden, p.IdPropuesta))

    return VotacionRead(
        IdVotacion=votacion.IdVotacion,
        IdCreador=votacion.IdCreador,
        Titulo=votacion.Titulo,
        Tipo=_tipo_str(votacion),
        FechaCierre=_aware(votacion.FechaCierre),
        Estado=_estado(votacion),
        YaVoto=ya_voto,
        Propuestas=[
            PropuestaRead(IdPropuesta=p.IdPropuesta, Texto=p.Texto) for p in propuestas
        ],
        FechaCancelacion=_aware(votacion.FechaCancelacion) if votacion.FechaCancelacion else None,
    )


def _calcular_resultados(db: Session, votacion: Votacion, current_user_id: int) -> VotacionResultados:
    filas = db.execute(
        select(Voto.IdPropuesta, func.count(Voto.IdVoto))
        .where(Voto.IdVotacion == votacion.IdVotacion)
        .group_by(Voto.IdPropuesta)
    ).all()
    votos_por_propuesta = {id_propuesta: total for id_propuesta, total in filas}

    total_votantes = db.scalar(
        select(func.count(func.distinct(Voto.IdUsuario))).where(
            Voto.IdVotacion == votacion.IdVotacion
        )
    ) or 0
    total_votos = sum(votos_por_propuesta.values())

    propuestas = sorted(votacion.Propuestas, key=lambda p: (p.Orden, p.IdPropuesta))
    resultados = [
        ResultadoPropuesta(
            IdPropuesta=p.IdPropuesta,
            Texto=p.Texto,
            Votos=votos_por_propuesta.get(p.IdPropuesta, 0),
            Porcentaje=round((votos_por_propuesta.get(p.IdPropuesta, 0) / total_votos) * 100, 2)
            if total_votos else 0.0,
        )
        for p in propuestas
    ]

    ganadores: list[int] = []
    empate = False
    if total_votos:
        max_votos = max(r.Votos for r in resultados)
        ganadores = [r.IdPropuesta for r in resultados if r.Votos == max_votos]
        empate = len(ganadores) > 1

    mis_propuestas = list(
        db.scalars(
            select(Voto.IdPropuesta).where(
                Voto.IdVotacion == votacion.IdVotacion,
                Voto.IdUsuario == current_user_id,
            )
        )
    )

    return VotacionResultados(
        IdVotacion=votacion.IdVotacion,
        Titulo=votacion.Titulo,
        Tipo=_tipo_str(votacion),
        FechaCierre=_aware(votacion.FechaCierre),
        Estado=_estado(votacion),
        TotalVotantes=total_votantes,
        TotalVotos=total_votos,
        Resultados=resultados,
        IdPropuestasGanadoras=ganadores,
        Empate=empate,
        MisPropuestas=mis_propuestas,
    )


@router.post("", response_model=VotacionRead, status_code=status.HTTP_201_CREATED)
def crear_votacion(
    payload: VotacionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> VotacionRead:
    viaje = db.get(Viaje, payload.idViaje)
    if viaje is None:
        raise HTTPException(status_code=404, detail="El viaje no existe.")

    if not _es_miembro_del_viaje(db, viaje, current_user):
        raise HTTPException(
            status_code=403,
            detail="No formas parte de este viaje.",
        )

    votacion = Votacion(
        IdViaje=payload.idViaje,
        Titulo=payload.nombre,
        Tipo=payload.tipo,
        FechaCierre=payload.fechaCierre,
        IdCreador=current_user.IdUsuario,
    )
    db.add(votacion)
    db.flush()

    for indice, texto in enumerate(payload.propuestas, start=1):
        db.add(Propuesta(IdVotacion=votacion.IdVotacion, Texto=texto, Orden=indice))

    db.commit()
    db.refresh(votacion)


    background_tasks.add_task(
        ws_manager.broadcast,
        votacion.IdViaje,
        {"tipo": "votacion_actualizada", "idVotacion": votacion.IdVotacion},
    )

    return _build_votacion_read(db, votacion, current_user.IdUsuario)


@router.get("", response_model=List[VotacionRead]) 
def listar_votaciones(
    idViaje: int = Query(..., description="Viaje del que se listan las votaciones"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> List[VotacionRead]:
    viaje = db.get(Viaje, idViaje)
    if viaje is None:
        raise HTTPException(status_code=404, detail="El viaje no existe.")
    if not _es_miembro_del_viaje(db, viaje, current_user):
        raise HTTPException(status_code=403, detail="No formas parte de este viaje.")

    votaciones = db.scalars(
        select(Votacion)
        .options(selectinload(Votacion.Propuestas))
        .where(Votacion.IdViaje == idViaje)
        .order_by(Votacion.FechaCreacion.desc())
    ).all()

    return [_build_votacion_read(db, v, current_user.IdUsuario) for v in votaciones]


@router.get("/{id_votacion}/resultados", response_model=VotacionResultados)
def resultados_votacion(
    id_votacion: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> VotacionResultados:
    votacion = db.scalar(
        select(Votacion)
        .options(selectinload(Votacion.Propuestas))
        .where(Votacion.IdVotacion == id_votacion)
    )
    if votacion is None:
        raise HTTPException(status_code=404, detail="La votación no existe.")

    viaje = db.get(Viaje, votacion.IdViaje)
    if not _es_miembro_del_viaje(db, viaje, current_user):
        raise HTTPException(status_code=403, detail="No formas parte de este viaje.")

    if _estado(votacion) not in ("cerrada", "cancelada"):
        raise HTTPException(
            status_code=400,
            detail="Los resultados solo están disponibles cuando la votación finalizó o fue cancelada.",
        )

    return _calcular_resultados(db, votacion, current_user.IdUsuario)


@router.get("/{id_votacion}/progreso", response_model=VotacionResultados)
def progreso_votacion(
    id_votacion: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> VotacionResultados:

    votacion = db.scalar(
        select(Votacion)
        .options(selectinload(Votacion.Propuestas))
        .where(Votacion.IdVotacion == id_votacion)
    )
    if votacion is None:
        raise HTTPException(status_code=404, detail="La votación no existe.")

    viaje = db.get(Viaje, votacion.IdViaje)
    if not _es_miembro_del_viaje(db, viaje, current_user):
        raise HTTPException(status_code=403, detail="No formas parte de este viaje.")

    if _estado(votacion) != "abierta":
        raise HTTPException(
            status_code=400,
            detail="El progreso solo está disponible mientras la votación sigue abierta.",
        )

    return _calcular_resultados(db, votacion, current_user.IdUsuario)


class VotoRequest(BaseModel):
    idPropuestas: List[int]


@router.post("/{id_votacion}/votar")
def emitir_voto(
    id_votacion: int, 
    request: VotoRequest, 
    background_tasks: BackgroundTasks,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    votacion = db.get(Votacion, id_votacion)
    if not votacion:
        raise HTTPException(status_code=404, detail="La votación no existe.")

    if votacion.FechaCancelacion is not None:
        raise HTTPException(status_code=400, detail="La votación fue cancelada.")

    if _ahora_utc() > _aware(votacion.FechaCierre):
        raise HTTPException(status_code=400, detail="La votación ya ha cerrado.")

    ya_voto = db.scalar(
        select(func.count())
        .select_from(Voto)
        .where(
            Voto.IdVotacion == id_votacion,
            Voto.IdUsuario == current_user.IdUsuario,
        )
    ) or 0
    
    if ya_voto > 0:
        raise HTTPException(status_code=400, detail="Ya has emitido un voto en esta votación.")

    tipo_votacion = _tipo_str(votacion)
    if tipo_votacion == "opcion_unica" and len(request.idPropuestas) > 1:
        raise HTTPException(status_code=400, detail="Solo puedes seleccionar una propuesta en esta votación.")

    if len(request.idPropuestas) == 0:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos una propuesta.")

    for id_propuesta in request.idPropuestas:
        nuevo_voto = Voto(
            IdUsuario=current_user.IdUsuario,
            IdVotacion=id_votacion,
            IdPropuesta=id_propuesta
        )
        db.add(nuevo_voto)
        
    db.commit()

    background_tasks.add_task(
        ws_manager.broadcast,
        votacion.IdViaje,
        {"tipo": "votacion_actualizada", "idVotacion": id_votacion},
    )

    return {"detail": "Voto registrado correctamente. ¡Gracias por participar!"}


@router.post("/{id_votacion}/cancelar", response_model=VotacionRead)
def cancelar_votacion(
    id_votacion: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> VotacionRead:
    votacion = db.scalar(
        select(Votacion)
        .options(selectinload(Votacion.Propuestas))
        .where(Votacion.IdVotacion == id_votacion)
    )
    if votacion is None:
        raise HTTPException(status_code=404, detail="La votación no existe.")

    if votacion.IdCreador != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo el creador de la votación puede cancelarla.",
        )

    if _estado(votacion) != "abierta":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden cancelar votaciones que están activas.",
        )

    votacion.FechaCancelacion = _ahora_utc()
    db.commit()
    db.refresh(votacion)

    background_tasks.add_task(
        ws_manager.broadcast,
        votacion.IdViaje,
        {"tipo": "votacion_actualizada", "idVotacion": votacion.IdVotacion},
    )

    return _build_votacion_read(db, votacion, current_user.IdUsuario)