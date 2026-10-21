from sqlalchemy.orm import Session

from app.models.viaje import Viaje
from app.services.limites_planes import validar_participantes


def require_trip_capacity(db: Session, viaje: Viaje) -> None:
    validar_participantes(db, viaje)