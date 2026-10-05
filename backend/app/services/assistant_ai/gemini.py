from __future__ import annotations

import json
import logging
import re

import httpx

from app.services.assistant_ai.prompts import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


ASSISTANT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": [
                "respuesta",
                "crear_actividad",
                "crear_checklist",
                "registrar_gasto",
                "crear_votacion",
                "generar_ruta_dia",
            ],
        },
        "confidence": {"type": "number"},
        "payload": {"type": "object"},
        "missingFields": {"type": "array", "items": {"type": "string"}},
        "clarifyingQuestion": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "response": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    },
    "required": ["intent", "confidence", "payload", "missingFields"],
}


def _config_razonamiento(model: str) -> dict | None:
    nombre = model.lower().removeprefix("models/")
    if "2.5" in nombre:
        return {"thinkingBudget": 0}
    match = re.match(r"gemini-(\d+)", nombre)
    if match and int(match.group(1)) >= 3:
        return {"thinkingLevel": "low"}
    return None


class AssistantAIError(Exception):
    pass


class GeminiAssistantClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        timeout_seconds: float,
        fallback_model: str | None = None,
        verify_ssl: bool = True,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.fallback_model = fallback_model if fallback_model and fallback_model != model else None
        self.verify_ssl = verify_ssl
        self.transport = transport

    async def decide(self, message: str, context: dict) -> dict:
        if not self.api_key:
            raise AssistantAIError("GEMINI_API_KEY no configurada.")

        try:
            return await self._call(self.model, message, context)
        except AssistantAIError:
            if not self.fallback_model:
                raise
            logger.warning("Se usa modelo de respaldo para asistente IA: %s", self.fallback_model)
            return await self._call(self.fallback_model, message, context)

    async def _call(self, model: str, message: str, context: dict) -> dict:
        generation_config: dict = {
            "responseMimeType": "application/json",
            "responseJsonSchema": ASSISTANT_RESPONSE_SCHEMA,
            "temperature": 0.2,
        }
        razonamiento = _config_razonamiento(model)
        if razonamiento:
            generation_config["thinkingConfig"] = razonamiento

        payload = {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": build_user_prompt(message, context)}],
                }
            ],
            "generationConfig": generation_config,
        }

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout_seconds, connect=8.0),
                verify=self.verify_ssl,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    GEMINI_URL.format(model=model),
                    headers={"x-goog-api-key": self.api_key},
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise AssistantAIError("No se pudo conectar con el proveedor de IA.") from exc

        if response.status_code != 200:
            logger.warning(
                "Gemini asistente (%s) respondio %s: %s",
                model,
                response.status_code,
                response.text[:500],
            )
            raise AssistantAIError("El proveedor de IA no esta disponible.")

        try:
            data = response.json()
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(part.get("text", "") for part in parts if not part.get("thought")).strip()
            parsed = json.loads(_strip_json_fence(text))
        except Exception as exc:
            logger.warning("Gemini asistente (%s) devolvio JSON invalido: %s", model, text[:500])
            raise AssistantAIError("La IA devolvio una respuesta invalida.") from exc

        if not isinstance(parsed, dict):
            raise AssistantAIError("La IA devolvio una respuesta invalida.")
        return parsed


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()
