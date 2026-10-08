from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

ROL_VIAJERO = 1
ROL_ADMIN_SISTEMA = 2


class RolSistema(Base):
    __tablename__ = "RolesSistema"

    IdRolSistema: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)