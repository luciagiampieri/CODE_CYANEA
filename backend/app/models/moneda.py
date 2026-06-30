from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Moneda(Base):
    __tablename__ = "Monedas"

    Codigo: Mapped[str] = mapped_column(String(3), primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(100), nullable=False)

    Viajes = relationship(
        "Viaje",
        back_populates="MonedaRelacion"
    )