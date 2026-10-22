import math
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps_backoffice import require_admin_sistema
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.backoffice_categoria import (
    CategoriaBackofficeCreate,
    CategoriaBackofficeEstado,
    CategoriaBackofficeRead,
    CategoriaBackofficeUpdate,
    CategoriasBackofficeListado,
    TipoCategoria,
)
from app.schemas.backoffice_metricas import MetricasDashboard
from app.schemas.backoffice_monitoreo_ia import (
    EstadoUmbralCostoIA,
    MonitoreoIA,
    UmbralCostoIAUpdate,
)
from app.schemas.backoffice_usuario import (
    EstadoCuenta,
    PlanUsuario,
    UsuarioBackofficeDetalle,
    UsuarioBackofficePagina,
)
from app.services.backoffice import auth_service as bo
from app.services.backoffice import categorias_service
from app.services.backoffice import metricas_service
from app.services.backoffice import monitoreo_ia_service
from app.services.mail import get_mail_service
from app.services.mail.service import MailService
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
    desde: date | None = None,
    hasta: date | None = None,
    pagina: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
) -> UsuarioBackofficePagina:
    if desde and hasta and hasta < desde:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La fecha de fin no puede ser anterior a la fecha de inicio.",
        )
    return usuarios_service.buscar_usuarios(
        db, q, estado, plan, metodoRegistro, pagina, desde=desde, hasta=hasta
    )


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


@router.get("/metricas", response_model=MetricasDashboard)
def metricas_backoffice(
    desde: date | None = None,
    hasta: date | None = None,
    historico: bool = False,
    db: Session = Depends(get_db),
) -> MetricasDashboard:
    if historico:
        desde, hasta = metricas_service.rango_historico(db)
    else:
        try:
            desde, hasta = metricas_service.resolver_rango(desde, hasta)
        except metricas_service.RangoInvalido as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(error),
            )
    return metricas_service.obtener_metricas(db, desde, hasta, historico=historico)


def _error_categoria(error: categorias_service.CategoriaError) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail=error.mensaje,
        headers={"X-Error-Code": error.codigo},
    )


@router.get("/categorias", response_model=CategoriasBackofficeListado)
def listar_categorias_backoffice(db: Session = Depends(get_db)) -> CategoriasBackofficeListado:
    return categorias_service.listar(db)


@router.post(
    "/categorias",
    response_model=CategoriaBackofficeRead,
    status_code=status.HTTP_201_CREATED,
)
def crear_categoria_backoffice(
    payload: CategoriaBackofficeCreate,
    db: Session = Depends(get_db),
) -> CategoriaBackofficeRead:
    try:
        return categorias_service.crear(db, payload.tipo, payload.nombre, payload.icono)
    except categorias_service.CategoriaError as error:
        raise _error_categoria(error)


@router.put("/categorias/{tipo}/{id_categoria}", response_model=CategoriaBackofficeRead)
def actualizar_categoria_backoffice(
    tipo: TipoCategoria,
    id_categoria: int,
    payload: CategoriaBackofficeUpdate,
    db: Session = Depends(get_db),
) -> CategoriaBackofficeRead:
    try:
        return categorias_service.actualizar(db, tipo, id_categoria, payload.nombre, payload.icono)
    except categorias_service.CategoriaError as error:
        raise _error_categoria(error)


@router.patch("/categorias/{tipo}/{id_categoria}/estado", response_model=CategoriaBackofficeRead)
def cambiar_estado_categoria_backoffice(
    tipo: TipoCategoria,
    id_categoria: int,
    payload: CategoriaBackofficeEstado,
    db: Session = Depends(get_db),
) -> CategoriaBackofficeRead:
    try:
        return categorias_service.cambiar_estado(db, tipo, id_categoria, payload.activa)
    except categorias_service.CategoriaError as error:
        raise _error_categoria(error)


@router.delete("/categorias/{tipo}/{id_categoria}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_categoria_backoffice(
    tipo: TipoCategoria,
    id_categoria: int,
    db: Session = Depends(get_db),
) -> None:
    try:
        categorias_service.eliminar(db, tipo, id_categoria)
    except categorias_service.CategoriaError as error:
        raise _error_categoria(error)



@router.get("/monitoreo-ia", response_model=MonitoreoIA)
def monitoreo_ia_backoffice(
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
) -> MonitoreoIA:
    try:
        desde, hasta = metricas_service.resolver_rango(desde, hasta)
    except metricas_service.RangoInvalido as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        )
    return monitoreo_ia_service.obtener_monitoreo(db, desde, hasta)


@router.put("/monitoreo-ia/umbral", response_model=EstadoUmbralCostoIA)
def configurar_umbral_monitoreo_ia(
    payload: UmbralCostoIAUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin_sistema),
    mail_service: MailService = Depends(get_mail_service),
) -> EstadoUmbralCostoIA:
    return monitoreo_ia_service.configurar_umbral(
        db, payload.umbralMensualUSD, usuario.IdUsuario, mail_service
    )
