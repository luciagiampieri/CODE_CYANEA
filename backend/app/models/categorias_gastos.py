from sqlalchemy import BigInteger, Boolean, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


from app.db.session import Base

ICONO_POR_DEFECTO = "tags"


class CategoriasGastos(Base):

    __tablename__ = "CategoriasGastos"

    IdCategoria: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    # Nombre de un ícono de FontAwesome 6 (US 110).
    Icono: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ICONO_POR_DEFECTO, server_default=ICONO_POR_DEFECTO
    )
    Activo: Mapped[bool] = mapped_column(Boolean, server_default=func.text("true"), nullable=False, default=True)

    # Relaciones
    Gastos = relationship(
        "Gasto",
        back_populates="Categoria",
        foreign_keys="Gasto.IdCategoria",
    )
