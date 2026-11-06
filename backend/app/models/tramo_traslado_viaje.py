from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, false, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# Ids fijos: los usan los índices parciales de `TramosTrasladosViajes`.
TIPO_TRAMO_IDA = 1
TIPO_TRAMO_ENTRE_DESTINOS = 2
TIPO_TRAMO_REGRESO = 3


class TipoTramoTraslado(Base):
    __tablename__ = "TiposTramosTraslados"

    IdTipoTramoTraslado: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    Nombre: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    Activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TramoTrasladoViaje(Base):
    """Tramo del recorrido con algo para recordar: un traslado agendado o la tarjeta oculta.

    Un tramo sin agendar ni ocultar no tiene fila: se deriva del recorrido. El traslado
    se identifica por el tramo y no por el día; su actividad apunta a esta fila con
    `ActividadItinerario.IdTramoTraslado`.
    """

    __tablename__ = "TramosTrasladosViajes"
    __table_args__ = (
        CheckConstraint(
            '("IdTipoTramoTraslado" = 2 AND "IdDestinoOrigen" IS NOT NULL AND "IdDestinoLlegada" IS NOT NULL)'
            ' OR ("IdTipoTramoTraslado" <> 2 AND "IdDestinoOrigen" IS NULL AND "IdDestinoLlegada" IS NULL)',
            name="CK_TramosTrasladosViajes_Destinos",
        ),
        Index(
            "UX_TramosTrasladosViajes_Viaje_Tipo",
            "IdViaje",
            "IdTipoTramoTraslado",
            unique=True,
            postgresql_where=text('"IdTipoTramoTraslado" <> 2'),
            sqlite_where=text('"IdTipoTramoTraslado" <> 2'),
        ),
        Index(
            "UX_TramosTrasladosViajes_Viaje_Par",
            "IdViaje",
            "IdDestinoOrigen",
            "IdDestinoLlegada",
            unique=True,
            postgresql_where=text('"IdTipoTramoTraslado" = 2'),
            sqlite_where=text('"IdTipoTramoTraslado" = 2'),
        ),
    )

    IdTramoTraslado: Mapped[int] = mapped_column(primary_key=True)
    IdViaje: Mapped[int] = mapped_column(
        ForeignKey(
            "Viajes.IdViaje",
            name="FK_TramosTrasladosViajes_Viajes_IdViaje",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    IdTipoTramoTraslado: Mapped[int] = mapped_column(
        ForeignKey(
            "TiposTramosTraslados.IdTipoTramoTraslado",
            name="FK_TramosTrasladosViajes_TiposTramos_IdTipo",
        ),
        nullable=False,
    )
    # Solo en los tramos entre destinos. Apuntan al catálogo y no a `DestinosViajes`
    # para conservar el par aunque el destino salga del recorrido.
    IdDestinoOrigen: Mapped[int | None] = mapped_column(
        ForeignKey("Destinos.IdDestino", name="FK_TramosTrasladosViajes_Destinos_IdOrigen"),
        nullable=True,
    )
    IdDestinoLlegada: Mapped[int | None] = mapped_column(
        ForeignKey("Destinos.IdDestino", name="FK_TramosTrasladosViajes_Destinos_IdLlegada"),
        nullable=True,
    )
    Oculto: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    Viaje = relationship("Viaje", back_populates="TramosTraslados")
    DestinoOrigen = relationship("Destino", foreign_keys=[IdDestinoOrigen])
    DestinoLlegada = relationship("Destino", foreign_keys=[IdDestinoLlegada])
    Actividad = relationship(
        "ActividadItinerario", back_populates="TramoTraslado", uselist=False, passive_deletes=True
    )
