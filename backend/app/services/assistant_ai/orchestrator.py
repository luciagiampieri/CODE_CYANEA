from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.accion_asistente_viaje import AccionAsistenteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.assistant_ai.context import build_trip_context
from app.services.assistant_ai.gemini import AssistantAIError, GeminiAssistantClient
from app.services.assistant_ai.mock import MockAssistantClient
from app.services.assistant_ai.schemas import (
    AssistantDecision,
    AssistantIntent,
    AssistantMessageResponse,
    AssistantSuggestedAction,
)
from app.services.assistant_ai.tools import dumps_payload, execute_assistant_action, loads_payload

logger = logging.getLogger(__name__)

_GENERIC_EXPENSE_NAMES = {
    "",
    "gasto",
    "gasto registrado",
    "gasto registrado por ia",
    "gasto del viaje",
    "nuevo gasto",
    "gasto sin monto en payload",
}

_GENERIC_ACTIVITY_NAMES = {
    "",
    "actividad",
    "nueva actividad",
    "actividad del viaje",
    "evento",
    "nuevo evento",
}


def get_assistant_client():
    provider = (settings.ai_assistant_provider or "").strip().lower()
    if provider == "mock":
        return MockAssistantClient()
    return GeminiAssistantClient(
        api_key=settings.gemini_api_key,
        model=settings.ai_assistant_model or settings.ai_receipt_model,
        fallback_model=settings.ai_assistant_fallback_model or settings.ai_receipt_fallback_model,
        timeout_seconds=settings.ai_assistant_timeout_seconds,
        verify_ssl=settings.gemini_verify_ssl,
    )


async def propose_or_answer(
    db: Session,
    *,
    viaje: Viaje,
    current_user: Usuario,
    message: str,
    conversation: list[dict] | None = None,
) -> AssistantMessageResponse:
    if not settings.ai_assistant_enabled:
        raise HTTPException(status_code=503, detail="El asistente IA no esta habilitado.")
    if not current_user.ConsienteAsistenteIA:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes aceptar el uso del asistente IA antes de continuar.",
            headers={"X-Error-Code": "AI_ASSISTANT_CONSENT_REQUIRED"},
        )

    context = build_trip_context(db, viaje, current_user)
    history = _normalize_conversation(conversation)
    if history:
        context["conversacionReciente"] = history

    try:
        raw = await get_assistant_client().decide(message, context)
        intent = _coerce_intent(raw)
    except (AssistantAIError, ValidationError, ValueError) as exc:
        logger.warning("Respuesta invalida del asistente IA: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="No se pudo obtener una respuesta valida del asistente.",
        ) from exc

    transcript = _conversation_text(history, message)

    if intent.intent == "respuesta":
        return AssistantMessageResponse(
            message=intent.response
            or intent.clarifyingQuestion
            or "Puedo ayudarte con el viaje. Decime que queres organizar."
        )

    payload = dict(intent.payload or {})
    payload.setdefault("_userMessage", transcript)

    missing_message = _missing_fields_message(intent)
    if missing_message:
        return AssistantMessageResponse(message=missing_message)

    validation_message = _validate_action_payload(intent.intent, payload)
    if validation_message:
        return AssistantMessageResponse(message=validation_message)

    action_id = str(uuid.uuid4())
    action = AssistantSuggestedAction(
        id=action_id,
        type=intent.intent,
        label=_action_label(intent.intent, payload),
        payload=payload,
    )

    db.add(
        AccionAsistenteViaje(
            IdAccionAsistente=action_id,
            IdViaje=viaje.IdViaje,
            IdUsuario=current_user.IdUsuario,
            Tipo=action.type,
            Estado="propuesta",
            Etiqueta=action.label[:150],
            PayloadJson=dumps_payload(action.payload),
        )
    )
    db.commit()

    return AssistantMessageResponse(
        message=_confirmation_message(intent.intent, payload),
        requiresConfirmation=True,
        suggestedAction=action,
    )


def _coerce_intent(raw: dict) -> AssistantIntent:
    if "intent" in raw:
        return AssistantIntent.model_validate(raw)

    # Transitional compatibility for older mocks/tests while providers migrate.
    legacy = AssistantDecision.model_validate(raw)
    if legacy.tipo != "accion" or legacy.accion is None:
        return AssistantIntent(
            intent="respuesta",
            confidence=0.5,
            payload={},
            response=legacy.mensaje,
        )
    return AssistantIntent(
        intent=legacy.accion.type,
        confidence=0.5,
        payload=legacy.accion.payload or {},
        response=legacy.mensaje,
    )


def _payload_text(payload: dict, *keys: str) -> str:
    normalized = {str(key).casefold(): value for key, value in payload.items()}
    for key in keys:
        value = normalized.get(key.casefold())
        if value not in (None, ""):
            return str(value).strip()
    return ""


def _normalize_conversation(conversation: list[dict] | None) -> list[dict[str, str]]:
    if not conversation:
        return []
    normalized = []
    for item in conversation[-12:]:
        role = str(item.get("role") or "").strip().lower()
        text = str(item.get("text") or "").strip()
        if role not in {"user", "assistant"} or not text:
            continue
        normalized.append({"role": role, "text": text[:700]})
    return normalized


def _conversation_text(history: list[dict[str, str]], message: str) -> str:
    parts = [f"{item['role']}: {item['text']}" for item in history]
    parts.append(f"user: {message}")
    return "\n".join(parts[-12:])


