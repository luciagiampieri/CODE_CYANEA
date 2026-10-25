from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

PLAN_GRATUITO = 1
PLAN_PRO = 2


class Plan(Base):
    __tablename__ = "Planes"
    __table_args__ = (
        CheckConstraint('"MaxParticipantesViaje" > 0', name="CK_Planes_CupoPositivo"),
        CheckConstraint(
            '"PrecioMensualARS" IS NULL OR "PrecioMensualARS" > 0',
            name="CK_Planes_PrecioMensualARS",
        ),
        CheckConstraint(
            '"PrecioAnualARS" IS NULL OR "PrecioAnualARS" > 0', name="CK_Planes_PrecioAnualARS"
        ),
    )

    IdPlan: Mapped[int] = mapped_column(primary_key=True)
    Nombre: Mapped[str] = mapped_column(String(30), unique=True)
    MaxParticipantesViaje: Mapped[int | None] = mapped_column(Integer, nullable=True)
    MaxViajesActivos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    MaxSugerenciasDiarias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    MaxEscaneosMensuales: Mapped[int | None] = mapped_column(Integer, nullable=True)
    PrecioMensualARS: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    PrecioAnualARS: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    MaxAlmacenamientoMb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    Activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
