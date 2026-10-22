from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.categorias_gastos import ICONO_POR_DEFECTO


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

    # Nombre de un ícono de FontAwesome 6 (US 110).
    Icono: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ICONO_POR_DEFECTO, server_default=ICONO_POR_DEFECTO
    )
    Activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # Categorías que usa el sistema (p. ej. "Comprobantes" al guardar el comprobante de
    # un gasto): no se pueden desactivar ni eliminar desde el backoffice.
    EsSistema: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    Documentos = relationship(
        "DocumentoViaje",
        back_populates="CategoriaDocumentoRelacion"
    )
