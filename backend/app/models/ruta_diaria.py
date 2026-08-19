from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RutaDiaria(Base):
    __tablename__ = "RutasDiarias"

    IdRutaDiaria: Mapped[int] = mapped_column(primary_key=True)
    IdDiaCronograma: Mapped[int] = mapped_column(
        ForeignKey(
            "DiasCronogramas.IdDiaCronograma",
            name="FK_RutasDiarias_DiasCronogramas_IdDiaCronograma",
            ondelete="CASCADE",
        ),
        unique=True,
        nullable=False,
    )
    PolilineaCodificada: Mapped[str] = mapped_column(nullable=False)
    DistanciaMetros: Mapped[int] = mapped_column(Integer, nullable=False)
    DuracionSegundos: Mapped[int] = mapped_column(Integer, nullable=False)
    IdsActividadesOrdenadas: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    FechaGeneracion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    DiaCronograma = relationship("DiaCronograma", back_populates="Ruta")