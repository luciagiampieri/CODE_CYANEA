from datetime import datetime

from sqlalchemy import String, ForeignKey, DateTime, func, Boolean, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

responsables_checklist = Table(
    "ResponsablesChecklist",
    Base.metadata,
    Column(
        "IdChecklist",
        ForeignKey(
            "Checklists.IdChecklist",
            name="FK_ResponsablesChecklist_Checklists",
            ondelete="CASCADE"
        ),
        primary_key=True,
    ),
    Column(
        "IdUsuario",
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_ResponsablesChecklist_Usuarios",
            ondelete="CASCADE"
        ),
        primary_key=True,
    ),
)


# Documentos subidos desde una tarea de compra o reserva (las entradas, el pasaje,
# la confirmación de la reserva o el comprobante de pago). Si se elimina la tarea
# los documentos siguen en el viaje; si se elimina un documento se quita el vínculo.
documentos_checklist = Table(
    "DocumentosChecklists",
    Base.metadata,
    Column(
        "IdChecklist",
        ForeignKey(
            "Checklists.IdChecklist",
            name="FK_DocumentosChecklists_Checklists",
            ondelete="CASCADE",
        ),
        primary_key=True,
    ),
    Column(
        "IdDocumento",
        ForeignKey(
            "DocumentosViajes.IdDocumento",
            name="FK_DocumentosChecklists_DocumentosViajes",
            ondelete="CASCADE",
        ),
        primary_key=True,
        index=True,
    ),
)


class Checklist(Base):
    __tablename__ = "Checklists"

    IdChecklist: Mapped[int] = mapped_column(
        primary_key=True
    )

    IdViaje: Mapped[int] = mapped_column(
        ForeignKey(
            "Viajes.IdViaje",
            name="FK_Checklists_Viajes_IdViaje"
        ),
        nullable=False
    )

    IdUsuarioCreador: Mapped[int] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_Checklists_Usuarios_IdUsuario"
        ),
        nullable=False
    )

    Nombre: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    IdCategoriaChecklist: Mapped[int] = mapped_column(
        ForeignKey("CategoriasChecklist.IdCategoriaChecklist", name="FK_Checklists_CategoriasChecklist"),
        nullable=False
    )

    Completada: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false"
    )

    # Quién la marcó como hecha ("Hecha por Lucía"). Se limpia al desmarcarla.
    IdUsuarioCompletada: Mapped[int | None] = mapped_column(
        ForeignKey(
            "Usuarios.IdUsuario",
            name="FK_Checklists_Usuarios_IdUsuarioCompletada",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    # Tarea privada ("Solo para mí"): la ve solo quien la creó, que es su único
    # responsable; no cuenta en el progreso del grupo ni genera avisos.
    EsPrivada: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # Tarea creada con "Recordármelo" desde una recomendación de entradas o reservas:
    # enlace oficial para comprar o reservar, actividad vinculada y lugar de Google
    # Places para el que se creó (si la actividad cambia de lugar, la tarea pendiente
    # se elimina). Si se borra la actividad, una tarea ya hecha se conserva sin vínculo.
    Enlace: Mapped[str | None] = mapped_column(String(500), nullable=True)

    IdActividad: Mapped[int | None] = mapped_column(
        ForeignKey(
            "ActividadesItinerario.IdActividad",
            name="FK_Checklists_ActividadesItinerario",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    GooglePlaceIdEntradas: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Ya se le sugirió subir las entradas o la reserva al marcarla como hecha: la
    # sugerencia se muestra una sola vez por tarea (para todo el grupo).
    SugerenciaDocumentoMostrada: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    CategoriaChecklist = relationship("CategoriasChecklist", foreign_keys=[IdCategoriaChecklist])
    Viaje = relationship("Viaje", foreign_keys=[IdViaje])
    UsuarioCreador = relationship("Usuario", foreign_keys=[IdUsuarioCreador])
    UsuarioCompletada = relationship("Usuario", foreign_keys=[IdUsuarioCompletada])
    Actividad = relationship("ActividadItinerario", foreign_keys=[IdActividad])
    Responsables = relationship("Usuario", secondary=responsables_checklist)
    Documentos = relationship(
        "DocumentoViaje",
        secondary=documentos_checklist,
        back_populates="Checklists",
        order_by="DocumentoViaje.FechaSubida",
    )
