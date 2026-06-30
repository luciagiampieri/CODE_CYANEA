from datetime import date
from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

class DiaCronograma(Base):
    __tablename__ = "DiasCronogramas"

    IdDiaCronograma: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_DiasCronogramas_Viajes_IdViaje", ondelete="CASCADE"),
        nullable=False,
    )
    Fecha: Mapped[date] = mapped_column(Date, nullable=False)
    IndiceDia: Mapped[int] = mapped_column(Integer, nullable=False)

    Viaje = relationship("Viaje", back_populates="Cronograma")
    Actividades = relationship(
        "ActividadItinerario",
        back_populates="DiaCronograma",
        cascade="all, delete-orphan",
        order_by="ActividadItinerario.HoraInicio",
    )