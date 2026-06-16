from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioRead


router = APIRouter()


def get_current_user(db: Session = Depends(get_db)) -> Usuario:
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
    )


@router.get("/me", response_model=UsuarioRead)
def get_me(db: Session = Depends(get_db)) -> UsuarioRead:
    usuario = get_current_user(db)
    if usuario is None:
        raise HTTPException(status_code=404, detail="No hay usuarios activos disponibles")

    return UsuarioRead(
        id=usuario.IdUsuario,
        nombreUsuario=usuario.NombreUsuario,
        nombreCompleto=f"{usuario.Nombre} {usuario.Apellido}",
        email=usuario.Email,
        fotoUrl=usuario.FotoUrl,
    )


@router.get("/", response_model=list[UsuarioRead])
def list_users(
    q: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
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
