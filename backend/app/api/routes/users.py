from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCurrentRead, UsuarioRead

router = APIRouter()


"""def get_current_user(db: Session = Depends(get_db)) -> Usuario:
    usuario_actual = db.scalar(
        select(Usuario).where(
            Usuario.NombreUsuario == "luciano",
            Usuario.Activo.is_(True)
        )
    )

    if usuario_actual:
        return usuario_actual

    return db.scalar(
        select(Usuario)
        .where(Usuario.Activo.is_(True))
        .order_by(Usuario.NombreUsuario)
    )"""

@router.get("/me", response_model=UsuarioCurrentRead)
def get_me(current_user: Usuario = Depends(get_current_user)) -> UsuarioCurrentRead:
    return UsuarioCurrentRead(
        id=current_user.IdUsuario,
        nombreUsuario=current_user.NombreUsuario,
        nombreCompleto=f"{current_user.Nombre} {current_user.Apellido}",
        email=current_user.Email,
        fotoUrl=current_user.FotoUrl,
        consienteNotificacionesEmail=current_user.ConsienteNotificacionesEmail,
        recibeEmailsNuevaVotacion=current_user.RecibeEmailsNuevaVotacion,
        recibeEmailsCambiosViaje=current_user.RecibeEmailsCambiosViaje,
        recibeEmailsRecordatoriosDeuda=current_user.RecibeEmailsRecordatoriosDeuda,
        recibeEmailsRecordatoriosReserva=current_user.RecibeEmailsRecordatoriosReserva,
    )


@router.get("/", response_model=list[UsuarioRead])
def list_users(
    q: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),  # requiere auth
) -> list[UsuarioRead]:
    query = select(Usuario).where(Usuario.Activo.is_(True))

    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                Usuario.Nombre.ilike(pattern),
                Usuario.Apellido.ilike(pattern),
                Usuario.NombreUsuario.ilike(pattern),
                Usuario.Email.ilike(pattern),
            )
        )

    usuarios = db.scalars(query.order_by(Usuario.NombreUsuario).limit(limit)).all()

    return [
        UsuarioRead(
            id=usuario.IdUsuario,
            nombreUsuario=usuario.NombreUsuario,
            nombreCompleto=f"{usuario.Nombre} {usuario.Apellido}",
            email=usuario.Email,
            fotoUrl=usuario.FotoUrl,
        )
        for usuario in usuarios
    ]
