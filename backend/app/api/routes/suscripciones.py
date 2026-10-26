import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.suscripcion_pro import (
    EstadoSuscripcionRead,
    IniciarSuscripcionRequest,
    IniciarSuscripcionResponse,
    ResumenSuscripcionRead,
)
from app.services import suscripcion_pro
from app.services.mail import get_mail_service
from app.services.mail.service import MailService
from app.services.pagos.mercadopago import (
    ErrorPasarela,
    PasarelaNoConfigurada,
    firma_valida,
    get_cliente_pasarela,
)

logger = logging.getLogger(__name__)

router = APIRouter()
router_pagos = APIRouter()


def _http(error: suscripcion_pro.SuscripcionError) -> HTTPException:
    return HTTPException(error.status, error.mensaje, headers={"X-Error-Code": error.codigo})


@router.get("/me/suscripcion/resumen", response_model=ResumenSuscripcionRead)
async def resumen_suscripcion(
    response: Response,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    cliente=Depends(get_cliente_pasarela),
    mail_service: MailService = Depends(get_mail_service),
):
    response.headers["Cache-Control"] = "no-store"
    return await suscripcion_pro.resumen(db, current_user, cliente, mail_service)


@router.post("/me/suscripcion", response_model=IniciarSuscripcionResponse, status_code=201)
async def iniciar_suscripcion(
    payload: IniciarSuscripcionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    cliente=Depends(get_cliente_pasarela),
    mail_service: MailService = Depends(get_mail_service),
):
    try:
        return await suscripcion_pro.iniciar(
            db,
            current_user,
            modalidad=payload.modalidad,
            acepta_renovacion=payload.aceptaRenovacionAutomatica,
            cliente=cliente,
            mail_service=mail_service,
        )
    except suscripcion_pro.SuscripcionError as error:
        raise _http(error)


@router.get("/me/suscripcion/estado", response_model=EstadoSuscripcionRead)
async def estado_suscripcion(
    response: Response,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    cliente=Depends(get_cliente_pasarela),
    mail_service: MailService = Depends(get_mail_service),
):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await suscripcion_pro.estado_ultima(db, current_user, cliente, mail_service)
    except suscripcion_pro.SuscripcionError as error:
        raise _http(error)


@router_pagos.post("/mercadopago/webhook")
async def webhook_mercadopago(
    request: Request,
    db: Session = Depends(get_db),
    cliente=Depends(get_cliente_pasarela),
    mail_service: MailService = Depends(get_mail_service),
):
    try:
        cuerpo = await request.json()
    except Exception:
        cuerpo = {}
    if not isinstance(cuerpo, dict):
        cuerpo = {}
    params = request.query_params
    tipo = params.get("type") or params.get("topic") or cuerpo.get("type") or ""
    data_id = params.get("data.id") or params.get("id") or (cuerpo.get("data") or {}).get("id")
    data_id = str(data_id) if data_id is not None else None

    secreto = settings.mercadopago_webhook_secret
    if secreto and not firma_valida(
        x_signature=request.headers.get("x-signature"),
        x_request_id=request.headers.get("x-request-id"),
        data_id=params.get("data.id"),
        secreto=secreto,
    ):
        logger.warning("Webhook de Mercado Pago con firma inválida", extra={"tipo": tipo})
        raise HTTPException(401, "Firma inválida.")

    if not data_id:
        return {"recibido": True}
    try:
        await suscripcion_pro.procesar_notificacion(db, tipo, data_id, cliente, mail_service)
    except (PasarelaNoConfigurada, ErrorPasarela):
        # Mercado Pago reintenta la notificación si no recibe 200/201.
        logger.warning("No se pudo procesar el webhook de Mercado Pago", exc_info=True)
        raise HTTPException(503, "No se pudo consultar Mercado Pago.")
    return {"recibido": True}


@router_pagos.get("/mercadopago/retorno", include_in_schema=False)
def retorno_mercadopago(request: Request):
    """Mercado Pago exige una back_url https: esta ruta solo redirige a la app."""
    destino = settings.mercadopago_app_return_url
    consulta = urlencode(
        {
            clave: valor
            for clave, valor in request.query_params.items()
            if clave in {"preapproval_id", "external_reference", "status"}
        }
    )
    separador = "&" if "?" in destino else "?"
    return RedirectResponse(f"{destino}{separador}{consulta}" if consulta else destino, 302)
