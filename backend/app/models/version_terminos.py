from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

ESTADO_BORRADOR = "borrador"
ESTADO_VIGENTE = "vigente"
ESTADO_HISTORICA = "historica"


class VersionTerminos(Base):
    __tablename__ = "VersionesTerminos"
    __table_args__ = (
        Index(
            "UX_VersionesTerminos_Vigente",
            "Estado",
            unique=True,
            postgresql_where=text("\"Estado\" = 'vigente'"),
            sqlite_where=text("\"Estado\" = 'vigente'"),
        ),
    )

    IdVersionTerminos: Mapped[int] = mapped_column(primary_key=True)
    Numero: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    Titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    Contenido: Mapped[str] = mapped_column(Text, nullable=False)
    Estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ESTADO_BORRADOR, server_default=ESTADO_BORRADOR
    )
    FechaCreacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    FechaPublicacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    IdAdministradorCreacion: Mapped[int | None] = mapped_column(
        ForeignKey("Usuarios.IdUsuario"), nullable=True
    )
    IdAdministradorPublicacion: Mapped[int | None] = mapped_column(
        ForeignKey("Usuarios.IdUsuario"), nullable=True
    )