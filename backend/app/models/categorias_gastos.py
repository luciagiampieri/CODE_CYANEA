from sqlalchemy import BigInteger, Boolean, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


from app.db.session import Base

class CategoriasGastos(Base):

    __tablename__ = "CategoriasGastos"

    IdCategoria: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    Activo: Mapped[bool] = mapped_column(Boolean, server_default=func.text("true"), nullable=False, default=True)

    # Relaciones
    Gastos = relationship(
        "Gasto",
        back_populates="Categoria",
        foreign_keys="Gasto.IdCategoria",
    )