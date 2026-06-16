from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import String, Numeric, Boolean, Date, BigInteger, ForeignKey, DateTime, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

class Gasto(Base):
    __tablename__ = "Gastos"

    IdGasto: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    
    IdViaje: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("Viajes.IdViaje", name="FK_Gastos_Viajes_IdViaje"), 
        nullable=False,
        )
    
    Nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    
    Monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    IdCategoria: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("CategoriasGastos.IdCategoria", name="FK_Gastos_CategoriasGastos_IdCategoria"), 
        nullable=False,
        )
    
    IdPagador: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("ParticipantesViajes.IdParticipanteViaje", name="FK_Gastos_ParticipantesViajes_IdParticipanteViaje"), 
        nullable=False,
        )
    
    DividirEntreTodos: Mapped[bool] = mapped_column(Boolean, server_default=func.text("true"), nullable=False, default=True)
    
    FechaGasto: Mapped[date] = mapped_column(Date, nullable=False)
    
    FechaCreacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    FechaActualizacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Restricciones (Check Constraints espejo de la migración)
    __table_args__ = (
        CheckConstraint('"Monto" > 0', name="CK_Gastos_Monto"),
        CheckConstraint('TRIM("Nombre") <> \'\'', name="CK_Gastos_Nombre"),
    )

    # Relaciones directas
    Viaje = relationship("Viaje", back_populates="Gastos", foreign_keys=[IdViaje])
    Pagador = relationship("ParticipanteViaje", back_populates="GastosPagados", foreign_keys=[IdPagador])
    Categoria = relationship("CategoriasGastos", back_populates="Gastos", foreign_keys=[IdCategoria])

    # Relación intermedia hacia ParticipantesGastos con eliminación en cascada
    ParticipantesAsociados = relationship(
        "ParticipanteGasto",
        back_populates="Gasto",
        cascade="all, delete-orphan",
        foreign_keys="ParticipanteGasto.IdGasto",
    )
