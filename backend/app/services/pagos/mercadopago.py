import hashlib
import hmac
import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Estado de cada cobro en Cyanea (tabla EstadosPagosSuscripciones).
PAGO_APROBADO = "aprobado"
PAGO_RECHAZADO = "rechazado"
PAGO_PENDIENTE = "pendiente"

_ESTADOS_PAGO_RECHAZADO = {"rejected", "cancelled", "refunded", "charged_back"}


class PasarelaNoConfigurada(Exception):
    """Falta MERCADOPAGO_ACCESS_TOKEN."""


class ErrorPasarela(Exception):
    """Mercado Pago no respondió o respondió con error."""


@dataclass(slots=True)
class SuscripcionPasarela:
    id: str
    estado: str
    url_pago: str | None
    referencia_externa: str | None


@dataclass(slots=True)
class CobroPasarela:
    id: str
    id_suscripcion: str | None
    estado: str  # aprobado | rechazado | pendiente
    monto: Decimal | None
    fecha: datetime | None


class ClientePasarela(Protocol):
    async def crear_suscripcion(self, **kwargs) -> SuscripcionPasarela: ...

    async def obtener_suscripcion(self, id_suscripcion: str) -> SuscripcionPasarela: ...

    async def cancelar_suscripcion(self, id_suscripcion: str) -> None: ...

    async def obtener_cobro(self, id_cobro: str) -> CobroPasarela: ...

    async def listar_cobros(self, id_suscripcion: str) -> list[CobroPasarela]: ...


def _fecha(valor: Any) -> datetime | None:
    if not valor:
        return None
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        return None


def _monto(valor: Any) -> Decimal | None:
    if valor is None:
        return None
    try:
        monto = Decimal(str(valor))
    except ArithmeticError:
        return None
    return monto if monto > 0 else None


def estado_cobro(datos: dict) -> str:
    """Traduce un cobro de Mercado Pago (authorized_payment) al estado de Cyanea.

    Manda el estado del pago asociado; si todavía no hay pago, el del cobro:
    `recycling` significa que fue rechazado y Mercado Pago lo reintentará.
    """
    pago = datos.get("payment") or {}
    estado_pago = (pago.get("status") or "").lower()
    if estado_pago == "approved":
        return PAGO_APROBADO
    if estado_pago in _ESTADOS_PAGO_RECHAZADO:
        return PAGO_RECHAZADO
    if not estado_pago and (datos.get("status") or "").lower() in {"recycling", "cancelled"}:
        return PAGO_RECHAZADO
    return PAGO_PENDIENTE


def cobro_desde_api(datos: dict) -> CobroPasarela:
    return CobroPasarela(
        id=str(datos["id"]),
        id_suscripcion=str(datos["preapproval_id"]) if datos.get("preapproval_id") else None,
        estado=estado_cobro(datos),
        monto=_monto(datos.get("transaction_amount")),
        fecha=_fecha(datos.get("last_modified") or datos.get("date_created")),
    )


def suscripcion_desde_api(datos: dict) -> SuscripcionPasarela:
    return SuscripcionPasarela(
        id=str(datos["id"]),
        estado=(datos.get("status") or "").lower(),
        url_pago=datos.get("init_point"),
        referencia_externa=datos.get("external_reference"),
    )


class MercadoPagoClient:
    def __init__(self, access_token: str | None = None, base_url: str | None = None):
        self.access_token = access_token or settings.mercadopago_access_token
        self.base_url = (base_url or settings.mercadopago_api_url).rstrip("/")

    async def _request(self, metodo: str, ruta: str, **kwargs) -> dict:
        if not self.access_token:
            raise PasarelaNoConfigurada()
        headers = {"Authorization": f"Bearer {self.access_token}"}
        try:
            async with httpx.AsyncClient(timeout=settings.mercadopago_timeout_seconds) as client:
                respuesta = await client.request(
                    metodo, f"{self.base_url}{ruta}", headers=headers, **kwargs
                )
        except httpx.HTTPError as error:
            raise ErrorPasarela(f"No se pudo contactar a Mercado Pago: {error}") from error
        if respuesta.status_code >= 400:
            # No se registra el cuerpo completo: puede incluir datos del pagador.
            logger.warning(
                "Mercado Pago respondió con error",
                extra={"status": respuesta.status_code, "ruta": ruta},
            )
            raise ErrorPasarela(f"Mercado Pago respondió {respuesta.status_code}")
        return respuesta.json()

    async def crear_suscripcion(
        self,
        *,
        motivo: str,
        referencia_externa: str,
        email_pagador: str,
        meses: int,
        monto: Decimal,
        url_retorno: str,
    ) -> SuscripcionPasarela:
        datos = await self._request(
            "POST",
            "/preapproval",
            json={
                "reason": motivo,
                "external_reference": referencia_externa,
                "payer_email": email_pagador,
                "auto_recurring": {
                    "frequency": meses,
                    "frequency_type": "months",
                    "transaction_amount": float(monto),
                    "currency_id": "ARS",
                },
                "back_url": url_retorno,
                "status": "pending",
            },
        )
        return suscripcion_desde_api(datos)

    async def obtener_suscripcion(self, id_suscripcion: str) -> SuscripcionPasarela:
        return suscripcion_desde_api(await self._request("GET", f"/preapproval/{id_suscripcion}"))

    async def cancelar_suscripcion(self, id_suscripcion: str) -> None:
        await self._request("PUT", f"/preapproval/{id_suscripcion}", json={"status": "cancelled"})

    async def obtener_cobro(self, id_cobro: str) -> CobroPasarela:
        return cobro_desde_api(await self._request("GET", f"/authorized_payments/{id_cobro}"))

    async def listar_cobros(self, id_suscripcion: str) -> list[CobroPasarela]:
        datos = await self._request(
            "GET", "/authorized_payments/search", params={"preapproval_id": id_suscripcion}
        )
        return [cobro_desde_api(item) for item in datos.get("results") or []]


def get_cliente_pasarela() -> ClientePasarela:
    """Dependencia de FastAPI; los tests la reemplazan por un cliente falso."""
    return MercadoPagoClient()


def firma_valida(
    *,
    x_signature: str | None,
    x_request_id: str | None,
    data_id: str | None,
    secreto: str,
) -> bool:
    """Valida el header x-signature igual que el SDK oficial de Mercado Pago."""
    if not x_signature:
        return False
    ts, recibido = None, None
    for parte in x_signature.split(","):
        clave, _, valor = parte.partition("=")
        clave, valor = clave.strip().lower(), valor.strip()
        if clave == "ts":
            ts = valor
        elif clave == "v1":
            recibido = valor
    if not ts or not recibido:
        return False
    partes = []
    if data_id:
        partes.append(f"id:{data_id}")
    if x_request_id:
        partes.append(f"request-id:{x_request_id}")
    partes.append(f"ts:{ts}")
    manifiesto = ";".join(partes) + ";"
    calculado = hmac.new(
        secreto.encode("utf-8"), manifiesto.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(calculado, recibido)
