import math

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps_backoffice import require_admin_sistema
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.backoffice_usuario import (
    EstadoCuenta,
    PlanUsuario,
    UsuarioBackofficeDetalle,
    UsuarioBackofficePagina,
)
from app.services.backoffice import auth_service as bo
from app.services.backoffice import usuarios_service

router_publico = APIRouter()

router = APIRouter(dependencies=[Depends(require_admin_sistema)])


class AdminSistemaRead(BaseModel):
    id: int
    nombreCompleto: str
    email: str


@router_publico.post("/auth/login", response_model=TokenResponse)
def login_backoffice(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    try:
        token = bo.iniciar_sesion(
            db,
            payload.email,
            payload.password,
            request.client.host if request.client else None,
            request.headers.get("user-agent"),
        )
    except bo.CredencialesInvalidas:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=bo.MENSAJE_GENERICO,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except bo.AccesoBloqueado as e:
        segundos = max(1, math.ceil((e.hasta - bo.ahora()).total_seconds()))
        minutos = math.ceil(segundos / 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Demasiados intentos fallidos. Intentá nuevamente en {minutos} minutos.",
            headers={"Retry-After": str(segundos)},
        )
    return TokenResponse(access_token=token)


@router.get("/auth/me", response_model=AdminSistemaRead)
def me_backoffice(
    usuario: Usuario = Depends(require_admin_sistema),
) -> AdminSistemaRead:
    return AdminSistemaRead(
        id=usuario.IdUsuario,
        nombreCompleto=f"{usuario.Nombre} {usuario.Apellido}",
        email=usuario.Email,
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_backoffice(request: Request, db: Session = Depends(get_db)) -> None:
    bo.cerrar_sesion(db, request.state.sesion_backoffice)


@router.get("/usuarios", response_model=UsuarioBackofficePagina)
def listar_usuarios_backoffice(
    q: str | None = Query(default=None, max_length=100),
    estado: EstadoCuenta | None = None,
    plan: PlanUsuario | None = None,
    metodoRegistro: str | None = Query(default=None, max_length=30),
    pagina: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
) -> UsuarioBackofficePagina:
    return usuarios_service.buscar_usuarios(db, q, estado, plan, metodoRegistro, pagina)


@router.get("/usuarios/{id_usuario}", response_model=UsuarioBackofficeDetalle)
def detalle_usuario_backoffice(
    id_usuario: int,
    db: Session = Depends(get_db),
) -> UsuarioBackofficeDetalle:
    detalle = usuarios_service.obtener_detalle(db, id_usuario)
    if detalle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )
    return detalle