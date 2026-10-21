from sqlalchemy import Boolean, CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

PLAN_GRATUITO = 1
PLAN_PRO = 2


class Plan(Base):
    __tablename__ = "Planes"
    __table_args__ = (
        CheckConstraint('"MaxParticipantesViaje" > 0', name="CK_Planes_CupoPositivo"),
    )

    IdPlan: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), unique=True)
    MaxParticipantesViaje: Mapped[int | None] = mapped_column(Integer, nullable=True)
    MaxViajesActivos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    MaxSugerenciasDiarias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    MaxEscaneosSemanales: Mapped[int | None] = mapped_column(Integer, nullable=True)
    MaxAlmacenamientoMb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    Activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")