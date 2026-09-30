"""Tipos compartidos del escaneo de comprobantes con IA (US 93).

- `ReceiptScanError`: error con mensaje apto para el usuario, status HTTP y
  código (`X-Error-Code`) para que el frontend decida qué ofrecer.
- `ExtraccionComprobanteIA`: esquema estructurado que debe cumplir la
  respuesta del servicio de IA antes de usarse (RNF-32).
- `ReceiptExtractor`: contrato que implementa cada proveedor, para poder
  reemplazarlo por configuración sin tocar la lógica de negocio (RNF-37).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict

# Códigos que viajan en el header X-Error-Code.
AI_CONSENT_REQUIRED = "AI_CONSENT_REQUIRED"
RECEIPT_INVALID_FORMAT = "RECEIPT_INVALID_FORMAT"
RECEIPT_TOO_LARGE = "RECEIPT_TOO_LARGE"
RECEIPT_NOT_RECOGNIZED = "RECEIPT_NOT_RECOGNIZED"
AI_UNAVAILABLE = "AI_UNAVAILABLE"
AI_TIMEOUT = "AI_TIMEOUT"
AI_RATE_LIMITED = "AI_RATE_LIMITED"
AI_INVALID_RESPONSE = "AI_INVALID_RESPONSE"

MENSAJE_NO_DISPONIBLE = (
    "El servicio de inteligencia artificial no está disponible en este momento. "
    "Podés cargar el gasto manualmente."
)
MENSAJE_TIEMPO_AGOTADO = (
    "El servicio de inteligencia artificial tardó demasiado en responder. "
    "Podés intentar nuevamente o cargar el gasto manualmente."
)
MENSAJE_RESPUESTA_INVALIDA = (
    "No se pudo interpretar la respuesta del servicio de inteligencia artificial. "
    "Podés intentar nuevamente o cargar el gasto manualmente."
)
MENSAJE_NO_RECONOCIDO = (
    "La imagen no corresponde a un comprobante de pago o no se puede leer. "
    "Probá con otra foto o cargá el gasto manualmente."
)
MENSAJE_LIMITE_USO = (
    "Se alcanzó el límite de uso del servicio de inteligencia artificial. "
    "Intentá más tarde o cargá el gasto manualmente."
)


class ReceiptScanError(Exception):
    """Error del escaneo. `message` es apto para mostrar al usuario."""

    def __init__(self, message: str, status_code: int, code: str):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


NivelConfianza = Literal["alta", "baja"]


class ConfianzaCampos(BaseModel):
    model_config = ConfigDict(extra="ignore")

    monto_total: NivelConfianza
    fecha: NivelConfianza
    comercio: NivelConfianza
    moneda: NivelConfianza
    categoria: NivelConfianza


class ExtraccionComprobanteIA(BaseModel):
    """Respuesta cruda del modelo, ya validada contra el esquema.

    Los tipos son estrictos (si el modelo devuelve otra estructura, se
    rechaza); los *valores* se revisan después con las reglas de negocio, para
    que un dato dudoso deje el campo vacío en vez de fallar todo el escaneo.
    """

    model_config = ConfigDict(extra="ignore")

    es_comprobante: bool
    legible: bool
    monto_total: Decimal | None
    fecha: str | None
    comercio: str | None
    moneda: str | None
    moneda_explicita: bool
    categoria: str | None
    confianza: ConfianzaCampos


class ReceiptExtractor(Protocol):
    """Contrato de un proveedor de IA para leer comprobantes.

    Recibe solo la imagen y los nombres de las categorías: ningún dato de los
    participantes del viaje sale del sistema (RNF-33). Devuelve el JSON crudo
    del proveedor; la validación la hace `procesar_respuesta` para todos por
    igual.
    """

    nombre: str

    async def extraer(self, imagen: bytes, mime_type: str, categorias: list[str]) -> dict: ...
