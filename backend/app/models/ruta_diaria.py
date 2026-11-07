from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, JSON, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RutaDiaria(Base):
    __tablename__ = "RutasDiarias"
    # Un día normal tiene una sola ruta, sin destino. Un día de traslado sin noches en viaje
    # tiene hasta dos: una por cada destino, porque los dos no se unen (US 138).
    __table_args__ = (
        Index(
            "UX_RutasDiarias_Dia",
            "IdDiaCronograma",
            unique=True,
            postgresql_where=text('"IdDestino" IS NULL'),
            sqlite_where=text('"IdDestino" IS NULL'),
        ),
        Index(
            "UX_RutasDiarias_Dia_Destino",
            "IdDiaCronograma",
            "IdDestino",
            unique=True,
            postgresql_where=text('"IdDestino" IS NOT NULL'),
            sqlite_where=text('"IdDestino" IS NOT NULL'),
        ),
    )

    IdRutaDiaria: Mapped[int] = mapped_column(primary_key=True)
    IdDiaCronograma: Mapped[int] = mapped_column(
        ForeignKey(
            "DiasCronogramas.IdDiaCronograma",
            name="FK_RutasDiarias_DiasCronogramas_IdDiaCronograma",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    IdDestino: Mapped[int | None] = mapped_column(
        ForeignKey("Destinos.IdDestino", name="FK_RutasDiarias_Destinos_IdDestino"),
        nullable=True,
    )
    Modo: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="walking"
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

    DiaCronograma = relationship("DiaCronograma", back_populates="Rutas")
    Destino = relationship("Destino")

    @property
    def NombreDestino(self) -> str | None:
        return self.Destino.Nombre if self.Destino else None
