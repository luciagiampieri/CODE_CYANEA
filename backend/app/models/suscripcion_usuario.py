from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class SuscripcionUsuario(Base):
    __tablename__ = "SuscripcionesUsuarios"
    __table_args__ = (
        CheckConstraint('"FechaFin" > "FechaInicio"', name="CK_SuscripcionesUsuarios_Fechas"),
        Index("IX_SuscripcionesUsuarios_Usuario_Estado", "IdUsuario", "IdEstadoSuscripcion"),
        Index("IX_SuscripcionesUsuarios_Estado_FechaFin", "IdEstadoSuscripcion", "FechaFin"),
    )

    IdSuscripcionUsuario: Mapped[int] = mapped_column(primary_key=True)
    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_SuscUsuarios_Usuarios_IdUsuario"),
        nullable=False,
    )
    IdPlan: Mapped[int] = mapped_column(
        ForeignKey("Planes.IdPlan", name="FK_SuscUsuarios_Planes_IdPlan"),
        nullable=False,
    )
    IdEstadoSuscripcion: Mapped[int] = mapped_column(
        ForeignKey(
            "EstadosSuscripciones.IdEstadoSuscripcion",
            name="FK_SuscUsuarios_EstSusc_IdEstadoSuscripcion",
        ),
        nullable=False,
    )
    FechaInicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    FechaFin: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    FechaCancelacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    Usuario = relationship("Usuario", foreign_keys=[IdUsuario])
    Plan = relationship("Plan", foreign_keys=[IdPlan])
    EstadoSuscripcion = relationship("EstadoSuscripcion", back_populates="Suscripciones")