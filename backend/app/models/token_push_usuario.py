from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TokenPushUsuario(Base):
    __tablename__ = "TokensPushUsuarios"

    IdTokenPushUsuario: Mapped[int] = mapped_column(primary_key=True)

    IdUsuario: Mapped[int] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_TokensPushUsuarios_Usuarios_IdUsuario",
        ),
        nullable=False,
    )

    Token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    Plataforma: Mapped[str] = mapped_column(String(20), nullable=False)
    DispositivoId: Mapped[str | None] = mapped_column(String(120), nullable=True)

    Activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    FechaAlta: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    FechaActualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    FechaBaja: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    Usuario = relationship("Usuario", back_populates="TokensPush")
