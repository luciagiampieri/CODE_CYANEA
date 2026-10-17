from sqlalchemy import Boolean, CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Plan(Base):
    __tablename__ = "Planes"
    __table_args__ = (
        CheckConstraint('"MaxParticipantesViaje" > 0', name="CK_Planes_CupoPositivo"),
    )

    IdPlan: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), unique=True)
    MaxParticipantesViaje: Mapped[int] = mapped_column(Integer)
    Activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
