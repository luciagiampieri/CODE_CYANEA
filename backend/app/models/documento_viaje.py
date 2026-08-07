from datetime import datetime

from sqlalchemy import String, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DocumentoViaje(Base):
    __tablename__ = "DocumentosViajes"
    __table_args__ = (
            UniqueConstraint('IdViaje', 'NombreArchivo', name='uq_documentos_viaje_nombre'),
        )

    IdDocumento: Mapped[int] = mapped_column(
        primary_key=True
    )

    IdViaje: Mapped[int] = mapped_column(
        ForeignKey(
            "Viajes.IdViaje",
            name="FK_DocumentosViajes_Viajes_IdViaje"
        ),
        nullable=False
    )

    IdCategoriaDocumento: Mapped[int] = mapped_column(
        ForeignKey(
            "CategoriasDocumentos.IdCategoriaDocumento",
            name="FK_DocumentosViajes_CategoriasDocumentos_IdCategoriaDocumento"
        ),
        nullable=False
    )

    IdUsuarioSubida: Mapped[int] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_DocumentosViajes_Usuarios_IdUsuario"
        ),
        nullable=False
    )

    NombreArchivo: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    UrlArchivo: Mapped[str] = mapped_column(
        String(500),
        nullable=False
    )

    FechaSubida: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    Viaje = relationship(
        "Viaje",
        back_populates="Documentos"
    )

    CategoriaDocumentoRelacion = relationship(
        "CategoriaDocumento",
        back_populates="Documentos"
    )

    UsuarioSubida = relationship(
        "Usuario",
        back_populates="DocumentosSubidos"
    )