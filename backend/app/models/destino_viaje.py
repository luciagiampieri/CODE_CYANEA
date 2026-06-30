from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DestinoViaje(Base):
    __tablename__ = "DestinosViajes"

    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje"),
        primary_key=True
    )

    IdDestino: Mapped[int] = mapped_column(
        ForeignKey("Destinos.IdDestino"),
        primary_key=True
    )

    Viaje = relationship(
        "Viaje",
        back_populates="Destinos",
    )
    Destino = relationship(
        "Destino",
        back_populates="DestinoViajes",
    )
