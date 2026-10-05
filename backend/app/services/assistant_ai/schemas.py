from typing import Literal

from pydantic import BaseModel, Field


AssistantActionType = Literal[
    "crear_actividad",
    "crear_checklist",
    "registrar_gasto",
    "crear_votacion",
    "generar_ruta_dia",
]

AssistantIntentType = Literal[
    "respuesta",
    "crear_actividad",
    "crear_checklist",
    "registrar_gasto",
    "crear_votacion",
    "generar_ruta_dia",
]


class AssistantSuggestedAction(BaseModel):
    id: str | None = None
    type: AssistantActionType
    label: str
    payload: dict = Field(default_factory=dict)


class AssistantMessageRequest(BaseModel):
    message: str = Field(default="", max_length=1200)
    confirmActionId: str | None = None
    conversation: list[dict] = Field(default_factory=list, max_length=12)


class AssistantMessageResponse(BaseModel):
    message: str
    requiresConfirmation: bool = False
    suggestedAction: AssistantSuggestedAction | None = None
    result: dict | None = None


class AssistantDecision(BaseModel):
    tipo: Literal["respuesta", "accion"] = "respuesta"
    mensaje: str
    accion: AssistantSuggestedAction | None = None


class AssistantIntent(BaseModel):
    intent: AssistantIntentType = "respuesta"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    payload: dict = Field(default_factory=dict)
    missingFields: list[str] = Field(default_factory=list)
    clarifyingQuestion: str | None = None
    response: str | None = None
