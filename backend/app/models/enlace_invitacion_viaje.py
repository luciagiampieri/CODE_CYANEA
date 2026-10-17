from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EnlaceInvitacionViaje(Base):
    __tablename__ = "EnlacesInvitacionViajes"

    IdEnlaceInvitacionViaje: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(ForeignKey("Viajes.IdViaje"), unique=True)
    TokenEnlace: Mapped[str] = mapped_column(String(120), unique=True)
    IdUsuarioCreador: Mapped[int] = mapped_column(ForeignKey("Usuarios.IdUsuario"))
    FechaCreacion: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    FechaVencimiento: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    FechaRevocacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
