"""Escaneo de comprobantes con IA (US 93).

El proveedor se elige por configuración (`AI_RECEIPT_PROVIDER`), sin tocar la
lógica de negocio (RNF-37). `get_receipt_extractor` se usa como dependencia
de FastAPI, así los tests la reemplazan y nunca llaman al servicio real.
"""

from app.core.config import settings
from app.services.receipt_ai.base import ReceiptExtractor, ReceiptScanError
from app.services.receipt_ai.gemini import GeminiReceiptExtractor
from app.services.receipt_ai.mock import MockReceiptExtractor
from app.services.receipt_ai.processing import (
    MAX_RECEIPT_BYTES,
    ResultadoEscaneo,
    construir_resultado,
    validar_esquema,
    validar_imagen,
)


def get_receipt_extractor() -> ReceiptExtractor:
    proveedor = (settings.ai_receipt_provider or "").strip().lower()
    if proveedor == "mock":
        return MockReceiptExtractor()
    return GeminiReceiptExtractor(
        api_key=settings.gemini_api_key,
        model=settings.ai_receipt_model,
        fallback_model=settings.ai_receipt_fallback_model,
        timeout_seconds=settings.ai_receipt_timeout_seconds,
    )


__all__ = [
    "MAX_RECEIPT_BYTES",
    "GeminiReceiptExtractor",
    "MockReceiptExtractor",
    "ReceiptExtractor",
    "ReceiptScanError",
    "ResultadoEscaneo",
    "construir_resultado",
    "get_receipt_extractor",
    "validar_esquema",
    "validar_imagen",
]
