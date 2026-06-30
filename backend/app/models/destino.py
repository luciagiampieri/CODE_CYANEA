from app.db.session import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String

class Destino(Base):
    __tablename__ = "Destinos"

    IdDestino: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    Pais: Mapped[str] = mapped_column(String(100), nullable=False)
    Lat: Mapped[float | None] = mapped_column(nullable=True)
    Lng: Mapped[float | None] = mapped_column(nullable=True)

    DestinoViajes = relationship( 
        "DestinoViaje",
        back_populates="Destino"
    )