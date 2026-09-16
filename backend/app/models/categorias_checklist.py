from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

class CategoriasChecklist(Base):
    __tablename__ = "CategoriasChecklist"

    IdCategoriaChecklist: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    Activo: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False, default=True)

    Checklists = relationship(
        "Checklist",
        back_populates="CategoriaChecklist",
        foreign_keys="Checklist.IdCategoriaChecklist",
    )