from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
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


# --- Helpers -----------------------------------------------------------------

def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(fecha: datetime) -> datetime:
    """Garantiza un datetime timezone-aware (asume UTC si viniera naive)."""
    return fecha if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)


def _estado(votacion: Votacion) -> str:
    """AC7/AC8: una vez alcanzada la fecha de cierre la votacion queda 'cerrada'.

    Se deriva de forma perezosa comparando contra la hora actual, sin necesidad
    de un job programado.
    """
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
        Titulo=votacion.Titulo,
        Tipo=_tipo_str(votacion),
        FechaCierre=_aware(votacion.FechaCierre),
        Estado=_estado(votacion),
        YaVoto=ya_voto,
        Propuestas=[
            PropuestaRead(IdPropuesta=p.IdPropuesta, Texto=p.Texto) for p in propuestas
        ],
    )


# --- Crear votacion (US 'Crear votacion') ------------------------------------

@router.post("/votaciones", response_model=VotacionRead, status_code=status.HTTP_201_CREATED)
def crear_votacion(
    payload: VotacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> VotacionRead:
    viaje = db.get(Viaje, payload.idViaje)
    if viaje is None:
        raise HTTPException(status_code=404, detail="El viaje no existe.")

    # Solo participantes (o el administrador) del viaje pueden crear votaciones.
    if not _es_miembro_del_viaje(db, viaje, current_user):
        raise HTTPException(
            status_code=403,
            detail="No formas parte de este viaje.",
        )

    # AC1/AC2/AC3/AC6 ya fueron validados en el schema (nombre, fecha futura,
    # tipo valido y >= 2 propuestas).
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

    # AC9: el mensaje de confirmacion lo muestra el frontend al recibir el 201.
    return _build_votacion_read(db, votacion, current_user.IdUsuario)


@router.get("/votaciones", response_model=List[VotacionRead])
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


@router.get("/votaciones/{id_votacion}/resultados", response_model=VotacionResultados)
def resultados_votacion(
    id_votacion: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> VotacionResultados:
    """AC8: resultados consolidados.

    Se calculan al momento de la consulta. Cuando la votacion ya cerro, estos
    numeros son definitivos (no se admiten nuevos votos tras el cierre, AC7).
    """
    votacion = db.scalar(
        select(Votacion)
        .options(selectinload(Votacion.Propuestas))
        .where(Votacion.IdVotacion == id_votacion)
    )
    if votacion is None:
        raise HTTPException(status_code=404, detail="La votacion no existe.")

    viaje = db.get(Viaje, votacion.IdViaje)
    if not _es_miembro_del_viaje(db, viaje, current_user):
        raise HTTPException(status_code=403, detail="No formas parte de este viaje.")

    # Conteo de votos por propuesta.
    filas = db.execute(
        select(Voto.IdPropuesta, func.count(Voto.IdVoto))
        .where(Voto.IdVotacion == id_votacion)
        .group_by(Voto.IdPropuesta)
    ).all()
    votos_por_propuesta = {id_propuesta: total for id_propuesta, total in filas}

    total_votantes = (
        db.scalar(
            select(func.count(func.distinct(Voto.IdUsuario))).where(
                Voto.IdVotacion == id_votacion
            )
        )
        or 0
    )
    total_votos = sum(votos_por_propuesta.values())

    propuestas = sorted(votacion.Propuestas, key=lambda p: (p.Orden, p.IdPropuesta))
    resultados = [
        ResultadoPropuesta(
            IdPropuesta=p.IdPropuesta,
            Texto=p.Texto,
            Votos=votos_por_propuesta.get(p.IdPropuesta, 0),
            Porcentaje=round(
                (votos_por_propuesta.get(p.IdPropuesta, 0) / total_votos) * 100, 2
            )
            if total_votos
            else 0.0,
        )
        for p in propuestas
    ]

    return VotacionResultados(
        IdVotacion=votacion.IdVotacion,
        Titulo=votacion.Titulo,
        Tipo=_tipo_str(votacion),
        FechaCierre=_aware(votacion.FechaCierre),
        Estado=_estado(votacion),
        TotalVotantes=total_votantes,
        Resultados=resultados,
    )


# =============================================================================
# Emitir voto - implementacion de la companiera (US 'Emitir voto').
# Se mantiene tal cual; quedara funcional al existir las tablas de esta US.
# =============================================================================

class VotoRequest(BaseModel):
    idPropuestas: List[int]


@router.post("/votaciones/{id_votacion}/votar")
def emitir_voto(id_votacion: int, request: VotoRequest, current_user_id: int = 1, db = Depends(get_db)):
    votacion = db.execute('SELECT * FROM public."Votaciones" WHERE "IdVotacion" = %s', (id_votacion,)).fetchone()
    if not votacion:
        raise HTTPException(status_code=404, detail="La votación no existe.")

    if datetime.now(timezone.utc) > votacion["FechaCierre"].replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="La votación ya ha cerrado.")

    ya_voto = db.execute('SELECT 1 FROM public."Votos" WHERE "IdUsuario" = %s AND "IdVotacion" = %s', (current_user_id, id_votacion)).fetchone()
    if ya_voto:
        raise HTTPException(status_code=400, detail="Ya has emitir un voto en esta votación.")

    if votacion["Tipo"] == "opcion_unica" and len(request.idPropuestas) > 1:
        raise HTTPException(status_code=400, detail="Solo puedes seleccionar una propuesta en esta votación.")

    if len(request.idPropuestas) == 0:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos una propuesta.")

    for id_propuesta in request.idPropuestas:
        db.execute(
            'INSERT INTO public."Votos" ("IdUsuario", "IdVotacion", "IdPropuesta") VALUES (%s, %s, %s)',
            (current_user_id, id_votacion, id_propuesta)
        )
    db.commit()

    return {"detail": "Voto registrado correctamente. ¡Gracias por participar!"}
