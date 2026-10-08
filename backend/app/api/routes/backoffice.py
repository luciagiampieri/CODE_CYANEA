import math

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps_backoffice import require_admin_sistema
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.backoffice import auth_service as bo

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