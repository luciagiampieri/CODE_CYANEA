from sqlalchemy import CheckConstraint, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DestinoViaje(Base):
    __tablename__ = "DestinosViajes"
    __table_args__ = (
        CheckConstraint('"Noches" IS NULL OR "Noches" >= 0', name="CK_DestinosViajes_Noches"),
        CheckConstraint('"NochesEnViaje" >= 0', name="CK_DestinosViajes_NochesEnViaje"),
    )

    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje"),
        primary_key=True
    )

    IdDestino: Mapped[int] = mapped_column(
        ForeignKey("Destinos.IdDestino"),
        primary_key=True
    )

    # Posición del destino en el recorrido (desde 0).
    Orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # NULL: recorrido sin armar (viaje de un destino, anterior a la US o con menos
    # noches que destinos).
    Noches: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Noches de traslado hacia el destino siguiente; no pertenecen a ningún destino.
    NochesEnViaje: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    Viaje = relationship(
        "Viaje",
        back_populates="Destinos",
    )
    Destino = relationship(
        "Destino",
        back_populates="DestinoViajes",
    )
