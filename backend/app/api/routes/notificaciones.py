import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.schemas.notificacion import NotificacionRead

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from jose import JWTError
from app.services.websocket_manager import manager


router = APIRouter()
logger = logging.getLogger(__name__)

def _autenticar_ws(token: str, db: Session) -> Usuario | None:
    try:
        payload = decode_access_token(token)
    except JWTError as e:
        logger.error("Error decodificando token en WS: %s", e) # 👈 Agregá esto
        return None

    user_id = payload.get("user_id")
    if user_id is None:
        logger.error("El token no contiene user_id") # 👈 Agregá esto
        return None

    usuario = db.get(Usuario, user_id)
    if usuario is None or not usuario.Activo:
        logger.error("Usuario no encontrado o inactivo") # 👈 Agregá esto
        return None

    return usuario

@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket, token: str = Query(...)):
    db = SessionLocal()
    try:
        current_user = _autenticar_ws(token, db)
        if current_user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await manager.connect_user(current_user.IdUsuario, websocket)
        logger.info("Usuario %s conectado al socket de notificaciones", current_user.IdUsuario)

        try:
            while True:
                # Mantenemos la conexión abierta escuchando por si el cliente envía un ping o mensaje
                await websocket.receive_json()
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect_user(current_user.IdUsuario, websocket)
    finally:
        db.close()


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