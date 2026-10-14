from datetime import datetime
import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TipoVotacionEnum(str, enum.Enum):
    opcion_unica = "opcion_unica"
    opcion_multiple = "opcion_multiple"



ESTADOS_RESOLUCION = (
    "incorporada",
    "empate",
    "sin_votos",
    "dia_inexistente",
    "empate_vencido",
)


class Votacion(Base):
    __tablename__ = "Votaciones"
    __table_args__ = (
        CheckConstraint('TRIM("Titulo") <> \'\'', name="CK_Votaciones_Titulo"),
        CheckConstraint(
            '"EstadoResolucion" IS NULL OR "EstadoResolucion" IN '
            "('incorporada','empate','sin_votos','dia_inexistente','empate_vencido')",
            name="CK_Votaciones_EstadoResolucion",
        ),
        Index("IX_Votaciones_Resolucion", "EsDeSugerencias", "EstadoResolucion", "FechaCierre"),
    )

    IdVotacion: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    IdViaje: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("Viajes.IdViaje", name="FK_Votaciones_Viajes_IdViaje"),
        nullable=False,
    )

    Titulo: Mapped[str] = mapped_column(String(150), nullable=False)

    Tipo: Mapped[TipoVotacionEnum] = mapped_column(
        Enum(TipoVotacionEnum, name="tipo_votacion_enum"),
        nullable=False,
    )

    FechaCierre: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    IdCreador: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("Usuarios.IdUsuario", name="FK_Votaciones_Usuarios_IdCreador"),
        nullable=False,
    )

    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    FechaActualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    FechaCancelacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    EsDeSugerencias: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    IdDiaCronograma: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(
            "DiasCronogramas.IdDiaCronograma",
            name="FK_Votaciones_DiasCron_IdDia",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    EstadoResolucion: Mapped[str | None] = mapped_column(String(20), nullable=True)
    FechaResolucion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    FechaLimiteDesempate: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    Viaje = relationship("Viaje", foreign_keys=[IdViaje])
    Creador = relationship("Usuario", foreign_keys=[IdCreador])

    Propuestas = relationship(
        "Propuesta",
        back_populates="Votacion",
        cascade="all, delete-orphan",
        order_by="Propuesta.Orden",
        foreign_keys="Propuesta.IdVotacion",
    )
    Votos = relationship(
        "Voto",
        back_populates="Votacion",
        cascade="all, delete-orphan",
        foreign_keys="Voto.IdVotacion",
    )