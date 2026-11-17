import logging

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user, id_usuario_ws
from app.db.session import get_db
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.schemas.notificacion import NotificacionRead
from app.services.websocket_manager import manager


router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket, token: str = Query(...)):
    # La validación usa una sesión corta en el threadpool: no frena el event loop y
    # ninguna conexión del pool queda tomada mientras el socket está abierto.
    id_usuario = await run_in_threadpool(id_usuario_ws, token)
    if id_usuario is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect_user(id_usuario, websocket)
    logger.info("Usuario %s conectado al socket de notificaciones", id_usuario)

    try:
        while True:
            # Mantenemos la conexión abierta escuchando por si el cliente envía un ping o mensaje
            await websocket.receive_json()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_user(id_usuario, websocket)


@router.get("", response_model=list[NotificacionRead])
def get_notifications(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[NotificacionRead]:

    notificaciones = db.scalars(
        select(Notificacion)
        .where(
            Notificacion.IdUsuario == current_user.IdUsuario
        )
        .order_by(
            Notificacion.FechaCreacion.desc()
        )
    ).all()

    return [
        NotificacionRead(
            id=notificacion.IdNotificacion,
            viajeId=notificacion.IdViaje,
            tipo=notificacion.Tipo,
            titulo=notificacion.Titulo,
            mensaje=notificacion.Mensaje,
            leida=notificacion.Leida,
            fechaCreacion=notificacion.FechaCreacion,
        )
        for notificacion in notificaciones
    ]


@router.patch("/{notificacion_id}/read", response_model=NotificacionRead)
def mark_notification_as_read(
    notificacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> NotificacionRead:

    notificacion = db.scalar(
        select(Notificacion).where(
            Notificacion.IdNotificacion == notificacion_id,
            Notificacion.IdUsuario == current_user.IdUsuario,
        )
    )

    if notificacion is None:
        raise HTTPException(
            status_code=404,
            detail="Notificación no encontrada",
        )

    notificacion.Leida = True

    db.commit()
    db.refresh(notificacion)

    return NotificacionRead(
        id=notificacion.IdNotificacion,
        viajeId=notificacion.IdViaje,
        tipo=notificacion.Tipo,
        titulo=notificacion.Titulo,
        mensaje=notificacion.Mensaje,
        leida=notificacion.Leida,
        fechaCreacion=notificacion.FechaCreacion,
    )


@router.patch("/read-all")
def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    result = db.execute(
        update(Notificacion)
        .where(
            Notificacion.IdUsuario == current_user.IdUsuario,
            Notificacion.Leida.is_(False),
        )
        .values(Leida=True)
    )

    db.commit()

    return {
        "mensaje": "Notificaciones marcadas como leídas",
        "cantidad": result.rowcount,
    }