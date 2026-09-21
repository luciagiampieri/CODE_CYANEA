from calendar import monthrange
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
 
from app.models.destino_viaje import DestinoViaje
from app.models.dia_cronograma import DiaCronograma
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
 
 
ESTADOS_PARTICIPACION_CON_ACCESO = {"aceptado", "invitado", "salio"}

TRIP_FINISHED_CODE = "TRIP_FINISHED"
TRIP_EDIT_WINDOW_CLOSED_CODE = "TRIP_EDIT_WINDOW_CLOSED"


def is_trip_finished(viaje: Viaje, today: date | None = None) -> bool:
    """Un viaje está finalizado si su estado lo dice o si ya pasó su fecha de fin.

    Se considera finalizado a partir del día siguiente a FechaFin: el último
    día del viaje todavía se puede modificar.
    """
    estado = viaje.EstadoViaje.Nombre if viaje.EstadoViaje is not None else None
    if estado == "finalizado":
        return True
    today = today or date.today()
    return viaje.FechaFin is not None and viaje.FechaFin < today


def _add_one_month(fecha: date) -> date:
    """Suma un mes calendario (31 de enero + 1 mes -> 28 o 29 de febrero)."""
    year = fecha.year + (1 if fecha.month == 12 else 0)
    month = 1 if fecha.month == 12 else fecha.month + 1
    day = min(fecha.day, monthrange(year, month)[1])
    return date(year, month, day)


def trip_info_editable_until(viaje: Viaje) -> date | None:
    """Último día en que el admin puede editar los datos generales del viaje
    (título, fechas, destinos, portada): hasta un mes después de FechaFin.
    Se expone al front para que muestre u oculte la edición con la misma regla.
    """
    if viaje.FechaFin is None:
        return None
    return _add_one_month(viaje.FechaFin)


def require_trip_info_editable(viaje: Viaje, today: date | None = None) -> Viaje:
    limite = trip_info_editable_until(viaje)
    if limite is not None and (today or date.today()) > limite:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El plazo para editar la información general de este viaje ha vencido",
            headers={"X-Error-Code": TRIP_EDIT_WINDOW_CLOSED_CODE},
        )
    return viaje


def resolve_trip_status(viaje: Viaje, today: date | None = None) -> str:
    """Estado que se expone a los clientes (el de la base puede seguir en 'activo')."""
    estado = viaje.EstadoViaje.Nombre if viaje.EstadoViaje is not None else "activo"
    if estado == "activo" and is_trip_finished(viaje, today):
        return "finalizado"
    return estado


def require_trip_not_finished(viaje: Viaje, seccion: str) -> Viaje:
    """Bloquea modificaciones de un viaje finalizado.

    `seccion` se usa en el mensaje, p. ej. "el itinerario".
    Gastos y liquidaciones NO usan esta validación: se siguen resolviendo
    después del viaje.
    """
    if is_trip_finished(viaje):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El viaje ya finalizó: {seccion} no se puede modificar.",
            headers={"X-Error-Code": TRIP_FINISHED_CODE},
        )
    return viaje


def get_trip_with_relations(db: Session, trip_id: int) -> Viaje | None:
    return db.scalar(
        select(Viaje)
        .options(
            selectinload(Viaje.Administrador),
            selectinload(Viaje.EstadoViaje),
            selectinload(Viaje.Cronograma).selectinload(DiaCronograma.Actividades),
            selectinload(Viaje.Cronograma).selectinload(DiaCronograma.Ruta),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.Usuario),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.RolParticipante),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.EstadoParticipacion),
            selectinload(Viaje.Invitaciones).selectinload(InvitacionViaje.EstadoInvitacion),
            selectinload(Viaje.Destinos).selectinload(DestinoViaje.Destino),
        )
        .where(Viaje.IdViaje == trip_id)
    )
 
 
def require_trip_access(viaje: Viaje | None, current_user: Usuario) -> Viaje:
    if viaje is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")
 
    if viaje.EstadoViaje.Nombre == "eliminado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El acceso a este viaje ha sido restringido porque fue eliminado.",
        )
 
    participacion = next(
        (
            part
            for part in viaje.Participantes
            if part.IdUsuario == current_user.IdUsuario
        ),
        None,
    )

    puede_ver = (
        viaje.IdAdministrador == current_user.IdUsuario
        or (
            participacion is not None
            and participacion.EstadoParticipacion.Nombre in {"aceptado", "salio", "invitado"}
        )
    )

    if not puede_ver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver este viaje",
        )
    return viaje


def require_trip_edit_access(viaje: Viaje | None, current_user: Usuario) -> Viaje:
    viaje = require_trip_access(viaje, current_user)

    participacion = next(
        (
            part
            for part in viaje.Participantes
            if part.IdUsuario == current_user.IdUsuario
        ),
        None,
    )

    if participacion is None or participacion.EstadoParticipacion.Nombre != "aceptado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para modificar este viaje",
        )

    return viaje