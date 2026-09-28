from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RecordatorioActividadNotificado(Base):
    __tablename__ = "RecordatoriosActividadesNotificados"
    __table_args__ = (
        UniqueConstraint(
            "IdActividad",
            "Tipo",
            "MinutosAntes",
            name="UX_RecordatoriosActividadesNotificados_Actividad_Tipo_Minutos",
        ),
    )

    IdRecordatorioActividadNotificado: Mapped[int] = mapped_column(primary_key=True)
    IdActividad: Mapped[int] = mapped_column(
        ForeignKey(
            "ActividadesItinerario.IdActividad",
            name="FK_RecordatoriosActNotif_ActividadesItinerario_IdActividad",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    Tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    MinutosAntes: Mapped[int] = mapped_column(Integer, nullable=False)
    FechaNotificacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    Actividad = relationship("ActividadItinerario")