def _missing_fields_message(intent: AssistantIntent) -> str | None:
    missing = [str(item).strip() for item in intent.missingFields if str(item).strip()]
    if not missing:
        return None
    if intent.clarifyingQuestion:
        return intent.clarifyingQuestion
    return "Necesito que completes: " + ", ".join(missing) + "."


def _action_label(action_type: str, payload: dict) -> str:
    name = _payload_text(payload, "nombre", "Nombre", "titulo", "concepto")
    labels = {
        "crear_actividad": "Agregar actividad",
        "crear_checklist": "Crear tarea",
        "registrar_gasto": "Registrar gasto",
        "crear_votacion": "Crear votacion",
        "generar_ruta_dia": "Generar ruta",
    }
    base = labels.get(action_type, "Confirmar accion")
    return f"{base}: {name}"[:150] if name else base


def _confirmation_message(action_type: str, payload: dict) -> str:
    name = _payload_text(payload, "nombre", "Nombre", "titulo", "concepto")
    if action_type == "registrar_gasto":
        amount = _payload_text(payload, "monto", "MontoOriginal", "importe", "total")
        currency = _payload_text(payload, "moneda", "MonedaOriginal", "currency")
        suffix = f" por {amount} {currency}".rstrip() if amount else ""
        return f"Puedo registrar {name or 'el gasto'}{suffix}. Te pido confirmacion antes de guardarlo."
    if action_type == "crear_actividad":
        location = _payload_text(payload, "ubicacion", "lugar", "placeName", "location", "nombreLugar")
        suffix = f" en {location}" if location and location.casefold() not in (name or "").casefold() else ""
        return f"Puedo agregar {name or 'la actividad'}{suffix}. Te pido confirmacion antes de guardarlo."
    if action_type == "crear_checklist":
        return f"Puedo crear la tarea {name or 'indicada'}. Te pido confirmacion antes de guardarla."
    if action_type == "crear_votacion":
        return f"Puedo crear la votacion {name or 'indicada'}. Te pido confirmacion antes de guardarla."
    if action_type == "generar_ruta_dia":
        day = _payload_text(payload, "dayIndex", "dia", "numeroDia", "dayNumber")
        return f"Puedo generar la ruta del dia {day or 'indicado'}. Te pido confirmacion antes de guardarla."
    return "Puedo realizar la accion. Te pido confirmacion antes de continuar."


def _validate_action_payload(action_type: str, payload: dict) -> str | None:
    if action_type == "registrar_gasto":
        concept = _payload_text(payload, "nombre", "Nombre", "concepto", "titulo")
        amount = _payload_text(payload, "monto", "MontoOriginal", "Monto", "importe", "total", "valor", "amount")
        category = _payload_text(payload, "categoria", "categoriaGasto")
        category_id = _payload_text(payload, "idCategoria", "IdCategoria", "idCategoriaGasto")

        if concept.casefold() in _GENERIC_EXPENSE_NAMES:
            return "Decime el concepto del gasto para nombrarlo correctamente."
        if not category and not category_id:
            return "Decime la categoria del gasto o el concepto suficiente para clasificarlo."
        return None

    if action_type == "crear_actividad":
        name = _payload_text(payload, "nombre", "Nombre", "titulo", "actividad")
        location = _payload_text(payload, "ubicacion", "lugar", "placeName", "location", "nombreLugar")
        if name.casefold() in _GENERIC_ACTIVITY_NAMES and not location:
            return "Decime el nombre o descripcion de la actividad."
        return None

    if action_type == "crear_checklist":
        name = _payload_text(payload, "nombre", "Nombre", "titulo")
        if not name:
            return "Decime el nombre de la tarea."
        return None

    if action_type == "crear_votacion":
        name = _payload_text(payload, "nombre", "Nombre", "titulo")
        proposals = payload.get("propuestas") or []
        if not name:
            return "Decime el titulo de la votacion."
        if not isinstance(proposals, list) or len(proposals) < 2:
            return "Decime al menos dos opciones para la votacion."
        return None

    if action_type == "generar_ruta_dia":
        day = _payload_text(payload, "dayIndex", "dia", "numeroDia", "dayNumber", "dayId", "idDia")
        if not day:
            return "Decime para que dia queres generar la ruta."
        return None

    return None


async def confirm_action(
    db: Session,
    *,
    viaje: Viaje,
    current_user: Usuario,
    action_id: str,
) -> AssistantMessageResponse:
    action = db.get(AccionAsistenteViaje, action_id)
    if (
        action is None
        or action.IdViaje != viaje.IdViaje
        or action.IdUsuario != current_user.IdUsuario
    ):
        raise HTTPException(status_code=404, detail="Accion del asistente no encontrada.")
    if action.Estado != "propuesta":
        raise HTTPException(status_code=409, detail="La accion ya fue procesada.")

    result = await execute_assistant_action(
        db,
        viaje=viaje,
        current_user=current_user,
        action_type=action.Tipo,
        payload=loads_payload(action.PayloadJson),
    )
    action.Estado = "ejecutada"
    action.FechaConfirmacion = datetime.now(timezone.utc)
    action.ResultadoJson = json.dumps(result, ensure_ascii=False, default=str)
    db.commit()

    return AssistantMessageResponse(
        message=result.get("message") or "Accion ejecutada correctamente.",
        requiresConfirmation=False,
        suggestedAction=AssistantSuggestedAction(
            id=action.IdAccionAsistente,
            type=action.Tipo,
            label=action.Etiqueta,
            payload=loads_payload(action.PayloadJson),
        ),
        result=result,
    )
