from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.legal import EstadoAceptacionTerminos, TerminosCondicionesRead
from app.services import terminos_service


router = APIRouter()

def _error_terminos(error: terminos_service.TerminosError) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail=error.mensaje,
        headers={"X-Error-Code": error.codigo},
    )


@router.get("/terms", response_model=TerminosCondicionesRead)
def get_terms(db: Session = Depends(get_db)) -> TerminosCondicionesRead:
    try:
        vigente = terminos_service.obtener_vigente(db)
    except terminos_service.TerminosError as error:
        raise _error_terminos(error)
    return TerminosCondicionesRead(
        version=vigente.Numero,
        titulo=vigente.Titulo,
        contenido=terminos_service.contenido_a_parrafos(vigente.Contenido),
    )


@router.get("/terms/acceptance", response_model=EstadoAceptacionTerminos)
def get_terms_acceptance(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> EstadoAceptacionTerminos:
    try:
        return terminos_service.estado_aceptacion(db, current_user)
    except terminos_service.TerminosError as error:
        raise _error_terminos(error)


@router.post("/terms/accept", response_model=EstadoAceptacionTerminos)
def accept_terms(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> EstadoAceptacionTerminos:
    try:
        return terminos_service.aceptar_vigente(db, current_user)
    except terminos_service.TerminosError as error:
        raise _error_terminos(error)