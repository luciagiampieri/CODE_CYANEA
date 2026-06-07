from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EstadoInvitacion(Base):
    __tablename__ = "EstadosInvitaciones"

    IdEstadoInvitacion: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    Descripcion: Mapped[str | None] = mapped_column(String(200), nullable=True)
    Activo: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")

    Invitaciones = relationship("InvitacionViaje", back_populates="EstadoInvitacion")
