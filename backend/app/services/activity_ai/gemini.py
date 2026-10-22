"""Proveedor Gemini (Google AI Studio) para sugerir actividades (US 87).
"""
from __future__ import annotations
import json
import logging
import time
import httpx

from app.services.activity_ai.base import (
    AI_INVALID_RESPONSE,
    AI_RATE_LIMITED,
    AI_TIMEOUT,
    AI_UNAVAILABLE,
    MENSAJE_LIMITE_USO,
    MENSAJE_NO_DISPONIBLE,
    MENSAJE_RESPUESTA_INVALIDA,
    MENSAJE_TIEMPO_AGOTADO,
    SuggestionError,
)
from app.services.activity_ai.prompt import construir_esquema_json, construir_prompt
from app.services.receipt_ai.gemini import (
    CODIGOS_CON_RESPALDO,
    FRACCION_TIEMPO_PRINCIPAL,
    GEMINI_URL,
    _config_razonamiento,
)
from app.services.registro_ia import SERVICIO_SUGERENCIA_ACTIVIDADES, medir_solicitud_ia

logger = logging.getLogger(__name__)


class GeminiActivitySuggester:
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
        self.transport = transport

    def _armar_pedido(self, model: str, contexto: dict) -> dict:
        generation_config: dict = {
            "responseMimeType": "application/json",
            "responseJsonSchema": construir_esquema_json(contexto.get("cantidad_candidatas", 10)),
            "temperature": 0.6,
        }
        razonamiento = _config_razonamiento(model)
        if razonamiento:
            generation_config["thinkingConfig"] = razonamiento

        return {
            "contents": [{"role": "user", "parts": [{"text": construir_prompt(contexto)}]}],
            "generationConfig": generation_config,
        }

    async def sugerir(self, contexto: dict) -> dict:
        """Intenta con el modelo principal y, si no está disponible, con el de respaldo,
        sin superar entre ambos `timeout_seconds`."""
        if not self.api_key:
            logger.warning("GEMINI_API_KEY no configurada: no se pueden generar sugerencias")
            raise SuggestionError(MENSAJE_NO_DISPONIBLE, 503, AI_UNAVAILABLE)

        limite = time.monotonic() + self.timeout_seconds
        tiempo_principal = (
            self.timeout_seconds * FRACCION_TIEMPO_PRINCIPAL
            if self.fallback_model
            else self.timeout_seconds
        )

        try:
            return await self._llamar(self.model, contexto, tiempo_principal)
        except SuggestionError as error:
            restante = limite - time.monotonic()
            if not self.fallback_model or error.code not in CODIGOS_CON_RESPALDO or restante < 1:
                raise
            logger.warning(
                "Modelo %s no disponible (%s): se usa el modelo de respaldo %s",
                self.model,
                error.code,
                self.fallback_model,
            )

        return await self._llamar(self.fallback_model, contexto, restante)

    async def _llamar(self, model: str, contexto: dict, timeout_seconds: float) -> dict:
        with medir_solicitud_ia(SERVICIO_SUGERENCIA_ACTIVIDADES, model) as medicion:
            resultado = await self._llamar_gemini(model, contexto, timeout_seconds, medicion)
            medicion.exitosa = True
            return resultado

    async def _llamar_gemini(
        self, model: str, contexto: dict, timeout_seconds: float, medicion=None
    ) -> dict:
        url = GEMINI_URL.format(model=model)
        pedido = self._armar_pedido(model, contexto)

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(timeout_seconds, connect=min(5.0, timeout_seconds)),
                transport=self.transport,
            ) as client:
                response = await client.post(
                    url, headers={"x-goog-api-key": self.api_key}, json=pedido
                )
        except httpx.TimeoutException:
            raise SuggestionError(MENSAJE_TIEMPO_AGOTADO, 504, AI_TIMEOUT)
        except httpx.HTTPError as error:
            logger.warning("Error de red al pedir sugerencias a Gemini (%s): %s", model, error)
            raise SuggestionError(MENSAJE_NO_DISPONIBLE, 503, AI_UNAVAILABLE)

        if response.status_code == 429:
            raise SuggestionError(MENSAJE_LIMITE_USO, 429, AI_RATE_LIMITED)
        if response.status_code != 200:
            logger.warning(
                "Gemini (%s) respondió %s al pedir sugerencias: %s",
                model,
                response.status_code,
                response.text[:300],
            )
            raise SuggestionError(MENSAJE_NO_DISPONIBLE, 503, AI_UNAVAILABLE)

        try:
            data = response.json()
        except ValueError:
            raise SuggestionError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)
        if medicion is not None:
            medicion.usar_respuesta(data)

        if (data.get("promptFeedback") or {}).get("blockReason"):
            raise SuggestionError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)

        candidatos = data.get("candidates") or []
        if not candidatos:
            raise SuggestionError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)

        partes = (candidatos[0].get("content") or {}).get("parts") or []
        texto = "".join(p.get("text", "") for p in partes if not p.get("thought")).strip()

        try:
            resultado = json.loads(texto)
        except (TypeError, ValueError):
            logger.warning("Gemini (%s) devolvió un texto que no es JSON (sugerencias)", model)
            raise SuggestionError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)

        if not isinstance(resultado, dict):
            raise SuggestionError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)
        return resultado