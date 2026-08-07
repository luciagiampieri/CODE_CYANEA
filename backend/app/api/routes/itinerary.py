import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.usuario import Usuario

from app.services.websocket_manager import manager
from app.services.trip_access import get_trip_with_relations, require_trip_access


router = APIRouter()
logger = logging.getLogger(__name__)

router = APIRouter()

def _autenticar_ws(token: str, db: Session) -> Usuario | None:

    try:
        payload = decode_access_token(token)
    except JWTError:
        return None

    user_id = payload.get("user_id")
    if user_id is None:
        return None

    usuario = db.get(Usuario, user_id)
    if usuario is None or not usuario.Activo:
        return None

    return usuario


@router.websocket("/ws/trips/{trip_id}/itinerary")
async def itinerary_ws(websocket: WebSocket, trip_id: int, token: str = Query(...)):
    db = SessionLocal()
    try:
        current_user = _autenticar_ws(token, db)
        if current_user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        viaje = get_trip_with_relations(db, trip_id)
        try:
            require_trip_access(viaje, current_user)
        except Exception as exc:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await manager.connect(trip_id, websocket)
        logger.info("Usuario %s conectado al itinerario del viaje %s", current_user.IdUsuario, trip_id)

        try:
            while True:
                mensaje = await websocket.receive_json()

                if mensaje.get("tipo") == "iniciar_edicion":
                    activity_id = mensaje.get("idActividad")

                    edicion_concedida = await manager.iniciar_edicion(
                        trip_id,
                        activity_id,
                        current_user.IdUsuario,
                    )

                    if edicion_concedida:
                        await websocket.send_json({
                            "tipo": "edicion_concedida",
                            "idActividad": activity_id,
                        })
                    else:

                        usuario_editando_id = manager.obtener_usuario_editando(trip_id, activity_id)

                        usuario_editando = db.get(Usuario, usuario_editando_id) 

                        nombre_usuario = (
                            usuario_editando.Nombre if usuario_editando else "Otro usuario"
                        )

                        apellido_usuario = (
                            usuario_editando.Apellido if usuario_editando else ""
                        )

                        await websocket.send_json({
                            "tipo": "edicion_rechazada",
                            "idActividad": activity_id,
                            "mensaje": f"{nombre_usuario} {apellido_usuario} está editando esta actividad.",
                        })
                        
                elif mensaje.get("tipo") == "finalizar_edicion":
                    activity_id = mensaje.get("idActividad")

                    edicion_finalizada = await manager.finalizar_edicion(
                        trip_id,
                        activity_id,
                        current_user.IdUsuario,
                    )

                    if edicion_finalizada:
                        await manager.broadcast(
                            trip_id,
                            {
                                "tipo": "edicion_finalizada",
                                "idActividad": activity_id,
                            },
                        )

        except WebSocketDisconnect:
            pass
        finally:
            await manager.liberar_ediciones_usuario(current_user.IdUsuario)
            manager.disconnect(trip_id, websocket)
    finally:
        db.close()