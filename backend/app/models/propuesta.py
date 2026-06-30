from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Propuesta(Base):
    __tablename__ = "Propuestas"
    __table_args__ = (
        CheckConstraint('TRIM("Texto") <> \'\'', name="CK_Propuestas_Texto"),
    )

    IdPropuesta: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    IdVotacion: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "Votaciones.IdVotacion",
            name="FK_Propuestas_Votaciones_IdVotacion",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    Texto: Mapped[str] = mapped_column(String(255), nullable=False)

    # Orden de presentacion (estable) dentro de la votacion.
    Orden: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    Votacion = relationship(
        "Votacion", back_populates="Propuestas", foreign_keys=[IdVotacion]
    )
    Votos = relationship(
        "Voto",
        back_populates="Propuesta",
        cascade="all, delete-orphan",
        foreign_keys="Voto.IdPropuesta",
    )
