from datetime import datetime, time

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ActividadItinerario(Base):
    __tablename__ = "ActividadesItinerario"
    __table_args__ = (
        CheckConstraint('"HoraFin" > "HoraInicio"', name="CK_ActividadesItinerario_Horarios"),
    )

    IdActividad: Mapped[int] = mapped_column(primary_key=True)
    IdDiaCronograma: Mapped[int] = mapped_column(
        ForeignKey(
            "DiasCronogramas.IdDiaCronograma",
            name="FK_ActividadesItinerario_DiasCronogramas_IdDiaCronograma",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    Nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    Descripcion: Mapped[str | None] = mapped_column(Text(), nullable=True)
    HoraInicio: Mapped[time] = mapped_column(Time(), nullable=False)
    HoraFin: Mapped[time] = mapped_column(Time(), nullable=False)
    Icono: Mapped[str] = mapped_column(String(50), nullable=False, default="location-dot")
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    DiaCronograma = relationship("DiaCronograma", back_populates="Actividades")