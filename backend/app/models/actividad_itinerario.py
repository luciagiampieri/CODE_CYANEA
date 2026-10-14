from datetime import datetime, time

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ActividadItinerario(Base):
    __tablename__ = "ActividadesItinerario"
    __table_args__ = (
        CheckConstraint('"HoraFin" > "HoraInicio"', name="CK_ActividadesItinerario_Horarios"),
        Index("IX_ActividadesItinerario_IdDiaCronograma", "IdDiaCronograma"),
        UniqueConstraint("IdVotacionOrigen", name="UX_ActividadesItinerario_IdVotacionOrigen"),
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
    IdLugarInteresViaje: Mapped[int | None] = mapped_column(
        ForeignKey(
            "LugaresInteresViajes.IdLugarInteresViaje",
            name="FK_ActIt_LugInteresViajes_IdLugarInteresViaje",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    IdLugarInteres: Mapped[int | None] = mapped_column(
        ForeignKey(
            "LugaresInteres.IdLugarInteres",
            name="FK_ActIt_LugaresInteres_IdLugarInteres",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    Nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    Descripcion: Mapped[str | None] = mapped_column(Text(), nullable=True)
    HoraInicio: Mapped[time] = mapped_column(Time(), nullable=False)
    HoraFin: Mapped[time] = mapped_column(Time(), nullable=False)
    Icono: Mapped[str] = mapped_column(String(50), nullable=False, default="location-dot")
    TipoAdvertenciaHorario: Mapped[str | None] = mapped_column(String(30), nullable=True)
    AdvertenciaHorario: Mapped[str | None] = mapped_column(String(300), nullable=True)
    IdVotacionOrigen: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "Votaciones.IdVotacion",
            name="FK_ActIt_Votaciones_IdVotacionOrigen",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    GooglePlaceIdEntradas: Mapped[str | None] = mapped_column(String(255), nullable=True)
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    DiaCronograma = relationship("DiaCronograma", back_populates="Actividades")
    LugarInteresViaje = relationship("LugarInteresViaje", back_populates="Actividades")
    LugarInteres = relationship("LugarInteres", back_populates="Actividades")