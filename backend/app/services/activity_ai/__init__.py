from app.core.config import settings
from app.services.activity_ai.base import ActivitySuggester, SuggestionError
from app.services.activity_ai.gemini import GeminiActivitySuggester
from app.services.activity_ai.mock import MockActivitySuggester


def get_activity_suggester() -> ActivitySuggester:
    proveedor = (settings.ai_suggestions_provider or "").strip().lower()
    if proveedor == "mock":
        return MockActivitySuggester()
    return GeminiActivitySuggester(
        api_key=settings.gemini_api_key,
        model=settings.ai_suggestions_model or settings.ai_receipt_model,
        fallback_model=(
            settings.ai_suggestions_fallback_model or settings.ai_receipt_fallback_model
        ),
        timeout_seconds=settings.ai_suggestions_timeout_seconds,
    )


__all__ = [
    "ActivitySuggester",
    "GeminiActivitySuggester",
    "MockActivitySuggester",
    "SuggestionError",
    "get_activity_suggester",
]