from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.usuario import Usuario
from app.services.assistant_ai import confirm_action, propose_or_answer
from app.services.assistant_ai.schemas import AssistantMessageRequest, AssistantMessageResponse
from app.services.trip_access import get_trip_with_relations, require_trip_access

router = APIRouter()


@router.post("/{trip_id}/assistant/messages", response_model=AssistantMessageResponse)
async def send_assistant_message(
    trip_id: int,
    payload: AssistantMessageRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> AssistantMessageResponse:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)

    if payload.confirmActionId:
        return await confirm_action(
            db,
            viaje=viaje,
            current_user=current_user,
            action_id=payload.confirmActionId,
        )

    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El mensaje no puede estar vacio.",
        )

    return await propose_or_answer(
        db,
        viaje=viaje,
        current_user=current_user,
        message=message,
        conversation=payload.conversation,
    )
