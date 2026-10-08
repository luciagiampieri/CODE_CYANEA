from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_backoffice_token
from app.db.session import get_db
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.sesion_backoffice import SesionBackoffice
from app.models.usuario import Usuario
from app.services.backoffice import auth_service as bo

_bearer_backoffice = HTTPBearer(auto_error=False)


def require_admin_sistema(
    request: Request,
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer_backoffice),
    db: Session = Depends(get_db),
) -> Usuario:
    no_autenticado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="La sesión no es válida o expiró.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credenciales is None:
        raise no_autenticado

    try:
        payload = decode_backoffice_token(credenciales.credentials)
    except JWTError:
        raise no_autenticado

    sesion = db.get(SesionBackoffice, payload.get("sid"))
    if sesion is None or sesion.FechaCierre is not None:
        raise no_autenticado

    if bo.ahora() - bo.a_utc(sesion.UltimaActividad) > bo.INACTIVIDAD_MAXIMA:
        sesion.FechaCierre = bo.ahora()
        db.commit()
        raise no_autenticado

    usuario = db.get(Usuario, sesion.IdUsuario)
    if (
        usuario is None
        or not usuario.Activo
        or usuario.IdRolSistema != ROL_ADMIN_SISTEMA
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso no autorizado.",
        )

    sesion.UltimaActividad = bo.ahora()
    db.commit()
    request.state.sesion_backoffice = sesion
    return usuario