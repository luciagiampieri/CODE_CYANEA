from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TipoItemRepositorioEnum(str, enum.Enum):
    enlace = "enlace"
    direccion = "direccion"
    contacto = "contacto"
    otro = "otro"


class ItemRepositorioViaje(Base):
    __tablename__ = "ItemsRepositorioViaje"
    __table_args__ = (
        CheckConstraint('TRIM("Titulo") <> \'\'', name="CK_ItemsRepositorioViaje_Titulo"),
        CheckConstraint('TRIM("Contenido") <> \'\'', name="CK_ItemsRepositorioViaje_Contenido"),
    )

    IdItemRepositorio: Mapped[int] = mapped_column(primary_key=True)

    IdViaje: Mapped[int] = mapped_column(
        ForeignKey("Viajes.IdViaje", name="FK_ItemsRepositorioViaje_Viajes_IdViaje", ondelete="CASCADE"),
        nullable=False,
    )

    IdUsuarioCreador: Mapped[int] = mapped_column(
        ForeignKey("Usuarios.IdUsuario", name="FK_ItemsRepositorioViaje_Usuarios_IdCreador"),
        nullable=False,
    )

    Titulo: Mapped[str] = mapped_column(String(150), nullable=False)

    Tipo: Mapped[TipoItemRepositorioEnum] = mapped_column(
        Enum(TipoItemRepositorioEnum, name="tipo_item_repositorio_enum"),
        nullable=False,
    )

    Contenido: Mapped[str] = mapped_column(Text, nullable=False)

    Descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)

    EsPublico: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    FechaActualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    Viaje = relationship("Viaje", foreign_keys=[IdViaje])
    UsuarioCreador = relationship("Usuario", foreign_keys=[IdUsuarioCreador])