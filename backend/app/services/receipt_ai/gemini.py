"""Proveedor Gemini (Google AI Studio) para leer comprobantes (US 93).

Se usa la API REST `generateContent` con salida estructurada
(`responseMimeType` + `responseJsonSchema`) mediante httpx, igual que la
portada con IA usa Cloudflare: no hace falta sumar el SDK de Google.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import time

import httpx

from app.services.receipt_ai.base import (
    AI_INVALID_RESPONSE,
    AI_RATE_LIMITED,
    AI_TIMEOUT,
    AI_UNAVAILABLE,
    MENSAJE_LIMITE_USO,
    MENSAJE_NO_DISPONIBLE,
    MENSAJE_NO_RECONOCIDO,
    MENSAJE_RESPUESTA_INVALIDA,
    MENSAJE_TIEMPO_AGOTADO,
    RECEIPT_NOT_RECOGNIZED,
    ReceiptScanError,
)
from app.services.receipt_ai.prompt import construir_esquema_json, construir_prompt

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _config_razonamiento(model: str) -> dict | None:
    """Baja el razonamiento al mínimo que admite cada familia: leer un ticket no
    lo necesita y así se reduce la latencia (RNF-34).

    - Gemini 2.5: se apaga con thinkingBudget = 0.
    - Gemini 3 y posteriores: se controla con thinkingLevel. Se usa "low"
      porque "minimal" no está soportado en todos (en 3.8 Flash da error).
    - Otras familias: se deja el valor por defecto del modelo.
    """
    nombre = model.lower().removeprefix("models/")
    if "2.5" in nombre:
        return {"thinkingBudget": 0}
    match = re.match(r"gemini-(\d+)", nombre)
    if match and int(match.group(1)) >= 3:
        return {"thinkingLevel": "low"}
    return None


# Errores en los que conviene probar con el modelo de respaldo: el modelo
# principal no respondió (saturado, límite de uso, caído, retirado o lento).
# Si el modelo sí respondió (imagen bloqueada, JSON inválido), no se reintenta.
CODIGOS_CON_RESPALDO = {AI_UNAVAILABLE, AI_RATE_LIMITED, AI_TIMEOUT}

# Parte del tiempo total que se le da al modelo principal cuando hay respaldo,
# para que al de respaldo le quede tiempo dentro del límite del RNF-34.
FRACCION_TIEMPO_PRINCIPAL = 0.6


class GeminiReceiptExtractor:
    nombre = "gemini"

    def __init__(
        self,
        api_key: str | None,
        model: str,
        timeout_seconds: float,
        fallback_model: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        respaldo = (fallback_model or "").strip()
        self.fallback_model = respaldo if respaldo and respaldo != model else None
        # Permite inyectar un transporte falso en los tests (sin red).
        self.transport = transport

    def _armar_pedido(
        self, model: str, imagen: bytes, mime_type: str, categorias: list[str]
    ) -> dict:
        generation_config: dict = {
            "responseMimeType": "application/json",
            "responseJsonSchema": construir_esquema_json(categorias),
            "temperature": 0,
        }
        razonamiento = _config_razonamiento(model)
        if razonamiento:
            generation_config["thinkingConfig"] = razonamiento

        return {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": base64.b64encode(imagen).decode("ascii"),
                            }
                        },
                        {"text": construir_prompt(categorias)},
                    ],
                }
            ],
            "generationConfig": generation_config,
        }

    async def extraer(self, imagen: bytes, mime_type: str, categorias: list[str]) -> dict:
        """Intenta con el modelo principal y, si no está disponible, con el de
        respaldo (RNF-30), sin superar entre ambos `timeout_seconds`."""
        if not self.api_key:
            logger.warning("GEMINI_API_KEY no configurada: no se puede escanear el comprobante")
            raise ReceiptScanError(MENSAJE_NO_DISPONIBLE, 503, AI_UNAVAILABLE)

        limite = time.monotonic() + self.timeout_seconds
        tiempo_principal = (
            self.timeout_seconds * FRACCION_TIEMPO_PRINCIPAL
            if self.fallback_model
            else self.timeout_seconds
        )

        try:
            return await self._llamar(self.model, imagen, mime_type, categorias, tiempo_principal)
        except ReceiptScanError as error:
            restante = limite - time.monotonic()
            if not self.fallback_model or error.code not in CODIGOS_CON_RESPALDO or restante < 1:
                raise
            logger.warning(
                "Modelo %s no disponible (%s): se usa el modelo de respaldo %s",
                self.model,
                error.code,
                self.fallback_model,
            )

        return await self._llamar(self.fallback_model, imagen, mime_type, categorias, restante)

    async def _llamar(
        self,
        model: str,
        imagen: bytes,
        mime_type: str,
        categorias: list[str],
        timeout_seconds: float,
    ) -> dict:
        url = GEMINI_URL.format(model=model)
        pedido = self._armar_pedido(model, imagen, mime_type, categorias)

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(timeout_seconds, connect=min(5.0, timeout_seconds)),
                transport=self.transport,
            ) as client:
                response = await client.post(
                    url,
                    headers={"x-goog-api-key": self.api_key},
                    json=pedido,
                )
        except httpx.TimeoutException:
            raise ReceiptScanError(MENSAJE_TIEMPO_AGOTADO, 504, AI_TIMEOUT)
        except httpx.HTTPError as error:
            logger.warning("Error de red al escanear comprobante con Gemini (%s): %s", model, error)
            raise ReceiptScanError(MENSAJE_NO_DISPONIBLE, 503, AI_UNAVAILABLE)

        if response.status_code == 429:
            raise ReceiptScanError(MENSAJE_LIMITE_USO, 429, AI_RATE_LIMITED)
        if response.status_code != 200:
            logger.warning(
                "Gemini (%s) respondió %s al escanear comprobante: %s",
                model,
                response.status_code,
                response.text[:300],
            )
            raise ReceiptScanError(MENSAJE_NO_DISPONIBLE, 503, AI_UNAVAILABLE)

        try:
            data = response.json()
        except ValueError:
            raise ReceiptScanError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)

        # Si el filtro de seguridad bloquea la imagen, no es un comprobante procesable.
        if (data.get("promptFeedback") or {}).get("blockReason"):
            raise ReceiptScanError(MENSAJE_NO_RECONOCIDO, 422, RECEIPT_NOT_RECOGNIZED)

        candidatos = data.get("candidates") or []
        if not candidatos:
            raise ReceiptScanError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)

        partes = (candidatos[0].get("content") or {}).get("parts") or []
        texto = "".join(
            parte.get("text", "") for parte in partes if not parte.get("thought")
        ).strip()

        try:
            resultado = json.loads(texto)
        except (TypeError, ValueError):
            logger.warning(
                "Gemini (%s) devolvió un texto que no es JSON al escanear comprobante", model
            )
            raise ReceiptScanError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)

        if not isinstance(resultado, dict):
            raise ReceiptScanError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)
        return resultado
