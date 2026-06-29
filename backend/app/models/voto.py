from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Voto(Base):
    __tablename__ = "Votos"
    __table_args__ = (
        # Un usuario no puede votar dos veces la misma propuesta.
        UniqueConstraint(
            "IdUsuario", "IdVotacion", "IdPropuesta", name="UQ_Votos_Usuario_Propuesta"
        ),
    )

    IdVoto: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    IdUsuario: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("Usuarios.IdUsuario", name="FK_Votos_Usuarios_IdUsuario"),
        nullable=False,
    )

    IdVotacion: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "Votaciones.IdVotacion",
            name="FK_Votos_Votaciones_IdVotacion",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    IdPropuesta: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "Propuestas.IdPropuesta",
            name="FK_Votos_Propuestas_IdPropuesta",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    FechaVoto: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    Votacion = relationship("Votacion", back_populates="Votos", foreign_keys=[IdVotacion])
    Propuesta = relationship("Propuesta", back_populates="Votos", foreign_keys=[IdPropuesta])
    Usuario = relationship("Usuario", foreign_keys=[IdUsuario])
