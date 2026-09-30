from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TokenRecuperacionPassword(Base):
    __tablename__ = "TokensRecuperacionPassword"

    IdTokenRecuperacion: Mapped[int] = mapped_column(primary_key=True)

    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_TokensRecuperacionPassword_Usuarios_IdUsuario",
        ),
        nullable=False,
        index=True,
    )

    TokenHash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    FechaExpiracion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    FechaUso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    FechaInvalidacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class SolicitudRecuperacionPassword(Base):
    __tablename__ = "SolicitudesRecuperacionPassword"

    IdSolicitud: Mapped[int] = mapped_column(primary_key=True)

    IdUsuario: Mapped[int | None] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_SolicitudesRecuperacionPassword_Usuarios_IdUsuario",
        ),
        nullable=True,
    )

    EmailHash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    Ip: Mapped[str | None] = mapped_column(String(45), nullable=True, index=True)

    Tipo: Mapped[str] = mapped_column(String(30), nullable=False)

    Fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )