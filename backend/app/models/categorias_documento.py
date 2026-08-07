from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class CategoriaDocumento(Base):
    __tablename__ = "CategoriasDocumentos"

    IdCategoriaDocumento: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True
    )

    Nombre: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        unique=True
    )

    Documentos = relationship(
        "DocumentoViaje",
        back_populates="CategoriaDocumentoRelacion"
    )