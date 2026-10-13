from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

ESTADOS_SOLICITUD = ("en_proceso", "completada", "sin_resultados", "fallida")


class EstadoSugerenciaActividad(Base):
    __tablename__ = "EstadosSugerenciasActividades"

    IdEstadoSugerenciaActividad: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)


class SolicitudSugerenciaActividad(Base):
    __tablename__ = "SolicitudesSugerenciasActividades"
    __table_args__ = (
        CheckConstraint('"HoraFin" > "HoraInicio"', name="CK_SolSugAct_Horarios"),
        CheckConstraint(
            "\"Estado\" IN ('en_proceso','completada','sin_resultados','fallida')",
            name="CK_SolSugAct_Estado",
        ),
        Index(
            "UX_SolSugAct_EnProceso",
            "IdViaje",
            "IdDiaCronograma",
            unique=True,
            postgresql_where=text("\"Estado\" = 'en_proceso'"),
        ),
        Index("IX_SolSugAct_Viaje_Fecha", "IdViaje", "FechaSolicitud"),
    )

    IdSolicitudSugerenciaActividad: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_SolSugAct_Viajes_IdViaje", ondelete="CASCADE"),
        nullable=False,
    )
    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_SolSugAct_Usuarios_IdUsuario"),
        nullable=False,
    )
    IdDiaCronograma: Mapped[int] = mapped_column(
        ForeignKey(
            "DiasCronogramas.IdDiaCronograma",
            name="FK_SolSugAct_DiasCron_IdDia",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    HoraInicio: Mapped[time] = mapped_column(Time(), nullable=False)
    HoraFin: Mapped[time] = mapped_column(Time(), nullable=False)
    Estado: Mapped[str] = mapped_column(String(20), nullable=False, default="en_proceso")
    CantidadSugerencias: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    CodigoError: Mapped[str | None] = mapped_column(String(50), nullable=True)
    FechaSolicitud: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    FechaFin: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SugerenciaActividad(Base):
    __tablename__ = "SugerenciasActividades"
    __table_args__ = (
        CheckConstraint('"HoraFin" > "HoraInicio"', name="CK_SugAct_Horarios"),
        CheckConstraint('"CostoEstimadoARS" >= 0', name="CK_SugAct_Costo"),
        Index("IX_SugAct_Viaje_Dia", "IdViaje", "IdDiaCronograma"),
    )

    IdSugerenciaActividad: Mapped[int] = mapped_column(primary_key=True)
    IdSolicitudSugerenciaActividad: Mapped[int] = mapped_column(
        ForeignKey(
            "SolicitudesSugerenciasActividades.IdSolicitudSugerenciaActividad",
            name="FK_SugAct_SolSugAct_IdSolicitud",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_SugAct_Viajes_IdViaje", ondelete="CASCADE"),
        nullable=False,
    )
    IdDiaCronograma: Mapped[int] = mapped_column(
        ForeignKey(
            "DiasCronogramas.IdDiaCronograma",
            name="FK_SugAct_DiasCron_IdDia",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    IdEstadoSugerenciaActividad: Mapped[int] = mapped_column(
        ForeignKey(
            "EstadosSugerenciasActividades.IdEstadoSugerenciaActividad",
            name="FK_SugAct_EstSugAct_IdEstado",
        ),
        nullable=False,
    )
    Nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    Descripcion: Mapped[str] = mapped_column(Text(), nullable=False)
    HoraInicio: Mapped[time] = mapped_column(Time(), nullable=False)
    HoraFin: Mapped[time] = mapped_column(Time(), nullable=False)
    GooglePlaceId: Mapped[str] = mapped_column(String(255), nullable=False)
    LugarNombre: Mapped[str] = mapped_column(String(200), nullable=False)
    LugarDireccion: Mapped[str] = mapped_column(String(255), nullable=False)
    Lat: Mapped[float] = mapped_column(nullable=False)
    Lng: Mapped[float] = mapped_column(nullable=False)
    SitioWebUrl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    FotoReferencia: Mapped[str | None] = mapped_column(String(500), nullable=True)
    CostoEstimadoARS: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    Motivo: Mapped[str] = mapped_column(Text(), nullable=False)
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    Estado = relationship("EstadoSugerenciaActividad")
    Solicitud = relationship("SolicitudSugerenciaActividad")