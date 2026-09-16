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
        String(60),
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

    FechaCreacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    CategoriaChecklist = relationship("CategoriasChecklist", foreign_keys=[IdCategoriaChecklist])
    Viaje = relationship("Viaje", foreign_keys=[IdViaje])
    UsuarioCreador = relationship("Usuario", foreign_keys=[IdUsuarioCreador])
    Responsables = relationship("Usuario", secondary=responsables_checklist)